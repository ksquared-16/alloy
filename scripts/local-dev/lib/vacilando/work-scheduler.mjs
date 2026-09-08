/**
 * THE SCHEDULING DECISION, AND ONLY THAT.
 *
 * The question nothing owned: of the work Vacilando is already authorized to
 * do, what deserves the next provider? Everything needed to answer it already
 * existed and none of it answered it.
 *
 *   provider-seat-state    what each seat IS               (active/idle/dormant/…)
 *   lane-execution-capacity what the host can carry
 *   capacity-demand        who is queued for which dimension
 *   mission-advance        whether an implementation chain has a next wave
 *   operational-findings   what is constraining operation
 *   execution-run          whether a run exists and what state it is in
 *   host-admission         the operating band
 *
 * WHAT THIS MODULE MAY NOT DECIDE. Whether a run exists, whether a provider is
 * executing, whether a lane is closed, whether capacity is occupied, whether a
 * finding exists, whether the host is healthy, whether a governed action is
 * approved, whether a dependency is satisfied. It CONSUMES all of that. It owns
 * one judgement: given those facts, what should execute next, and why.
 *
 * WHY NOT scheduler.mjs. That file answers a different question — "given
 * machine pressure and free slots, may I start a worker?" — over a legacy
 * sprint/slot snapshot, with `auto_scheduling: false` and no dispatch. Its
 * pressure half has since been superseded by capacity-operating-model and
 * provider-seat-state, and it has no representation of lanes, runs, missions,
 * dependencies or findings, which is most of what a scheduling decision needs.
 * It is left alone rather than bent into a shape it was not built for.
 *
 * THE GOAL IS NOT 8/8. An available seat with no worthy authorized work is a
 * correct outcome, and this says so explicitly rather than inventing
 * maintenance to fill it.
 */

export const WORK_SCHEDULER_SCHEMA = "vacilando.work_scheduler.v1";

/**
 * Why a schedulable lane is not running.
 *
 * Phase 2 recorded `execution-run-lifecycle-wait-reason-without-policy`: a run
 * waiting on a reason no policy defined. The cure is not a better default —
 * it is a closed vocabulary where every member is a real, explainable state and
 * UNKNOWN is one of them, said out loud.
 *
 * `capacity` is deliberately narrow. A lane is only waiting on capacity when
 * capacity is genuinely the binding constraint; "queued for capacity" was
 * previously the catch-all, which is how a lane blocked on a person looked like
 * a lane blocked on a machine.
 */
export const WAIT_REASONS = Object.freeze([
  "executing",                 // already running — not waiting at all
  "eligible",                  // nothing is blocking it; it is waiting only for its turn
  "no_authorized_work",        // nothing to do; this is a healthy answer
  "dependency",                // another named piece of work must land first
  "director_answer",           // a person owes an answer
  "governed_action",           // an approval or trusted-host action is in flight
  "capacity",                  // a seat or a dimension is genuinely full
  "host_constrained",          // the operating band forbids starting this class
  "provider_unavailable",      // no provider of the required capability
  "finding_constraint",        // an operational finding blocks or constrains it
  "retry_cooldown",            // a recent attempt failed; bounded wait
  "completed",                 // the mission is done
  "scheduled_later",           // deliberately deferred
  "unknown",                   // not determinable — fails closed, never dispatched
]);

/** Wait reasons that mean a person is the blocker, not the machine. */
export const HUMAN_WAIT_REASONS = Object.freeze(["director_answer", "governed_action"]);

/**
 * Priority classes, highest first.
 *
 * Composed from signals that already exist rather than invented: the Director's
 * explicit priority, the findings owner's `CONSTRAINING_SEVERITIES`, and the
 * mission model's notion of an implementation chain in flight.
 */
export const PRIORITY_CLASSES = Object.freeze([
  "director_explicit",       // 0 — a person said this one
  "unblocks_other_work",     // 1 — something else is waiting on it
  "control_plane",           // 2 — safety or the control plane itself
  "mission_continuation",    // 3 — a chain already in flight
  "finding_constrained",     // 4 — a finding says operation is degraded until this lands
  "dependency_cleared",      // 5 — newly unblocked
  "planned",                 // 6 — ordinary authorized work
  "maintenance",             // 7 — hygiene, enhancement, background
]);

const CLASS_RANK = Object.freeze(Object.fromEntries(PRIORITY_CLASSES.map((c, i) => [c, i])));

/**
 * Fairness.
 *
 * A pure priority queue starves the bottom of the list forever, and this host's
 * lowest class is hygiene — which runs often and would otherwise sit behind
 * product work permanently, or, inverted, would outrank it merely by being
 * frequent. Both failures are real.
 *
 * The model: priority class decides the band, and within reach of a band a lane
 * that has been ready longer wins. A lane that has waited past
 * `starvation_ms` is promoted by exactly one class — never more, never past
 * safety, and never past an explicit Director priority, which is why the top
 * two classes are excluded from promotion entirely.
 */
export const FAIRNESS_POLICY_V1 = Object.freeze({
  version: "v1",
  starvation_ms: 45 * 60_000,
  max_promotion_classes: 1,
  never_promoted_past: 2,          // index of "control_plane"
  attempt_backoff_ms: 5 * 60_000,
  max_dispatch_attempts: 3,
});

/**
 * One schedulable candidate.
 *
 * Every field is supplied by an owner. `null` anywhere that matters means NOT
 * MEASURED, and an unmeasured candidate is never dispatched — it is reported
 * with wait reason `unknown`.
 */
export function schedulableCandidate({
  laneId = null,
  missionId = null,
  runState = null,
  authorized = null,
  priorityClass = "planned",
  directorPriority = null,
  dependenciesReady = null,
  blockedBy = null,
  findingConstraints = [],
  requiredCapability = null,
  resourceDimensions = [],
  seatState = null,
  readySince = null,
  lastProgressAt = null,
  nextAction = null,
  continuation = null,
  directorJudgmentRequired = null,
  attempts = 0,
  lastAttemptAt = null,
  scheduledAfter = null,
} = {}) {
  return {
    schema_version: WORK_SCHEDULER_SCHEMA,
    lane_id: laneId,
    mission_id: missionId,
    run_state: runState,
    authorized,
    priority_class: PRIORITY_CLASSES.includes(priorityClass) ? priorityClass : "planned",
    director_priority: directorPriority,
    dependencies_ready: dependenciesReady,
    blocked_by: blockedBy,
    finding_constraints: findingConstraints,
    required_capability: requiredCapability,
    resource_dimensions: resourceDimensions,
    seat_state: seatState,
    ready_since: readySince,
    last_progress_at: lastProgressAt,
    next_action: nextAction,
    continuation,
    director_judgment_required: directorJudgmentRequired,
    attempts,
    last_attempt_at: lastAttemptAt,
    scheduled_after: scheduledAfter,
  };
}

/**
 * Why is this candidate not running right now?
 *
 * Ordered so the FIRST true reason is the most actionable one. A lane blocked
 * on a person and also short of capacity is reported as blocked on the person:
 * freeing a seat would not move it, and saying "capacity" would send someone to
 * fix the wrong thing.
 */
export function waitReasonFor(candidate, { capacity = null, hostBand = null, now = Date.now(), policy = FAIRNESS_POLICY_V1 } = {}) {
  const c = candidate || {};
  const reason = (r, detail) => ({ wait_reason: r, detail: detail ?? null });

  if (c.run_state && ["EXECUTING", "VALIDATING", "RECOVERING"].includes(String(c.run_state))) {
    return reason("executing");
  }
  if (c.run_state && ["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"].includes(String(c.run_state)) && !c.next_action) {
    return reason("completed", "the run is terminal and no further authorized step is known");
  }
  if (c.authorized === false) return reason("no_authorized_work");
  // Unmeasured authorization is not permission.
  if (c.authorized == null) return reason("unknown", "authorization was not measured");

  if (c.director_judgment_required === true) return reason("director_answer", c.next_action || null);
  if (c.blocked_by?.kind === "governed_action") return reason("governed_action", c.blocked_by.detail || null);
  if (c.blocked_by?.kind === "director") return reason("director_answer", c.blocked_by.detail || null);

  if (c.dependencies_ready === false) return reason("dependency", c.blocked_by?.detail || null);
  if (c.dependencies_ready == null) return reason("unknown", "dependency readiness was not measured");

  const blocking = (c.finding_constraints || []).filter((f) => f?.blocks === true);
  if (blocking.length) return reason("finding_constraint", blocking.map((f) => f.id).join(", "));

  if (c.scheduled_after && now < Date.parse(c.scheduled_after)) return reason("scheduled_later", c.scheduled_after);

  if (Number(c.attempts || 0) > 0 && c.last_attempt_at) {
    const since = now - Date.parse(c.last_attempt_at);
    if (Number(c.attempts) >= policy.max_dispatch_attempts) {
      return reason("retry_cooldown", `${c.attempts} dispatch attempts failed; parked for the operator`);
    }
    if (since < policy.attempt_backoff_ms) return reason("retry_cooldown", `${Math.ceil((policy.attempt_backoff_ms - since) / 1000)}s remaining`);
  }

  if (hostBand && ["CONSTRAINED", "RECOVERY_REQUIRED"].includes(String(hostBand))) {
    // Only the top bands run under a constrained host. Everything else waits.
    if (CLASS_RANK[c.priority_class] > CLASS_RANK.control_plane) {
      return reason("host_constrained", `host band ${hostBand}`);
    }
  }

  if (capacity) {
    const dims = c.resource_dimensions || [];
    for (const d of dims) {
      const lim = capacity[d];
      if (!lim) continue;
      if (lim.available == null) return reason("unknown", `${d} availability was not measured`);
      if (lim.available <= 0) return reason("capacity", `${d} is at its limit`);
    }
    if (capacity.provider_seat) {
      const seats = capacity.provider_seat;
      if (seats.available == null) return reason("unknown", "provider seat availability was not measured");
      if (seats.available <= 0 && c.seat_state !== "idle" && c.seat_state !== "dormant") {
        return reason("capacity", "no productive provider seat is free");
      }
    }
  }

  if (c.required_capability && c.seat_state === null && capacity?.provider_seat?.available === 0) {
    return reason("provider_unavailable", c.required_capability);
  }

  return reason("eligible", "nothing is blocking this candidate");
}

/** Is this candidate dispatchable right now? Eligibility is positive, never assumed. */
export function isEligible(candidate, ctx = {}) {
  const w = waitReasonFor(candidate, ctx);
  return { eligible: w.wait_reason === "eligible", ...w };
}

/**
 * Effective rank: class, then fairness promotion, then readiness age.
 *
 * Deterministic and total — ties break on lane id — so two ticks with identical
 * facts produce identical order. A scheduler whose order wobbles cannot be
 * audited, and cannot be proven not to thrash.
 */
export function effectiveRank(candidate, { now = Date.now(), policy = FAIRNESS_POLICY_V1 } = {}) {
  const base = CLASS_RANK[candidate?.priority_class] ?? CLASS_RANK.planned;
  const ready = candidate?.ready_since ? Date.parse(candidate.ready_since) : null;
  const waited = ready == null ? 0 : Math.max(0, now - ready);
  let promoted = base;
  if (waited >= policy.starvation_ms && base > policy.never_promoted_past) {
    promoted = Math.max(policy.never_promoted_past + 1, base - policy.max_promotion_classes);
  }
  return { base, effective: promoted, waited_ms: waited, promoted: promoted !== base };
}

export function rankCandidates(candidates = [], { now = Date.now(), policy = FAIRNESS_POLICY_V1 } = {}) {
  return [...candidates]
    .map((c) => ({ candidate: c, rank: effectiveRank(c, { now, policy }) }))
    .sort((a, b) => a.rank.effective - b.rank.effective
      || b.rank.waited_ms - a.rank.waited_ms
      || String(a.candidate.lane_id).localeCompare(String(b.candidate.lane_id)));
}

/**
 * A stable identity for "this work", so two ticks cannot dispatch it twice.
 *
 * Keyed on the lane and the action, NOT on a timestamp or an attempt counter:
 * the whole point is that the same pending work produces the same key on the
 * next tick, so an in-flight dispatch is recognisable as the same thing.
 */
export function dispatchKey(candidate) {
  const lane = String(candidate?.lane_id || "");
  const action = String(candidate?.next_action?.kind || candidate?.next_action || "start");
  return lane ? `sched:${lane}:${action}` : null;
}

/**
 * The plan. Selection only — this dispatches nothing.
 *
 * Reports the whole population, not just the winners, because "why is nothing
 * running" is the question an operator actually asks and a plan listing only
 * dispatches cannot answer it.
 */
export function planSchedule({
  candidates = [],
  capacity = null,
  hostBand = null,
  inFlight = [],
  maxDispatch = 2,
  now = Date.now(),
  policy = FAIRNESS_POLICY_V1,
} = {}) {
  const inFlightKeys = new Set(inFlight.map((k) => String(k)));
  const ranked = rankCandidates(candidates, { now, policy });
  const evaluated = ranked.map(({ candidate, rank }) => {
    const verdict = isEligible(candidate, { capacity, hostBand, now, policy });
    const key = dispatchKey(candidate);
    return {
      lane_id: candidate.lane_id,
      mission_id: candidate.mission_id,
      priority_class: candidate.priority_class,
      effective_rank: rank.effective,
      promoted_for_fairness: rank.promoted,
      waited_ms: rank.waited_ms,
      wait_reason: verdict.wait_reason,
      detail: verdict.detail,
      eligible: verdict.eligible && !inFlightKeys.has(String(key)),
      already_in_flight: inFlightKeys.has(String(key)),
      dispatch_key: key,
      next_action: candidate.next_action ?? null,
      continuation: candidate.continuation ?? null,
    };
  });

  const dispatch = evaluated.filter((e) => e.eligible).slice(0, Math.max(0, maxDispatch));
  const deferred = evaluated.filter((e) => e.eligible).slice(Math.max(0, maxDispatch));

  return {
    schema_version: WORK_SCHEDULER_SCHEMA,
    planned_at: new Date(now).toISOString(),
    host_band: hostBand,
    considered: evaluated.length,
    dispatch,
    deferred,
    waiting: evaluated.filter((e) => !e.eligible && !e.already_in_flight),
    in_flight: evaluated.filter((e) => e.already_in_flight),
    // An idle seat with nothing worth running is a correct outcome, and it says
    // so rather than leaving the reader to infer it from an empty list.
    idle_capacity_explained: dispatch.length === 0
      ? explainIdle(evaluated, capacity)
      : null,
  };
}

function explainIdle(evaluated, capacity) {
  const seats = capacity?.provider_seat?.available ?? null;
  if (!evaluated.length) return { reason: "no_authorized_work", detail: "no schedulable candidate exists", seats_available: seats };
  const counts = {};
  for (const e of evaluated) counts[e.wait_reason] = (counts[e.wait_reason] || 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return {
    reason: dominant ? dominant[0] : "unknown",
    detail: `${evaluated.length} candidate(s), none eligible`,
    by_wait_reason: counts,
    seats_available: seats,
  };
}

/* ── Autonomous continuation ─────────────────────────────────────────────── */

/**
 * May Vacilando take the next step without asking?
 *
 * This answers ONLY "is this step already authorized and deterministic". It
 * does not decide when it runs — `planSchedule` does, from the same candidate
 * list as everything else. There is one planner; a continuation evaluator that
 * dispatched on its own would be a second scheduler wearing a different name.
 */
export const CONTINUATION_VERDICTS = Object.freeze(["auto_continue", "director_required", "none"]);

/** Every condition that must hold for an unattended next step. All of them. */
export const AUTO_CONTINUE_CONDITIONS = Object.freeze([
  "already_authorized",
  "deterministic_next_action",
  "within_policy",
  "dependencies_ready",
  "no_new_judgment",
  "no_unresolved_blocker",
  "no_conflicting_finding",
  "bounded_and_auditable",
]);

export function continuationDecision(candidate, { now = Date.now() } = {}) {
  const c = candidate || {};
  if (!c.next_action) return { verdict: "none", reason: "no next action is known", conditions: {} };

  const conditions = {
    already_authorized: c.authorized === true,
    deterministic_next_action: Boolean(c.next_action?.deterministic),
    within_policy: c.next_action?.within_policy === true,
    dependencies_ready: c.dependencies_ready === true,
    no_new_judgment: c.director_judgment_required === false,
    no_unresolved_blocker: !c.blocked_by,
    no_conflicting_finding: !(c.finding_constraints || []).some((f) => f?.blocks === true),
    bounded_and_auditable: c.next_action?.bounded === true,
  };
  const unmet = AUTO_CONTINUE_CONDITIONS.filter((k) => conditions[k] !== true);
  if (!unmet.length) {
    return { verdict: "auto_continue", reason: "every continuation condition is measured and met", conditions };
  }
  return {
    verdict: "director_required",
    reason: `unmet: ${unmet.join(", ")}`,
    conditions,
    unmet,
  };
}

/** The scoreboard rollup (§21). Counts only, from candidates already classified. */
export function schedulerScoreboard({ candidates = [], capacity = null, hostBand = null, plan = null, recent = null } = {}) {
  const by = {};
  for (const c of candidates) {
    const w = plan?.waiting?.find((x) => x.lane_id === c.lane_id)?.wait_reason
      ?? plan?.dispatch?.find((x) => x.lane_id === c.lane_id)?.wait_reason
      ?? "unknown";
    by[w] = (by[w] || 0) + 1;
  }
  return {
    schema_version: WORK_SCHEDULER_SCHEMA,
    lanes_total: candidates.length,
    by_wait_reason: by,
    executing: by.executing || 0,
    eligible_now: by.eligible || 0,
    waiting_on_director: (by.director_answer || 0) + (by.governed_action || 0),
    waiting_on_dependency: by.dependency || 0,
    waiting_on_resource: (by.capacity || 0) + (by.provider_unavailable || 0),
    eligible: plan?.dispatch?.length ?? 0,
    scheduled_next: plan?.dispatch?.[0]?.lane_id ?? null,
    unknown: by.unknown || 0,
    host_band: hostBand,
    capacity,
    idle_capacity_explained: plan?.idle_capacity_explained ?? null,
    recent_dispatches: recent?.dispatches ?? [],
    recent_continuations: recent?.continuations ?? [],
    scheduler_errors: recent?.errors ?? [],
  };
}
