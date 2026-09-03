/**
 * WHAT HAPPENS WHEN A LANE ASKS FOR A DEV SERVER AND THE FLEET IS FULL.
 *
 * Before this, "full" had exactly one answer: refuse. That is wrong in both
 * directions at once. It refuses a lane while a server nobody asked for is
 * still holding a port, and it treats the ninth server as identical to the
 * twelfth when the measured host says they are not remotely alike — the knee
 * is at eleven, ten still swaps nothing.
 *
 * The ordering here is the whole point, and it is a SAFETY ordering, not an
 * efficiency one:
 *
 *   1. Reclaim something that should not be running at all.
 *   2. Only then spend real headroom on a burst server.
 *   3. Never spend headroom past the burst ceiling. Queue instead.
 *
 * Reclaim comes first because it is the only step that costs nothing: a server
 * whose operator already asked for it to be STOPPED is not a resource being
 * taken from anyone. Bursting is second because it is real memory on a healthy
 * host. Queuing is last because waiting is better than swapping.
 *
 * This module is PURE. It takes an observation and a pressure reading and
 * returns a decision. It starts nothing, stops nothing and stores nothing —
 * so it can be tested against fleets this host will never actually be in, and
 * so the decision can be logged before anyone acts on it.
 */
import { CAPACITY_POLICY_V1, serverAdmissionDecision } from "./capacity-policy.mjs";
import { OWNERSHIP_STATES } from "./dev-server-ownership.mjs";
import { RECYCLE_BLOCKED } from "./server-fleet-observation.mjs";

export const SERVER_ARBITRATION_SCHEMA = "vacilando.server_arbitration.v1";

/**
 * The topology bound, accepted in either shape the canonical owner hands out.
 *
 * `resolveManagedSlotCount()` returns `{ count, source }`, and the obvious call
 * site passes that result straight through. A plain `Number.isInteger` check
 * then quietly rejects it and the bound stops applying — a ceiling that fails
 * OPEN, which is the one direction a ceiling must never fail. Caught in the
 * first live run, where the topology bound was being silently ignored.
 */
function normalizeSlotBound(value) {
  const n = typeof value === "object" && value !== null ? Number(value.count) : Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * States a port holder can be in that arbitration must NOT act on by itself.
 *
 * Each of these is a real thing occupying a managed port, and every one of them
 * is tempting to reclaim — that is exactly why they are listed. An unmanaged
 * listener is some other program; a foreign owner is a real lane's real server
 * sitting on the wrong port; an unattributable holder is one the probe could
 * not identify. Killing any of them is guessing, and the failure mode of
 * guessing is destroying work that belongs to someone else.
 *
 * Taken from the ownership owner rather than spelled out here. The first cut
 * wrote the strings by hand and got one wrong — "unattributable" against the
 * real "unattributable_listener" — which would have silently dropped exactly
 * the holder we are least able to reason about from the operator report.
 */
const OPERATOR_ATTENTION = new Set([
  OWNERSHIP_STATES.UNMANAGED_LISTENER,
  OWNERSHIP_STATES.FOREIGN_PORT_OWNER,
  OWNERSHIP_STATES.UNATTRIBUTABLE,
]);

/**
 * Decide what to do about one lane's request for a dev server.
 *
 * @param {object}  o
 * @param {number|null} o.requesterSlot     slot the requesting lane is registered to
 * @param {string|null} o.requesterWorktree registered worktree name of the requester
 * @param {object}  o.fleet     an `observeServerFleet()` result
 * @param {object|null} o.pressure a `memoryPressure()` result — the canonical owner
 * @param {number|null} o.slotBound topology bound, so arbitration can never exceed it
 */
export function arbitrateServerRequest({
  requesterSlot = null,
  requesterWorktree = null,
  fleet = null,
  pressure = null,
  policy = CAPACITY_POLICY_V1,
  slotBound = null,
} = {}) {
  slotBound = normalizeSlotBound(slotBound);
  const servers = Array.isArray(fleet?.servers) ? fleet.servers : [];
  const running = servers.filter((s) => s.observed_state === "RUNNING");

  // A blind observation is not an empty fleet. If we cannot see the fleet we
  // cannot say a port is free, and inventing capacity out of a failed probe is
  // the same class of error as reading a failed pressure probe as a calm host.
  if (!fleet || !Array.isArray(fleet.servers)) {
    return decision({
      decision: "REFUSE", reason: "fleet could not be observed; capacity is unknown",
      running: null, policy, slotBound, pressure,
    });
  }

  const isRequester = (s) =>
    (requesterSlot != null && s.slot === requesterSlot)
    || (requesterWorktree && s.lane_worktree === requesterWorktree);

  // Already up. This is not an admission at all, and answering it as one would
  // let a lane that already has a server consume a burst slot by asking twice.
  const mine = servers.find((s) => isRequester(s) && s.observed_state === "RUNNING");
  if (mine) {
    return decision({
      decision: "ALREADY_RUNNING", tier: null,
      reason: `slot ${mine.slot} is already serving on port ${mine.port} (pid ${mine.pid})`,
      running: running.length, policy, slotBound, pressure,
      needsOperator: operatorAttention(servers),
    });
  }

  const admission = serverAdmissionDecision({
    running: running.length,
    normalCeiling: policy.dev_server_normal_ceiling ?? null,
    policy, pressure, slotBound,
  });

  // Below the normal ceiling nothing needs arbitrating. Reclaim opportunities
  // are still reported, because a wrongly-running server is worth fixing even
  // when it is not in anyone's way yet — but it does not gate the start.
  const selection = selectHolder(running, isRequester);
  if (admission.allow && admission.tier === "normal") {
    return decision({
      decision: "START", tier: "normal", reason: admission.reason,
      running: running.length, policy, slotBound, pressure, admission,
      reclaim: null, advisoryReclaim: selection.chosen, considered: selection.considered,
      needsOperator: operatorAttention(servers),
    });
  }

  // At or above the normal ceiling: try to make room before asking for more.
  if (selection.chosen) {
    const c = selection.chosen;
    return decision({
      decision: "RECLAIM_THEN_START", tier: "normal",
      reclaim: { ...c.row, holder_class: c.holder_class, rank: c.rank,
        release_method: c.release_method, chosen_because: c.chosen_because },
      reason: `${running.length} servers running — ${c.chosen_because};`
        + ` releasing ${c.row.rss_mb} MB rather than spending burst headroom`,
      running: running.length, policy, slotBound, pressure, admission,
      considered: selection.considered, needsOperator: operatorAttention(servers),
    });
  }

  // Nothing safe to reclaim. Burst is a real cost, so it is spent only on a
  // host the canonical pressure owner calls healthy.
  if (admission.allow && admission.tier === "burst") {
    return decision({
      decision: "START", tier: "burst", reason: admission.reason,
      running: running.length, policy, slotBound, pressure, admission,
      considered: selection.considered, needsOperator: operatorAttention(servers),
    });
  }

  // Queue. Waiting is the correct answer past the burst ceiling and on a
  // constrained host alike; the difference is only in what we tell the caller.
  return decision({
    decision: "QUEUE", tier: null,
    reason: admission.reason,
    queueReason: admission.state,
    running: running.length, policy, slotBound, pressure, admission,
    considered: selection.considered, needsOperator: operatorAttention(servers),
  });
}

/**
 * Ranked holder selection. Positive evidence only, and it must explain itself.
 *
 *   1. invalid/orphan            — registered slot whose worktree is gone
 *   2. lifecycle inconsistency   — running while canonically STOPPED
 *   3. idle/reclaimable          — needs idleness evidence that does not exist
 *   4. recycle-eligible large    — needs the same evidence; also never populated
 *
 * Ranks 3 and 4 are written out rather than omitted. They are the two classes
 * everyone reaches for, they are the two the platform cannot yet prove, and
 * leaving them visible-but-empty is what stops them being quietly approximated
 * with age or RSS later.
 *
 * EXCLUSIONS APPLY BEFORE RANK. An active run outranks every reason to take a
 * server: measured on this host, the single most attractive target on the
 * machine — 6.3 GB, six hours old — was executing a run. Age and size are
 * precisely the signals that would have chosen it.
 */
export const HOLDER_CLASSES = Object.freeze({
  INVALID_ORPHAN: "invalid_orphan",
  LIFECYCLE_INCONSISTENCY: "lifecycle_inconsistency",
  IDLE_RECLAIMABLE: "idle_reclaimable",
  RECYCLE_ELIGIBLE_LARGE: "recycle_eligible_large",
});

/**
 * Why a server may never be released, whatever class it would otherwise fall in.
 *
 * `desired_state_unknown` is deliberately NOT here. It excludes ranks 2-4,
 * which all reason from desired state — but a proven orphan does not: its
 * evidence is that the worktree is gone, which is true regardless of what
 * anyone last asked for. Excluding orphans on unknown desired state would make
 * orphan reconciliation impossible, since an orphan almost always has one.
 */
function hardExclusion(s) {
  if (s.active_run) return `active run ${s.active_run.run_id ?? ""} (${s.active_run.state})`.trim();
  if (s.recovery_state === "RECOVERING") return "the supervisor is recovering it";
  if (s.recovery_state === "RESTART_EXHAUSTED") return "restart-exhausted; releasing it hides a fault";
  if (OPERATOR_ATTENTION.has(String(s.ownership_state))) return `ownership is ${s.ownership_state}`;
  return null;
}

export function selectHolder(running, isRequester = () => false) {
  const considered = [];
  const eligible = [];
  for (const s of running) {
    if (isRequester(s)) {
      considered.push({ slot: s.slot, rejected_because: "it is the requester; releasing it would satisfy the request by destroying its subject" });
      continue;
    }
    const excluded = hardExclusion(s);
    if (excluded) {
      considered.push({ slot: s.slot, rejected_because: excluded });
      continue;
    }
    if (s.orphaned_registration) {
      eligible.push({ row: s, rank: 1, holder_class: HOLDER_CLASSES.INVALID_ORPHAN,
        release_method: "reconcile_orphan",
        chosen_because: `slot ${s.slot} is registered to ${s.lane_worktree}, which no longer exists on disk` });
      continue;
    }
    if (s.reclaimable === true) {
      eligible.push({ row: s, rank: 2, holder_class: HOLDER_CLASSES.LIFECYCLE_INCONSISTENCY,
        release_method: "canonical_stop",
        chosen_because: `slot ${s.slot} is running although its operator's last recorded instruction was STOP` });
      continue;
    }
    if (s.recycle_eligible === true) {
      eligible.push({ row: s, rank: 4, holder_class: HOLDER_CLASSES.RECYCLE_ELIGIBLE_LARGE,
        release_method: "recycle",
        chosen_because: `slot ${s.slot} is a proven recycle candidate (${s.rss_mb} MB)` });
      continue;
    }
    // Rank 3 requires positive idleness evidence. The observation says in its
    // own words that it does not have any, so nothing lands here.
    considered.push({
      slot: s.slot,
      rejected_because: s.recycle_blocked_reason === RECYCLE_BLOCKED.IDLENESS_NOT_OBSERVABLE
        ? "no idleness evidence exists; absence of an active run is not proof of idleness"
        : `not a candidate: ${s.recycle_blocked_reason}`,
    });
  }
  // Rank first, then size — size only ever orders holders that already qualified.
  eligible.sort((a, b) => a.rank - b.rank || (b.row.rss_mb ?? 0) - (a.row.rss_mb ?? 0));
  return { chosen: eligible[0] ?? null, considered };
}

/** Port holders arbitration refuses to touch, surfaced so they are not invisible. */
function operatorAttention(servers) {
  return servers
    .filter((s) => s.pid && OPERATOR_ATTENTION.has(String(s.ownership_state)))
    .map((s) => ({
      slot: s.slot, port: s.port, pid: s.pid, rss_mb: s.rss_mb,
      ownership_state: s.ownership_state,
      why_not_reclaimed: s.ownership_state === OWNERSHIP_STATES.UNATTRIBUTABLE
        ? "the probe could not identify this holder; acting on it would be guessing"
        : s.ownership_state === OWNERSHIP_STATES.FOREIGN_PORT_OWNER
          ? "this is another lane's real dev server on the wrong port; it belongs to someone"
          : "this is not a managed dev server; it is some other program",
    }));
}

function decision({
  decision: kind, tier = null, reason = "", queueReason = null,
  reclaim = null, advisoryReclaim = null, needsOperator = [], considered = [],
  running = 0, policy = CAPACITY_POLICY_V1, slotBound = null,
  pressure = null, admission = null,
} = {}) {
  const normal = policy.dev_server_normal_ceiling ?? null;
  let burst = policy.dev_server_burst_ceiling ?? normal;
  const bound = normalizeSlotBound(slotBound);
  if (bound !== null && Number.isInteger(burst)) burst = Math.min(burst, bound);
  return {
    schema_version: SERVER_ARBITRATION_SCHEMA,
    decided_at: new Date().toISOString(),
    decision: kind,
    tier,
    reason,
    queue_reason: queueReason,
    reclaim,
    // A reclaim worth doing that is NOT gating this start. Reported so it can
    // be fixed, never conflated with the reclaim a start depended on.
    advisory_reclaim: advisoryReclaim,
    // Every running server that was looked at and passed over, with the reason.
    // A selection nobody can audit is a selection nobody should trust.
    considered,
    needs_operator: needsOperator,
    running,
    normal_ceiling: normal,
    burst_ceiling: burst,
    measured_knee: policy.dev_server_measured_knee ?? null,
    pressure_readable: pressure ? pressure.readable !== false : false,
    admission,
  };
}
