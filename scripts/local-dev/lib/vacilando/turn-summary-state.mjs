/**
 * CANONICAL STATE FOR A TURN SUMMARY.
 *
 * Part 9 of the contract: the summary must not become another free-form agent
 * report. Where a fact has a canonical owner, the summary reads it from that
 * owner rather than from the provider's memory of it.
 *
 * This matters more than it sounds. Every wrong sha in a status report so far
 * has been a fact the provider retyped from earlier in its own context — and a
 * summary is precisely the document people trust without checking. Narrative
 * may summarise; branch, HEAD, staging, toolkit and run state may not be typed
 * by hand.
 *
 * Kept apart from turn-summary.mjs deliberately: that module is pure and
 * testable without a filesystem, and it should stay that way. This one is the
 * only part that touches git, the run store and the host.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { convergenceStatus } from "./toolkit-convergence.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT
  || join(homedir(), ".local", "state", "alloy-dev", "gateway");

function git(args, cwd) {
  try {
    return String(execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })).trim();
  } catch {
    return null;
  }
}

/** Branch, HEAD and how far the branch sits from its base — from git, not memory. */
export function gitTruth(worktreePath = process.cwd()) {
  const head = git(["rev-parse", "HEAD"], worktreePath);
  const branch = git(["rev-parse", "--abbrev-ref", "HEAD"], worktreePath);
  const staging = git(["rev-parse", "origin/staging"], worktreePath);
  const counts = git(["rev-list", "--left-right", "--count", "origin/staging...HEAD"], worktreePath);
  const [behind, ahead] = counts ? counts.split(/\s+/).map(Number) : [null, null];
  const porcelain = git(["status", "--porcelain"], worktreePath);
  return {
    branch,
    head,
    head_short: head ? head.slice(0, 9) : null,
    staging_sha: staging,
    staging_short: staging ? staging.slice(0, 12) : null,
    ahead,
    behind,
    dirty: porcelain == null ? null : porcelain.split("\n").filter((l) => l.trim() && !l.startsWith("??")).length > 0,
  };
}

/** Run state from the run store, never from what the provider believes it filed. */
export function runTruth(runId, { root = RUNTIME_ROOT } = {}) {
  try {
    const store = JSON.parse(readFileSync(join(root, "vacilando", "execution-runs", "runs.json"), "utf8"));
    for (const lane of Object.values(store.lanes || {})) {
      const runs = Array.isArray(lane) ? lane : lane.runs || [];
      for (const r of runs) {
        if (r?.run_id === runId) return { run_id: r.run_id, lane_id: r.lane_id, state: r.state };
      }
    }
  } catch { /* fall through */ }
  return { run_id: runId, lane_id: null, state: null };
}

/**
 * Governed requests still awaiting a decision.
 *
 * A summary that says "nothing is blocked" while an approval sits unanswered
 * is the specific lie this reads the store to prevent.
 */
export function pendingGovernedTruth({ root = RUNTIME_ROOT } = {}) {
  try {
    const store = JSON.parse(readFileSync(join(root, "vacilando", "governed-actions", "requests.json"), "utf8"));
    const rows = Array.isArray(store.requests) ? store.requests : Object.values(store.requests || {});
    return rows
      .filter((r) => !["complete", "failed"].includes(r.status))
      .map((r) => ({ request_id: r.request_id, action_key: r.action_key, status: r.status, title: r.title }));
  } catch {
    return [];
  }
}

/**
 * Assemble the `current_state` bullets and the lifecycle stages that can be
 * proven right now.
 *
 * Lifecycle is DERIVED, not asserted. `committed` follows from HEAD existing,
 * `pushed` from the branch not being ahead of its remote, `installed` from the
 * toolkit actually matching staging. The provider does not get to claim a stage
 * the host disagrees with — which is the whole point of Part 7.
 */
export function collectCanonicalState({
  runId = null,
  worktreePath = process.cwd(),
  root = RUNTIME_ROOT,
  remoteAhead = null,
} = {}) {
  const g = gitTruth(worktreePath);
  const conv = convergenceStatus({
    ownerPath: join(root, "vacilando", "control-plane-owner.json"),
  });
  const run = runId ? runTruth(runId, { root }) : null;
  const pending = pendingGovernedTruth({ root });

  const unpushed = remoteAhead == null ? g.ahead : remoteAhead;

  // THE LIFECYCLE DESCRIBES THIS WORK, NOT THE HOST. The first cut appended
  // `installed` whenever the toolkit was converged, which produced
  // implemented → committed → installed on a branch with six unpushed commits:
  // a claim that the work was running when it had not even left the worktree.
  // The toolkit being current says nothing about whether THIS branch is in it.
  //
  // So `installed` is asked as a question about the commit — is HEAD an
  // ancestor of the sha the installed toolkit was built from — and the stages
  // are emitted as a contiguous prefix, because a gap in the chain is not a
  // lifecycle, it is two unrelated facts printed next to each other.
  const installedSourceSha = conv.installed_sha
    ? git(["rev-parse", `${conv.installed_sha}^{commit}`], worktreePath)
    : null;
  const headIsInstalled = installedSourceSha && g.head
    ? git(["merge-base", "--is-ancestor", g.head, installedSourceSha], worktreePath) !== null
    : false;

  const satisfied = {
    implemented: Boolean(g.head),
    committed: Boolean(g.head),
    pushed: unpushed === 0,
    // Neither is measurable from the worktree alone; unmeasured is not claimed.
    pr_open: false,
    merged: headIsInstalled,
    installed: headIsInstalled && conv.converged,
    live_certified: false,
  };
  const lifecycle = [];
  for (const stage of ["implemented", "committed", "pushed", "pr_open", "merged", "installed", "live_certified"]) {
    if (!satisfied[stage]) break;
    lifecycle.push(stage);
  }

  const current_state = [
    g.branch ? `branch ${g.branch} @ ${g.head_short}${unpushed ? ` (${unpushed} unpushed)` : ""}` : null,
    g.staging_short ? `staging ${g.staging_short}` : null,
    conv.headline,
    run?.state ? `run ${run.run_id} ${run.state}` : null,
    pending.length ? `${pending.length} governed request(s) awaiting a decision` : null,
  ].filter(Boolean);

  return { current_state, lifecycle, git: g, convergence: conv, run, pending };
}
