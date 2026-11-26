/**
 * Worktree lifecycle — what a worktree IS, derived from what is already known.
 *
 * WHAT ALREADY EXISTS, AND IS NOT REBUILT HERE. Vacilando already has a complete
 * worktree retirement subsystem and this mission does not replace any of it:
 *
 *   fourteen required safety gates      → worktree-retirement.mjs
 *   fleet measurement and git truth     → worktree-retirement-observe.mjs
 *   branch durability classification    → classifyBranchDurability
 *   removal, with re-measurement        → trusted-host-worktree-retirement
 *   automatic cadence                   → Host Steward (`retire_worktree`, priority 8)
 *   read-only preview                   → vac worktree-retire
 *   cached disk sizes                   → resources.mjs (peekWorktreeDiskCache)
 *   per-lane freshness and divergence   → lane-freshness.mjs (DevOps 2)
 *
 * No gate, no removal path, no timer and no registry is added. Running the
 * existing evaluator across the live fleet already produced 13 director-safe, 6
 * operator-required and 12 blocked worktrees with named failing gates.
 *
 * WHAT WAS ACTUALLY MISSING, and is what this module supplies:
 *
 *   1. A LIFECYCLE VOCABULARY. `groupRetirementCandidates` answers "may the
 *      Director retire this", which is a decision, not a state. It cannot say
 *      that a worktree is actively in use, or parked inside a retention window,
 *      or protected because a candidate is resting on it.
 *
 *   2. TIME. The retirement evaluator has no time dimension at all: a worktree
 *      becomes director-safe the instant its branch merges. Nothing expresses
 *      "keep this a little longer, somebody may come back to it".
 *
 *   3. CANDIDATE PROTECTION. The existing `protected` group covers protected
 *      BRANCH NAMES — staging, main, master. It has no concept of a promotion
 *      candidate awaiting landing. Today those survive only because branch
 *      durability happens to refuse them, which is protection by accident.
 *
 *   4. DISK. The preview reports no size, so "how much would this reclaim"
 *      could not be answered.
 *
 * DERIVED, NEVER PERSISTED. No ACTIVE/PARKED/ARCHIVED field is written anywhere.
 * Every class below is a function of facts that already exist, so a worktree
 * cannot be labelled one thing while being another — which is the failure mode a
 * stored lifecycle column always eventually reaches.
 */
import { DURABLE_STATES } from "./worktree-retirement.mjs";

/**
 * The classes. Derived from the existing evaluation, never stored.
 *
 * `ARCHIVED` is deliberately absent from the derivation: it describes a lane
 * whose worktree is GONE, so there is no worktree to classify. It is the
 * outcome of reclamation, observed as the lane surviving with no binding, and
 * that is the lane registry's fact rather than this module's.
 */
export const WORKTREE_LIFECYCLE = Object.freeze({
  ACTIVE: "ACTIVE",
  PARKED: "PARKED",
  PROMOTION_PROTECTED: "PROMOTION_PROTECTED",
  RECLAIMABLE: "RECLAIMABLE",
  SUPERSEDED: "SUPERSEDED",
  BLOCKED_DIRTY: "BLOCKED_DIRTY",
  BLOCKED_UNDURABLE: "BLOCKED_UNDURABLE",
  BLOCKED_SHARED: "BLOCKED_SHARED",
  OPERATOR_REVIEW: "OPERATOR_REVIEW",
  PROTECTED_BRANCH: "PROTECTED_BRANCH",
});

/**
 * RETENTION, IN ONE PLACE, FROM MEASURED BEHAVIOUR.
 *
 * Measured on 2026-09-12: 31 worktrees under the managed parent, of which 13
 * already pass every safety gate. Lane worktrees showed a hard activity split —
 * nine within 6 hours, then 27h, 77h and 108h with nothing in between (the same
 * distribution DevOps 2 measured for freshness).
 *
 * `park_hours: 24` is the fast-resume window. It sits above the entire active
 * cluster and below the first genuinely-quiet lane at 27h, so a worktree someone
 * is plausibly coming back to this working day is kept, and one they have
 * clearly left is not. It exists because the retirement evaluator has NO time
 * dimension: without it, a branch becomes reclaimable the moment it merges, and
 * the operator who merges at 16:00 and returns at 16:10 finds their checkout
 * gone.
 *
 * `promotion_park_hours: 2` is deliberately much shorter. A promotion worktree
 * whose candidate has LANDED has no reason to exist — its whole purpose was to
 * carry a candidate that is now in staging — and these are what actually
 * accumulate: 13 of the 31 are landed `wt-*` promotion checkouts.
 *
 * TIME MAKES SOMETHING ELIGIBLE FOR CONSIDERATION. Durability and ownership make
 * deletion safe, and those are the existing gates' job, not this policy's. Old
 * is never a synonym for safe here.
 */
export const RETENTION_POLICY = Object.freeze({
  park_hours: numberFromEnv("ALLOY_WORKTREE_PARK_HOURS", 24),
  promotion_park_hours: numberFromEnv("ALLOY_WORKTREE_PROMOTION_PARK_HOURS", 2),
  promotion_path_marker: (process.env.ALLOY_PROMOTION_PATH_MARKER || "alloy-promotions").trim(),
  promotion_branch_prefix: (process.env.ALLOY_PROMOTION_BRANCH_PREFIX || "promote/").trim(),
});

function numberFromEnv(name, fallback) {
  const raw = Number(process.env[name]);
  return Number.isFinite(raw) && raw >= 0 ? raw : fallback;
}

/** Is this worktree carrying a promotion candidate? */
export function isPromotionCheckout(evaluation, policy = RETENTION_POLICY) {
  const branch = String(evaluation?.branch || "");
  const path = String(evaluation?.full_path || "");
  return branch.startsWith(policy.promotion_branch_prefix)
    || path.includes(`/${policy.promotion_path_marker}/`);
}

/**
 * Has this candidate landed, or been replaced by a newer one?
 *
 * LANDED is the durable, measured answer: the branch is merged into the
 * canonical base, so the content is in staging and the checkout is a leftover.
 * That is read from the existing durability classification rather than inferred
 * from a name or a date.
 *
 * SUPERSEDED is deliberately NOT guessed. A candidate replaced by a newer
 * lineage looks, from git alone, exactly like one that is still waiting — and
 * treating "there is a newer branch with a similar name" as supersession is how
 * an unlanded candidate gets deleted. It is reported only when a caller supplies
 * it from a source that actually knows, which is DevOps 6's promotion train.
 */
export function candidateDisposition(evaluation, { supersededBy = null } = {}) {
  const durability = evaluation?.durability || null;
  if (supersededBy) return { state: "superseded", superseded_by: supersededBy };
  if (durability === "merged") return { state: "landed" };
  return { state: "awaiting_landing", durability };
}

/**
 * Classify one worktree from an existing retirement evaluation.
 *
 * ORDER IS THE SAFETY ARGUMENT. Active use, then protection, then the blocking
 * conditions, and only then anything that permits removal — so nothing can reach
 * RECLAIMABLE by passing a later test while failing an earlier one.
 *
 * `evaluation` is the shape `observeRetirementCandidates` already produces. This
 * function measures nothing itself; re-measuring here would create a second
 * opinion about facts the evaluator owns, and the two would eventually disagree.
 */
export function classifyWorktreeLifecycle(evaluation, {
  policy = RETENTION_POLICY,
  idleHours = null,
  supersededBy = null,
  nowMs = Date.now(),
} = {}) {
  if (!evaluation) return { state: WORKTREE_LIFECYCLE.BLOCKED_SHARED, reason: "no_evaluation" };
  void nowMs;

  /*
   * THE EVALUATOR'S OWN FIELD NAMES, AND BOTH OF THEM.
   *
   * The first cut of this read `failed_gates`, which does not exist on the
   * record — `observeRetirementCandidates` reports `blocked_by` and
   * `unmeasured`. The set was therefore always empty, every blocking condition
   * was invisible, and 21 of 31 worktrees classified as RECLAIMABLE when the
   * retirement preview said 13 director-safe and 12 blocked. A classifier that
   * silently sees no obstacles is the worst possible failure for this module,
   * and it was caught only by comparing against the preview on real data.
   *
   * UNMEASURED IS INCLUDED DELIBERATELY. The retirement subsystem's rule is that
   * a gate returning null BLOCKS, because a permissive unknown fails silently
   * and irreversibly. Reading only `blocked_by` would quietly reintroduce
   * exactly that: a gate nobody could measure would read as a gate that passed.
   */
  const failed = new Set([
    ...(evaluation.blocked_by || []),
    ...(evaluation.unmeasured || []),
  ]);
  const durability = evaluation.durability || null;
  const durable = DURABLE_STATES.includes(String(durability));
  const promotion = isPromotionCheckout(evaluation, policy);
  const disposition = candidateDisposition(evaluation, { supersededBy });

  const classified = (state, reason, extra = {}) => ({
    state,
    reason,
    // `path` on the record is the worktree NAME, which is what the disk cache
    // and the registration store are both keyed by.
    name: evaluation.path || evaluation.name || null,
    full_path: evaluation.full_path || null,
    branch: evaluation.branch || null,
    durability,
    durable,
    promotion_checkout: promotion,
    candidate: disposition,
    idle_hours: idleHours,
    retention_policy: { ...policy },
    reclaimable: state === WORKTREE_LIFECYCLE.RECLAIMABLE || state === WORKTREE_LIFECYCLE.SUPERSEDED,
    ...extra,
  });

  if (evaluation.protected_branch) {
    return classified(WORKTREE_LIFECYCLE.PROTECTED_BRANCH, "protected_branch_name");
  }

  // ACTIVE — something is using it right now. Any of these alone is enough, and
  // each is the existing evaluator's measurement rather than a guess here.
  for (const [gate, reason] of [
    ["no_live_provider", "live_provider"],
    ["no_live_dev_server", "live_dev_server"],
    ["no_active_execution_run", "active_execution_run"],
    ["no_active_governed_action", "active_governed_action"],
    ["no_active_lane", "active_lane"],
    ["no_managed_slot_binding", "holds_managed_slot"],
  ]) {
    if (failed.has(gate)) return classified(WORKTREE_LIFECYCLE.ACTIVE, reason);
  }

  // PROMOTION_PROTECTED — a candidate is resting on this exact checkout and has
  // not landed. Explicit, rather than relying on the durability gate to refuse
  // it by side effect, because protection that works by accident stops working
  // the day the accident changes.
  if (promotion && disposition.state === "awaiting_landing") {
    return classified(WORKTREE_LIFECYCLE.PROMOTION_PROTECTED, "candidate_awaiting_landing");
  }

  // Blocking conditions. Unique work first: it is the one that is unrecoverable.
  if (failed.has("branch_durability_proven") || failed.has("unique_commits_recoverable")) {
    return classified(WORKTREE_LIFECYCLE.BLOCKED_UNDURABLE, "commits_exist_only_here");
  }
  if (failed.has("tree_clean_or_handled") || failed.has("no_untracked_unreproducible")) {
    return classified(WORKTREE_LIFECYCLE.BLOCKED_DIRTY, "uncommitted_or_untracked_work");
  }
  if (failed.has("not_self_retirement")) {
    return classified(WORKTREE_LIFECYCLE.BLOCKED_SHARED, "self_retirement");
  }
  if (failed.has("no_operator_hold") || failed.has("no_governance_exception")) {
    return classified(WORKTREE_LIFECYCLE.BLOCKED_SHARED, "operator_hold_or_governance_exception");
  }
  if (evaluation.state === "operator_review") {
    return classified(WORKTREE_LIFECYCLE.OPERATOR_REVIEW, evaluation.reason || "operator_review");
  }
  if (failed.size) {
    return classified(WORKTREE_LIFECYCLE.BLOCKED_SHARED, `gates_failed:${[...failed].join(",")}`);
  }

  // Everything below here has passed every safety gate the existing subsystem
  // requires. What remains is a retention decision, which is time's job.
  if (supersededBy) {
    return classified(WORKTREE_LIFECYCLE.SUPERSEDED, "superseded_by_newer_candidate", { superseded_by: supersededBy });
  }

  const window = promotion ? policy.promotion_park_hours : policy.park_hours;
  if (idleHours != null && idleHours < window) {
    return classified(WORKTREE_LIFECYCLE.PARKED, "within_retention_window", { retain_until_hours: window });
  }

  return classified(
    WORKTREE_LIFECYCLE.RECLAIMABLE,
    promotion ? "landed_promotion_checkout" : "clean_durable_and_idle",
  );
}

/**
 * The fleet, classified — preview and execution reading the same truth.
 *
 * There is no separate "preview" arithmetic. This consumes the same evaluations
 * the executor re-measures from, so a count shown to an operator and the set a
 * removal would act on cannot diverge. Preview math that is not execution truth
 * is how a dry run stops predicting the run.
 *
 * Disk comes from the EXISTING cached measurement. No fleet-wide `du` is run:
 * the cache is populated on the Gateway's own cadence, and a stale or absent
 * entry is reported as unknown rather than triggering a scan, because a
 * consistency report must not become a reason to hammer the disk.
 */
export function inventoryWorktreeLifecycle({
  evaluations = [],
  diskSizes = {},
  idleHoursByWorktree = {},
  supersededBy = {},
  policy = RETENTION_POLICY,
  nowMs = Date.now(),
} = {}) {
  const rows = [];
  for (const e of evaluations) {
    const name = e?.name || e?.path || null;
    const row = classifyWorktreeLifecycle(e, {
      policy,
      nowMs,
      idleHours: idleHoursByWorktree?.[name] ?? null,
      supersededBy: supersededBy?.[name] ?? null,
    });
    const size = diskSizes?.[name];
    row.disk_mb = Number.isFinite(Number(size)) ? Number(size) : null;
    rows.push(row);
  }
  const byState = {};
  for (const r of rows) byState[r.state] = (byState[r.state] || 0) + 1;
  const reclaimable = rows.filter((r) => r.reclaimable);
  const knownDisk = reclaimable.filter((r) => r.disk_mb != null);
  return {
    policy: { ...policy },
    worktrees: rows.length,
    by_state: byState,
    reclaimable: reclaimable.length,
    // Split deliberately: a total that silently treated unknown sizes as zero
    // would understate the estimate and never say so.
    reclaimable_disk_mb: knownDisk.reduce((s, r) => s + r.disk_mb, 0),
    reclaimable_disk_unknown: reclaimable.length - knownDisk.length,
    blocked: rows.filter((r) => String(r.state).startsWith("BLOCKED")).length,
    rows,
  };
}

/**
 * ONE MANAGED SLOT, AT MOST ONE CURRENT LANE OWNER.
 *
 * THE DEFECT THIS CATCHES, MEASURED. Slot 8 was claimed by two ACTIVE lane
 * records — Troubleshooting and Documentation & API — while the canonical slot
 * registry, `metadata/<name>.env`, declared it exactly once, for
 * documentation-api. Troubleshooting's own registration has no slot line at all.
 *
 * So one claim was a STALE CACHED COPY of a binding the lane no longer held, and
 * the only visible symptom was that Troubleshooting's bootstrap resolution
 * failed with `lane_slot_unregistered` — a message about the lane that was
 * really a fact about a duplicate.
 *
 * The registry is the authority; a lane record's `binding.slot` is a cache of
 * it. This compares the two and reports, so a duplicate is an invariant failure
 * rather than something discovered three layers away.
 */
export function detectSlotOwnershipConflicts({ lanes = [], registrySlots = {} } = {}) {
  const claims = new Map();
  for (const l of lanes) {
    const slot = l?.binding?.slot;
    if (!Number.isInteger(Number(slot))) continue;
    const n = Number(slot);
    if (!claims.has(n)) claims.set(n, []);
    claims.get(n).push({
      lane_id: l.lane_id,
      name: l.name || null,
      status: l.status || null,
      worktree_name: l.binding?.worktree_name || null,
    });
  }
  const conflicts = [];
  for (const [slot, claimants] of claims) {
    if (claimants.length < 2) continue;
    // The registry decides which claim is real. A conflict where the registry
    // names one of them is REPAIRABLE — the others are stale caches. A conflict
    // where it names none, or someone else, is not something to guess about.
    const holder = registrySlots[slot] || null;
    const backed = claimants.filter((c) => c.worktree_name && c.worktree_name === holder);
    conflicts.push({
      slot,
      claimants,
      registry_holder: holder,
      repairable: Boolean(holder) && backed.length === 1,
      stale_claims: holder ? claimants.filter((c) => c.worktree_name !== holder) : [],
    });
  }
  return { slots_claimed: claims.size, conflicts };
}
