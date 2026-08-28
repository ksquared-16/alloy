/**
 * Governed Worktree Retirement — the contract.
 *
 * S7 reconciliation may PROPOSE retirement and does nothing else with it. It
 * classifies, it withholds, and it stops. Retirement changes Git and filesystem
 * reality, so it lives here, behind its own governed action, its own safety
 * gates, and its own evidence fingerprint.
 *
 * WHY THIS IS NOT PART OF `vac reconcile --apply`. That executor is certified
 * on a property this one cannot have: it contains no destructive verb at all,
 * and a test reads its source to prove it. Adding removal there would delete
 * the guarantee that made metadata reconciliation safe to delegate. Two
 * subsystems, two blast radii.
 *
 * THE DOCTRINE. Reality corrects metadata; metadata does not kill reality. A
 * record claiming a worktree is disposable is a claim to be re-measured at the
 * moment of removal, never a licence granted earlier and cashed later.
 */
import { createHash } from "node:crypto";

export const RETIREMENT_SCHEMA = "vacilando.worktree_retirement.v1";
export const RETIREMENT_POLICY_VERSION = "worktree_retirement_v1";

/**
 * Lifecycle. `candidate` is the only state a Director may act on, and only
 * after the gates below are all measured true.
 */
export const RETIREMENT_STATES = Object.freeze([
  "candidate", "blocked", "operator_review", "approved", "retiring", "retired", "failed",
]);

/**
 * Every gate is REQUIRED. There is no optional gate and no default-pass gate.
 *
 * A gate returns true, false, or null. Null means "not measured", and null
 * BLOCKS — an unmeasured gate is not a passed gate. This is the same rule the
 * Director applies to its own policy gates, for the same reason: the failure
 * mode of a permissive unknown is silent and irreversible.
 */
export const SAFETY_GATES = Object.freeze([
  "git_worktree_exists",
  "no_live_provider",
  "no_live_dev_server",
  "no_active_execution_run",
  "no_active_governed_action",
  "no_active_lane",
  "tree_clean_or_handled",
  "branch_durability_proven",
  "unique_commits_recoverable",
  "no_untracked_unreproducible",
  "not_self_retirement",
  "no_operator_hold",
  "no_governance_exception",
]);

/**
 * Branch reachability. These are DISTINCT outcomes and collapsing them is how a
 * "clean, safe" worktree loses work: `merged` and `unique_local_commits` both
 * look like "the branch exists" from the outside.
 */
export const BRANCH_DURABILITY = Object.freeze([
  "reachable_from_canonical_remote",
  "merged",
  "pushed_not_merged",
  "unique_local_commits",
  "unknown",
]);

/** Durability values that mean the content survives the worktree's removal. */
export const DURABLE_STATES = Object.freeze([
  "reachable_from_canonical_remote", "merged", "pushed_not_merged",
]);

/** Names whose deletion is never routine, mirrored from repository housekeeping. */
export const NEVER_RETIRE_BRANCHES = Object.freeze(["staging", "main", "master", "production"]);

/**
 * Classify branch reachability from measurements, never from a name or a date.
 *
 * `null` inputs propagate to "unknown" rather than to a guess. A worktree whose
 * git could not be read is not a clean worktree.
 */
export function classifyBranchDurability({
  headSha = null,
  remoteHeadSha = null,
  ancestorOfCanonical = null,
  containedInRemoteBranch = null,
  mergedIntoCanonical = null,
  aheadOfRemote = null,
} = {}) {
  if (!headSha) return { durability: "unknown", reason: "worktree HEAD could not be read" };
  if (mergedIntoCanonical === true) return { durability: "merged", reason: "HEAD is contained in the canonical branch" };
  if (ancestorOfCanonical === true) {
    return { durability: "reachable_from_canonical_remote", reason: "HEAD is an ancestor of the canonical remote branch" };
  }
  // WHY BEING BEHIND YOUR OWN REMOTE IS NOT SAFER THAN BEING AT IT. Both mean
  // the commits are on the server and unmerged. An earlier cut of this returned
  // `pushed_not_merged` only when HEAD equalled the remote head, so a worktree
  // sitting one commit behind its own pushed branch was graded a clean
  // `candidate` while an identical one exactly at the head went to
  // operator_review. That difference is an artefact of where the checkout
  // happens to sit, not of what removing it would cost.
  if (containedInRemoteBranch === true) {
    return { durability: "pushed_not_merged", reason: "HEAD is contained in the branch's remote, which is not merged into the canonical branch" };
  }
  if (aheadOfRemote === true) {
    return { durability: "unique_local_commits", reason: "the worktree holds commits the remote does not" };
  }
  if (remoteHeadSha && String(remoteHeadSha).toLowerCase() === String(headSha).toLowerCase()) {
    return { durability: "pushed_not_merged", reason: "the remote branch is at this exact HEAD" };
  }
  // Everything else is genuinely unknown. Do not infer durability from the
  // absence of evidence — that is the same error as calling an unmeasured gate
  // passed.
  return { durability: "unknown", reason: "reachability to the canonical remote could not be established" };
}

const gate = (name, passed, evidence) => ({
  gate: name,
  measured: passed !== null && passed !== undefined,
  passed: passed === true,
  evidence: evidence ?? null,
});

/**
 * Measure every safety gate for one worktree.
 *
 * Returns the full gate list ALWAYS — including the ones that passed — because
 * the evidence used to reach a decision has to survive the decision. A result
 * that lists only failures cannot be audited later.
 */
export function evaluateRetirementSafety({
  path = null,
  branch = null,
  headSha = null,
  existsInGit = null,
  liveProviders = null,
  liveDevServer = null,
  activeRuns = null,
  activeGovernedActions = null,
  activeLanes = null,
  dirtyPaths = null,
  untrackedPaths = null,
  untrackedReproducible = null,
  durability = null,
  requestingWorktree = null,
  operatorHold = null,
  governanceException = null,
} = {}) {
  const dur = durability && typeof durability === "object" ? durability.durability : durability;
  const gates = [
    gate("git_worktree_exists", existsInGit == null ? null : existsInGit === true, { in_git_worktree_list: existsInGit }),
    gate("no_live_provider", liveProviders == null ? null : liveProviders.length === 0, { providers: liveProviders }),
    gate("no_live_dev_server", liveDevServer == null ? null : liveDevServer === false, { live_dev_server: liveDevServer }),
    gate("no_active_execution_run", activeRuns == null ? null : activeRuns.length === 0, { runs: activeRuns }),
    gate("no_active_governed_action", activeGovernedActions == null ? null : activeGovernedActions.length === 0, { governed_actions: activeGovernedActions }),
    gate("no_active_lane", activeLanes == null ? null : activeLanes.length === 0, { lanes: activeLanes }),
    // A dirty tree is never auto-handled. "Handled" means an operator decided,
    // and that decision is not something this function can invent.
    gate("tree_clean_or_handled", dirtyPaths == null ? null : dirtyPaths.length === 0, { dirty_paths: dirtyPaths }),
    gate("branch_durability_proven", dur == null ? null : DURABLE_STATES.includes(dur), { durability: dur }),
    gate("unique_commits_recoverable", dur == null ? null : dur !== "unique_local_commits", { durability: dur }),
    gate(
      "no_untracked_unreproducible",
      untrackedPaths == null ? null : (untrackedPaths.length === 0 || untrackedReproducible === true),
      { untracked: untrackedPaths, reproducible: untrackedReproducible },
    ),
    // A worker cannot declare itself disposable. Removing the worktree a run is
    // executing from destroys the executor mid-execution.
    gate(
      "not_self_retirement",
      path == null || requestingWorktree == null ? null : !samePath(path, requestingWorktree),
      { target: path, requester: requestingWorktree },
    ),
    gate("no_operator_hold", operatorHold == null ? null : operatorHold === false, { operator_hold: operatorHold }),
    gate("no_governance_exception", governanceException == null ? null : governanceException === false, { governance_exception: governanceException }),
  ];

  const unmeasured = gates.filter((g) => !g.measured).map((g) => g.gate);
  const failed = gates.filter((g) => g.measured && !g.passed).map((g) => g.gate);
  const protectedBranch = branch != null && NEVER_RETIRE_BRANCHES.includes(String(branch).toLowerCase());

  let state;
  let reason;
  if (protectedBranch) {
    state = "blocked";
    reason = `${branch} is a protected branch`;
  } else if (failed.length) {
    state = "blocked";
    reason = `gate${failed.length === 1 ? "" : "s"} failed: ${failed.join(", ")}`;
  } else if (unmeasured.length) {
    // Unknown blocks. It does NOT become operator_review — an operator asked to
    // approve an unmeasured gate is being asked to guess with more authority.
    state = "blocked";
    reason = `gate${unmeasured.length === 1 ? " was" : "s were"} not measured: ${unmeasured.join(", ")}`;
  } else if (dur === "pushed_not_merged") {
    // Durable, so removing the worktree loses nothing — but the work has not
    // landed, and that is a judgement, not a measurement.
    state = "operator_review";
    reason = "the branch is pushed but not merged; removing the worktree is safe, landing the work is an operator decision";
  } else {
    state = "candidate";
    reason = "every safety gate measured and passed";
  }

  return {
    schema_version: RETIREMENT_SCHEMA,
    path, branch, head_sha: headSha,
    state, reason,
    gates,
    blocked_by: failed,
    unmeasured,
    protected_branch: protectedBranch,
    durability: dur || "unknown",
    // Deterministic == every gate measured, nothing left to judgement. Only a
    // deterministic result is eligible for delegated approval.
    deterministic: state === "candidate",
  };
}

function samePath(a, b) {
  const norm = (v) => String(v || "").replace(/\/+$/, "").split("/").filter(Boolean).pop() || "";
  return norm(a) === norm(b) && norm(a) !== "";
}

/**
 * Bind a decision to everything that could invalidate it.
 *
 * The fingerprint covers the identity of the worktree AND the measured safety
 * state AND the S7 classification. If any of those move between filing and
 * execution, the executor must refuse — a safety measurement is only true of
 * the instant it was taken.
 */
export function retirementFingerprint({
  repository = null, path = null, branch = null, headSha = null,
  safety = null, s7State = null,
} = {}) {
  const gates = (safety?.gates || []).map((g) => ({ gate: g.gate, measured: g.measured, passed: g.passed }))
    .sort((a, b) => a.gate.localeCompare(b.gate));
  return createHash("sha256").update(JSON.stringify({
    schema: RETIREMENT_SCHEMA,
    repository: repository || null,
    path: path || null,
    branch: branch || null,
    head_sha: headSha || null,
    state: safety?.state || null,
    durability: safety?.durability || null,
    gates,
    s7_state: s7State || null,
  })).digest("hex").slice(0, 32);
}

/** True only when a freshly measured world still produces the recorded fingerprint. */
export function retirementPlanIsCurrent(recordedFingerprint, fresh) {
  if (!/^[0-9a-f]{32}$/.test(String(recordedFingerprint || ""))) return false;
  return String(recordedFingerprint) === String(retirementFingerprint(fresh));
}

/**
 * Group a measured population for reporting.
 *
 * `operator_required` is deliberately separate from `blocked`: one is "we know
 * it is safe and someone must still decide", the other is "we do not know".
 */
export function groupRetirementCandidates(evaluations = []) {
  const groups = { director_safe: [], operator_required: [], blocked: [], protected: [] };
  for (const e of evaluations) {
    if (e.protected_branch) groups.protected.push(e);
    else if (e.state === "candidate") groups.director_safe.push(e);
    else if (e.state === "operator_review") groups.operator_required.push(e);
    else groups.blocked.push(e);
  }
  return groups;
}
