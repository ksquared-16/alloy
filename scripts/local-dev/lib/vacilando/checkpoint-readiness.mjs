/**
 * Checkpoint readiness — an ANSWER, not an action.
 *
 * THE INCIDENT. In wt5-runtime-performance-ux-completion,
 * `vac run-status --checkpoint-ready …` created a Git commit whose message was
 * the status summary, and swept roughly 67 unrelated dirty files into the lane
 * branch. Twice, across two runs, repaired by hand both times. The path was:
 *
 *   vac run-status --checkpoint-ready
 *     → reportRunState() sets run.checkpoint_ready = true
 *     → afterCheckpointReport()
 *     → source-control.maybeCreateCheckpoint({ origin: "agent", summary })
 *     → alloy-dev-adapter.commitWorktreeCheckpoint()
 *     → git -C <worktree> add -A  &&  git commit -m "<the status summary>"
 *
 * Two things made it inevitable rather than unlucky. `git add -A` at the
 * worktree root cannot express "the files this run touched" — it means every
 * dirty file, always. And the gate meant to require explicitness,
 * `requireExplicit && !run.checkpoint_ready`, was satisfied by the very flag the
 * same call had just set, so it never refused anything on this path.
 *
 * WHAT REPLACES IT. Reporting run state is read-only. This module inspects the
 * worktree, compares it against the baseline captured when the run began, and
 * says whether a future EXPLICIT checkpoint would be safe. It writes its verdict
 * to the Execution Run and touches nothing else. Creating a commit is a separate,
 * separately authorized operation with a path manifest — see checkpoint-create.
 *
 * ATTRIBUTION DEFAULTS TO FOREIGN. A file that was already dirty when the run
 * started is not this run's to commit, and neither is a file that appeared with
 * no baseline to compare against. Silence is never treated as ownership: with no
 * baseline, NOTHING is owned, and readiness is false with a reason that says so.
 */
import {
  allDirtyPaths,
  boundedSnapshot,
  readWorktreeGitState,
  snapshotPathSet,
  snapshotTruncated,
} from "./git-worktree-state.mjs";

export const CHECKPOINT_READINESS_SCHEMA = "vacilando.checkpoint_readiness.v1";

/** How many paths a readiness result will name before it stops listing. */
export const REPORTED_PATH_LIMIT = 25;

export const READINESS_REASONS = Object.freeze({
  READY: "ready",
  CLEAN: "nothing_to_checkpoint",
  FOREIGN: "foreign_dirty_files",
  NO_BASELINE: "no_run_baseline",
  CONFLICT: "worktree_conflict",
  UNREADABLE: "git_unreadable",
  MOVED_HEAD: "head_moved_since_baseline",
  BASELINE_TRUNCATED: "baseline_truncated",
});

function bound(list, limit = REPORTED_PATH_LIMIT) {
  const arr = Array.isArray(list) ? list : [];
  return {
    paths: arr.slice(0, limit).map(String),
    count: arr.length,
    truncated: arr.length > limit,
  };
}

/**
 * Split what is dirty now into what this run owns and what it does not.
 *
 * Ownership is positive evidence only: a path is owned when it is dirty now and
 * was NOT dirty at run start. Everything else — pre-existing dirt, anything at
 * all when there is no baseline — is foreign.
 */
export function attributeDirtyPaths(current, baseline) {
  const now = allDirtyPaths(current);
  if (!baseline) {
    // No baseline is not "nothing was dirty". It is "we cannot tell", and the
    // safe reading of "cannot tell" is that none of it belongs to this run.
    return { owned: [], foreign: now, attributable: false };
  }
  const before = snapshotPathSet(baseline);
  const owned = now.filter((p) => !before.has(p));
  const foreign = now.filter((p) => before.has(p));
  return { owned, foreign, attributable: !snapshotTruncated(baseline) };
}

/**
 * Is this worktree safe for an explicit checkpoint right now?
 *
 * Pure: it reads Git and returns a verdict. Persisting the verdict is the
 * caller's job, and even that touches only the Execution Run record.
 */
export async function evaluateCheckpointReadiness({
  worktreePath,
  baseline = null,
  runId = null,
  laneId = null,
  readState = readWorktreeGitState,
} = {}) {
  const base = {
    schema_version: CHECKPOINT_READINESS_SCHEMA,
    checkpoint_ready: false,
    run_id: runId || null,
    lane_id: laneId || null,
    worktree_path: worktreePath || null,
    head: null,
    branch: null,
    staged_count: 0,
    unstaged_count: 0,
    untracked_count: 0,
    owned: bound([]),
    foreign: bound([]),
    // Stated on every result so a reader never has to infer it from silence.
    mutations_performed: "none",
  };

  const state = await readState(worktreePath);
  if (!state?.ok) {
    return { ...base, reason: READINESS_REASONS.UNREADABLE, detail: state?.error || "git_unreadable" };
  }

  const out = {
    ...base,
    head: state.head,
    branch: state.branch,
    staged_count: state.staged.length,
    unstaged_count: state.unstaged.length,
    untracked_count: state.untracked.length,
  };

  if (state.conflict) {
    return { ...out, reason: READINESS_REASONS.CONFLICT, foreign: bound(state.conflicted) };
  }

  const { owned, foreign, attributable } = attributeDirtyPaths(state, baseline);
  out.owned = bound(owned);
  out.foreign = bound(foreign);

  if (!state.dirty) {
    return { ...out, reason: READINESS_REASONS.CLEAN };
  }
  if (!baseline) {
    return { ...out, reason: READINESS_REASONS.NO_BASELINE };
  }
  if (!attributable) {
    // The baseline was clipped, so "not in the baseline" no longer proves "new".
    return { ...out, reason: READINESS_REASONS.BASELINE_TRUNCATED };
  }
  if (baseline.head && state.head !== baseline.head) {
    // The branch moved under the run. Its baseline describes a different commit,
    // so attribution against it is no longer sound.
    return { ...out, reason: READINESS_REASONS.MOVED_HEAD, baseline_head: baseline.head };
  }
  if (foreign.length) {
    return { ...out, reason: READINESS_REASONS.FOREIGN };
  }
  if (!owned.length) {
    return { ...out, reason: READINESS_REASONS.CLEAN };
  }
  return { ...out, checkpoint_ready: true, reason: READINESS_REASONS.READY };
}

/**
 * Capture the Git baseline for a run.
 *
 * ATTRIBUTION EVIDENCE, NOT PERMISSION. Recording that a file was dirty when the
 * run started is what lets a later checkpoint refuse it. It never authorizes
 * touching it.
 */
export async function captureRunGitBaseline({
  worktreePath,
  repositoryId = null,
  laneId = null,
  nowMs = Date.now(),
  readState = readWorktreeGitState,
} = {}) {
  const state = await readState(worktreePath);
  if (!state?.ok) return { ok: false, error: state?.error || "git_unreadable" };
  return {
    ok: true,
    baseline: {
      schema_version: "vacilando.run_git_baseline.v1",
      repository_id: repositoryId || null,
      lane_id: laneId || null,
      captured_at: new Date(nowMs).toISOString(),
      ...boundedSnapshot(state),
    },
  };
}

/** One line for a row or a notification. Never the whole path list. */
export function readinessHeadline(result) {
  if (!result) return null;
  if (result.checkpoint_ready) {
    return `Checkpoint ready — ${result.owned.count} path${result.owned.count === 1 ? "" : "s"} owned by this run.`;
  }
  switch (result.reason) {
    case READINESS_REASONS.FOREIGN:
      return `Checkpoint blocked — ${result.foreign.count} dirty file${result.foreign.count === 1 ? "" : "s"} did not come from this run.`;
    case READINESS_REASONS.NO_BASELINE:
      return "Checkpoint blocked — this run has no recorded starting state, so nothing can be attributed to it.";
    case READINESS_REASONS.BASELINE_TRUNCATED:
      return "Checkpoint blocked — the recorded starting state was too large to record in full, so attribution is not exact.";
    case READINESS_REASONS.MOVED_HEAD:
      return "Checkpoint blocked — the branch moved since this run started.";
    case READINESS_REASONS.CONFLICT:
      return "Checkpoint blocked — the worktree has a merge conflict.";
    case READINESS_REASONS.CLEAN:
      return "Nothing to checkpoint — no files changed by this run.";
    case READINESS_REASONS.UNREADABLE:
      return "Checkpoint readiness unknown — Git could not be read.";
    default:
      return "Checkpoint not ready.";
  }
}
