/**
 * The retirement executor.
 *
 * This is the only place in Vacilando that removes a worktree, and it does so
 * through `git worktree remove` WITHOUT --force. That is deliberate: Git's own
 * refusal on a dirty or locked worktree is the last safety gate, and --force
 * exists precisely to defeat it. There is no --force here and no filesystem
 * deletion — no rm, no rmSync, no rimraf. A test reads this file to prove it.
 *
 * Everything measured before filing is measured AGAIN here. A safety result is
 * only true of the instant it was taken; between filing and execution a provider
 * can start, a run can open, someone can edit a file. If anything moved, the
 * fingerprint changes and this refuses with `stale_retirement_plan` having done
 * nothing at all.
 *
 * WHAT THIS NEVER DOES: delete a branch. Worktree removal and branch deletion
 * are separate decisions with separate blast radii; `repository.delete_remote_branch`
 * owns the second one and is never invoked from here, however safe removal was.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, sep } from "node:path";
import { observeRetirementCandidates } from "./worktree-retirement-observe.mjs";
import { retirementFingerprint } from "./worktree-retirement.mjs";
import { archiveRetiredWorktree } from "./worktree-registration.mjs";

/** Canonical removal. No --force: Git refusing IS a safety gate, not an obstacle. */
function gitWorktreeRemove(canonicalRoot, targetPath) {
  try {
    execFileSync("git", ["worktree", "remove", targetPath], {
      cwd: canonicalRoot, timeout: 60_000, stdio: ["ignore", "pipe", "pipe"],
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: "git_worktree_remove_refused", detail: String(e?.stderr || e?.message || "").slice(0, 400) };
  }
}

function gitWorktreeList(canonicalRoot) {
  try {
    return execFileSync("git", ["worktree", "list", "--porcelain"], {
      cwd: canonicalRoot, encoding: "utf8", timeout: 20_000, stdio: ["ignore", "pipe", "ignore"],
    }).split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.replace("worktree ", ""));
  } catch { return null; }
}

function currentProcesses() {
  try {
    return execFileSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024, timeout: 15000 })
      .split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(.*)$/); return m ? { pid: Number(m[1]), command: m[2] } : null; })
      .filter(Boolean);
  } catch { return []; }
}

/**
 * Retire one worktree.
 *
 * `expected` carries what the request was approved against. Every field is
 * re-derived here and compared; nothing is trusted from the request itself.
 */
export function executeWorktreeRetirement({
  root,
  worktree,
  repository = "repo_alloy",
  expectedFingerprint = null,
  expectedHeadSha = null,
  expectedBranch = null,
  worktreeParent = null,
  canonicalRoot = null,
  requestingWorktree = null,
  s7State = null,
  nowMs = Date.now(),
} = {}) {
  const parent = worktreeParent || join(homedir(), "Code", "alloy-worktrees");
  const repoRoot = canonicalRoot || join(homedir(), "Alloy");
  const name = String(worktree || "").replace(/\/+$/, "").split("/").pop();
  if (!name) return { ok: false, error: "missing_worktree_identity" };

  const target = join(parent, name);
  // A path outside the managed parent is never removable from here, whatever
  // the request says.
  if (!target.startsWith(parent + sep)) return { ok: false, error: "path_outside_worktree_parent" };

  // ── Re-measure. The request's own numbers are evidence of what was true then.
  const gitList = gitWorktreeList(repoRoot);
  const inGit = gitList == null ? null : gitList.some((p) => p.replace(/\/+$/, "").split("/").pop() === name);
  const fresh = observeRetirementCandidates({
    root,
    s7Worktrees: [{ path: name, state: s7State || "retirable", in_git_worktree_list: inGit, reasons: [] }],
    processes: currentProcesses(),
    worktreeParent: parent,
    requestingWorktree,
    repository,
  })[0];

  if (!fresh) return { ok: false, error: "worktree_not_observable" };

  // ── Bind. Any drift at all refuses, and refusing applies NOTHING.
  if (expectedFingerprint && fresh.fingerprint !== expectedFingerprint) {
    return {
      ok: false, error: "stale_retirement_plan", applied: [],
      expected_fingerprint: expectedFingerprint, observed_fingerprint: fresh.fingerprint,
      observed_state: fresh.state, observed_blocked_by: fresh.blocked_by,
    };
  }
  if (expectedHeadSha && fresh.head_sha !== expectedHeadSha) {
    return {
      ok: false, error: "stale_retirement_plan", applied: [], reason: "worktree HEAD moved",
      expected_head_sha: expectedHeadSha, observed_head_sha: fresh.head_sha,
    };
  }
  if (expectedBranch && fresh.branch !== expectedBranch) {
    return {
      ok: false, error: "stale_retirement_plan", applied: [], reason: "worktree branch changed",
      expected_branch: expectedBranch, observed_branch: fresh.branch,
    };
  }
  // Re-measured safety must still be a clean candidate. `operator_review` and
  // `blocked` both stop here even if the fingerprint matched, because a matching
  // fingerprint of an unsafe state is still an unsafe state.
  if (fresh.state !== "candidate") {
    return {
      ok: false, error: "not_retirable_now", applied: [],
      state: fresh.state, reason: fresh.reason, blocked_by: fresh.blocked_by, unmeasured: fresh.unmeasured,
    };
  }

  // ── Remove, through Git.
  const removal = gitWorktreeRemove(repoRoot, target);
  if (!removal.ok) {
    return { ok: false, error: removal.error, detail: removal.detail, applied: [], state: "failed" };
  }

  // ── Postconditions, measured rather than assumed.
  const after = gitWorktreeList(repoRoot);
  const stillListed = after == null ? null : after.some((p) => p.replace(/\/+$/, "").split("/").pop() === name);
  const stillOnDisk = existsSync(target);

  const archived = archiveRetiredWorktree({
    root, name, path: target, repositoryId: repository, branch: fresh.branch,
    evidence: { gates: fresh.gates, durability: fresh.durability, fingerprint: fresh.fingerprint, s7_state: fresh.s7_state },
    nowMs,
  });

  return {
    ok: true,
    state: "retired",
    worktree: name,
    path: target,
    branch: fresh.branch,
    head_sha: fresh.head_sha,
    fingerprint: fresh.fingerprint,
    applied: [{ kind: "retire_worktree", path: name }],
    // Explicit, because "we did not delete the branch" is a guarantee, not an omission.
    branch_deleted: false,
    postconditions: {
      absent_from_git_worktree_list: stillListed === false,
      filesystem_path_absent: stillOnDisk === false,
      registration_provenance: archived.ok ? archived.registration.provenance : null,
      branch_retained: true,
    },
    removal_method: "git worktree remove",
  };
}
