/**
 * Measure the retirement safety gates against real host state.
 *
 * Split from the contract so the contract stays pure and testable, and split
 * from the executor so the executor can be proven to contain no discovery of
 * its own — it re-measures through THIS module and refuses on any drift.
 *
 * Everything unreadable stays null. Null blocks. The one thing this module may
 * never do is convert an absence of evidence into a passing gate.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyBranchDurability, evaluateRetirementSafety, retirementFingerprint } from "./worktree-retirement.mjs";
import { executionRunStorePath } from "./execution-run.mjs";
import { governedActionStorePath } from "./governed-action-request.mjs";
import { developmentLaneStorePath } from "./development-lane.mjs";
import { resolveWorktreeRegistration } from "./worktree-registration.mjs";

const TERMINAL_RUN = new Set(["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"]);
const TERMINAL_ACTION = new Set(["complete", "completed", "failed", "denied", "cancelled", "expired"]);

/**
 * Untracked paths that a rebuild reproduces. Anything not on this list is
 * treated as irreproducible — the list is an allowlist precisely because the
 * failure mode of guessing wrong is deleting the only copy of something.
 */
const REPRODUCIBLE = [
  /(^|\/)node_modules(\/|$)/, /(^|\/)\.next(\/|$)/, /(^|\/)dist(\/|$)/, /(^|\/)build(\/|$)/,
  /(^|\/)coverage(\/|$)/, /(^|\/)\.turbo(\/|$)/, /(^|\/)\.DS_Store$/, /(^|\/)playwright-report(\/|$)/,
  /(^|\/)test-results(\/|$)/, /\.log$/, /(^|\/)\.vercel(\/|$)/,
];

function git(args, cwd, { timeout = 15000 } = {}) {
  try {
    return execFileSync("git", args, { cwd, encoding: "utf8", timeout, stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
}

function gitOk(args, cwd, { timeout = 15000 } = {}) {
  try { execFileSync("git", args, { cwd, timeout, stdio: "ignore" }); return true; } catch { return false; }
}

/** Non-terminal Execution Runs, keyed by worktree leaf name. */
export function activeRunsByWorktree(root) {
  const out = {};
  try {
    const p = executionRunStorePath(root);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    for (const v of Object.values(j.lanes || {})) {
      const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
      for (const r of rs) {
        if (!r || TERMINAL_RUN.has(String(r.state).toUpperCase()) || !r.worktree_path) continue;
        (out[String(r.worktree_path).replace(/\/+$/, "").split("/").pop()] ||= []).push({ run_id: r.run_id, state: r.state });
      }
    }
    return out;
  } catch { return null; }
}

/** Non-terminal governed actions, keyed by worktree leaf name. */
export function activeGovernedActionsByWorktree(root) {
  const out = {};
  try {
    const p = governedActionStorePath(root);
    if (!existsSync(p)) return null;
    const db = JSON.parse(readFileSync(p, "utf8"));
    const rows = (Array.isArray(db) ? db : (db.requests || db.records || Object.values(db).find(Array.isArray) || []))
      .filter(Boolean);
    for (const r of rows) {
      if (TERMINAL_ACTION.has(String(r.status || "").toLowerCase())) continue;
      const wt = r.worktree_path || r.inputs?.worktreePath;
      if (!wt) continue;
      (out[String(wt).replace(/\/+$/, "").split("/").pop()] ||= []).push({ request_id: r.request_id, status: r.status });
    }
    return out;
  } catch { return null; }
}

/** Lanes still bound to a worktree, keyed by worktree leaf name. */
export function activeLanesByWorktree(root) {
  const out = {};
  try {
    const p = developmentLaneStorePath(root);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const lanes = Array.isArray(j) ? j : (j.lanes ? Object.values(j.lanes) : Object.values(j).find(Array.isArray) || []);
    for (const l of lanes.filter(Boolean)) {
      const wt = l.worktree_path || l.worktree || null;
      if (!wt) continue;
      const state = String(l.state || l.status || "").toLowerCase();
      if (["closed", "archived", "finished", "retired"].includes(state)) continue;
      (out[String(wt).replace(/\/+$/, "").split("/").pop()] ||= []).push({ lane_id: l.lane_id || l.id, state: state || "open" });
    }
    return out;
  } catch { return null; }
}

/** Measure git reality for one worktree: dirty, untracked, HEAD, branch, durability. */
export function measureWorktreeGit(fullPath, { canonicalBase = "origin/staging" } = {}) {
  if (!existsSync(fullPath)) {
    return { readable: false, dirty_paths: null, untracked: null, head_sha: null, branch: null, durability: null };
  }
  const porcelain = git(["status", "--porcelain"], fullPath);
  if (porcelain === null) {
    return { readable: false, dirty_paths: null, untracked: null, head_sha: null, branch: null, durability: null };
  }
  const lines = porcelain.split("\n").map((l) => l.trim()).filter(Boolean);
  const untracked = lines.filter((l) => l.startsWith("??")).map((l) => l.slice(2).trim());
  const dirty = lines.filter((l) => !l.startsWith("??"));
  const headSha = git(["rev-parse", "HEAD"], fullPath);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], fullPath);

  const mergedIntoCanonical = headSha ? gitOk(["merge-base", "--is-ancestor", headSha, canonicalBase], fullPath) : null;
  let remoteHeadSha = null;
  let containedInRemoteBranch = null;
  let aheadOfRemote = null;
  if (branch && branch !== "HEAD") {
    remoteHeadSha = git(["rev-parse", `origin/${branch}`], fullPath);
    if (remoteHeadSha) {
      // Contained in its OWN remote branch. Distinct from being contained in the
      // canonical branch, which is what `mergedIntoCanonical` measures.
      containedInRemoteBranch = headSha ? gitOk(["merge-base", "--is-ancestor", headSha, `origin/${branch}`], fullPath) : null;
      const count = git(["rev-list", "--count", `origin/${branch}..HEAD`], fullPath);
      aheadOfRemote = count == null ? null : Number(count) > 0;
    } else if (mergedIntoCanonical === false) {
      // No remote branch at all and not contained in the canonical branch: the
      // commits exist only here.
      aheadOfRemote = true;
    }
  }
  const durability = classifyBranchDurability({
    headSha, remoteHeadSha, containedInRemoteBranch, mergedIntoCanonical, aheadOfRemote,
  });
  return {
    readable: true,
    dirty_paths: dirty,
    untracked,
    untracked_reproducible: untracked.length === 0 ? true : untracked.every((u) => REPRODUCIBLE.some((re) => re.test(u))),
    head_sha: headSha,
    branch: branch === "HEAD" ? null : branch,
    durability,
    remote_head_sha: remoteHeadSha,
  };
}

/**
 * Evaluate every worktree S7 knows about, returning a full measured safety
 * result per worktree plus its binding fingerprint.
 *
 * `s7Worktrees` comes from the S7 observation so the two subsystems agree on
 * what exists; retirement never discovers a worktree S7 has not classified.
 */
export function observeRetirementCandidates({
  root,
  s7Worktrees = [],
  processes = [],
  worktreeParent = null,
  requestingWorktree = null,
  repository = "repo_alloy",
  canonicalBase = "origin/staging",
  operatorHold = false,
  governanceException = false,
} = {}) {
  const parent = worktreeParent || join(homedir(), "Code", "alloy-worktrees");
  const runs = activeRunsByWorktree(root);
  const actions = activeGovernedActionsByWorktree(root);
  const lanes = activeLanesByWorktree(root);

  return s7Worktrees.map((w) => {
    const name = w.path;
    const full = join(parent, name);
    const g = measureWorktreeGit(full, { canonicalBase });
    // OCCUPANCY IS A PATH, NOT A WORD.
    //
    // This matched any command whose text merely CONTAINED the worktree name,
    // so `vac worktree-retire wt1-drawer-product-eradication --apply` counted
    // its own argv as two live providers and the worktree blocked itself. The
    // same shape as a governed request that reads its own branch name out of a
    // run instruction and calls it a reference. Naming a thing is not using it.
    //
    // A process occupies a worktree when it references the worktree's PATH, and
    // never when it is this process or the shell that spawned it.
    const selfPids = new Set([process.pid, process.ppid].filter(Boolean));
    const refs = processes.filter((p) => {
      if (selfPids.has(p.pid)) return false;
      const c = String(p.command || "");
      return c.includes(full) || c.includes(`alloy-worktrees/${name}`);
    });
    const providers = refs.map((p) => ({ pid: p.pid }));
    // A dev server is a process actually serving from that path — measured here
    // rather than inferred from S7's lifecycle state, which calls a worktree
    // "active" for any live reference at all.
    const devServer = refs.some((p) => /next[- ](dev|start|server)/.test(String(p.command || "")));
    const registration = resolveWorktreeRegistration({ root, name, repositoryId: repository });

    const safety = evaluateRetirementSafety({
      path: name,
      branch: g.branch,
      headSha: g.head_sha,
      existsInGit: w.in_git_worktree_list,
      liveProviders: providers,
      liveDevServer: devServer,
      activeRuns: runs ? (runs[name] || []) : null,
      activeGovernedActions: actions ? (actions[name] || []) : null,
      activeLanes: lanes ? (lanes[name] || []) : null,
      dirtyPaths: g.dirty_paths,
      untrackedPaths: g.untracked,
      untrackedReproducible: g.untracked_reproducible,
      durability: g.durability,
      requestingWorktree,
      operatorHold,
      governanceException,
    });

    return {
      ...safety,
      s7_state: w.state,
      provenance: registration.provenance,
      managed: registration.managed === true,
      fingerprint: retirementFingerprint({
        repository, path: name, branch: g.branch, headSha: g.head_sha, safety, s7State: w.state,
      }),
    };
  });
}
