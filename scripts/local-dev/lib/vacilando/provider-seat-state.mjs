/**
 * S8 — provider seat state, contention-driven reclamation, resumable dormancy.
 *
 * THE STATEMENT THIS MAKES TRUE. A lane may remain available and resumable
 * without permanently consuming a provider seat.
 *
 * THE SEPARATION. A Development Lane is durable work: a conversation, a run
 * ledger, a branch, a worktree. A provider seat is a live Claude or Cursor
 * process: memory, CPU, and a model seat. S4 derives the provider ceiling from
 * memory per LIVE PROCESS — six gigabytes each — so a process idling at a
 * prompt costs exactly what a process mid-turn costs. The lane is not scarce.
 * The process is.
 *
 * IDLE IS NOT STALE. Nothing here reclaims a seat because it has been alive a
 * long time, and nothing reclaims a seat because a timer elapsed. Grace makes a
 * seat ELIGIBLE; only a real waiting admission makes a reclaim happen. That is
 * structural, not a convention: `planReclamation` returns before it has even
 * ranked candidates when nothing is waiting, and a test deletes that early
 * return to prove the no-contention fixture then fails.
 *
 * WHY THIS IS SAFE NOW AND WAS NOT BEFORE. Counting a live idle process against
 * the ceiling without a way to yield it would deadlock: three idle agents and a
 * fourth lane that can never start. Reclamation is what makes the honest count
 * survivable, which is why the two arrive together.
 *
 * NOTHING HERE STOPS A PROCESS. This module classifies, ranks and plans. The
 * release itself goes through the existing suspension owner
 * (provider-suspension.mjs), which puts the computation down and keeps the
 * work — and only after durability has been verified.
 */

export const SEAT_STATE_SCHEMA = "vacilando.provider_seat_state.v1";

/**
 * The canonical seat states. One model, and only this one.
 *
 * active     — owns an active run or an active owned workload. Never reclaimable.
 * attentive  — no active run, but interaction is recent, or something about the
 *              seat could not be proven safe to release. Holds capacity.
 * idle       — provably doing nothing, past grace. Holds capacity, reclaimable.
 * dormant    — the live process is gone. The lane is intact and resumable.
 * blocked    — waiting on a NAMED provider-owned condition that requires the
 *              live session to survive. Holds capacity, never reclaimable.
 */
export const SEAT_STATES = Object.freeze(["active", "attentive", "idle", "dormant", "blocked"]);

/** Run states whose work genuinely needs a thinking provider (S4/provider-capacity). */
export const ACTIVE_RUN_STATES = Object.freeze(["EXECUTING", "VALIDATING", "RECOVERING"]);
/** Session states where the process is allocated and coming up. */
export const STARTING_SESSION_STATES = Object.freeze(["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"]);

/** Observed provider activity, as classified by lane-provider-activity.mjs. */
export const ACTIVITY = Object.freeze({
  WORKING: "working", BLOCKED: "blocked", READY: "ready", UNKNOWN: "unknown", ABSENT: "absent",
});

const MIN = 60 * 1000;

/**
 * Idle-grace policy, versioned so the number can be revised from telemetry
 * without touching the resolver.
 *
 * The value is the least important thing in this file. The invariant is that
 * grace only ever makes a seat ELIGIBLE.
 */
export const IDLE_GRACE_POLICY_V1 = Object.freeze({
  version: "v1",
  source: "capacity-doctrine-2026-08-26",
  // Long enough that an operator stepping away between instructions never pays
  // a restart; short enough that a seat forgotten after lunch can be yielded.
  grace_ms: 20 * MIN,
  // How long a reclaim may be in flight before health calls it stuck.
  reclaim_timeout_ms: 3 * MIN,
  // An idle reclaimable seat with nobody waiting is not a defect. It is
  // reported so an operator can see spare capacity exists.
  idle_severity: "watch",
});

export function configuredIdleGrace(env = process.env, policy = IDLE_GRACE_POLICY_V1) {
  const raw = Number(env.VACILANDO_IDLE_GRACE_MS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : policy.grace_ms;
}

/**
 * Every condition that forbids `idle`.
 *
 * Named individually so a refusal can say which one applied — a seat reported
 * as "not reclaimable" with no reason is the thing that made the old behaviour
 * unauditable.
 */
export const ELIGIBILITY_GATES = Object.freeze([
  "active_run",
  "starting_session",
  "provider_working",
  "heavy_descendant",
  "descendants_unknown",
  "validation_claim",
  "delivery_in_flight",
  "provider_blocker",
  "provider_required_lease",
  "unresolved_run_state",
  "activity_unknown",
  "unattributed_process",
  "within_grace",
]);

/**
 * Run states that would become impossible if the provider vanished mid-flight.
 *
 * Taken from the suspension owner's existing rules rather than re-derived: an
 * exclusive lease actively held, or a continuation mid-delivery, both need the
 * process that is holding them.
 */
export function unresolvedWithoutProvider(run) {
  if (!run) return null;
  if (run.state === "RECOVERING") return "run is recovering and the recovery is owned by this provider";
  if (run.state === "WAITING_RESOURCE") {
    const w = run.resource_wait || {};
    if (w.exclusive_phase === "EXCLUSIVE_ACTIVE") return "an exclusive lease is actively held by this provider";
    if (w.continuation_state === "PENDING" || w.continuation_state === "DELIVERING") return "a continuation is mid-delivery";
    if (w.resuming || w.ready_to_resume) return "the run is being resumed into this provider";
  }
  return null;
}

/**
 * Which gates block this seat from being idle?
 *
 * Age is not an input. `within_grace` is the only time-derived gate and it is
 * about RECENCY OF INTERACTION, not about how long the process has existed.
 */
export function seatEligibility(input = {}, { now = Date.now(), policy = IDLE_GRACE_POLICY_V1, graceMs = null } = {}) {
  const grace = Number.isFinite(graceMs) ? graceMs : policy.grace_ms;
  const blockers = [];
  const add = (gate, detail) => blockers.push({ gate, detail });

  const run = input.run || null;
  const activity = input.activity || null;

  if (!input.lane_id) add("unattributed_process", "a provider process that belongs to no lane cannot be proven safe to release");
  if (run && ACTIVE_RUN_STATES.includes(run.state)) add("active_run", `run ${run.run_id || ""} is ${run.state}`.trim());
  if (STARTING_SESSION_STATES.includes(input.session_state)) add("starting_session", `session is ${input.session_state}`);
  if (activity === ACTIVITY.WORKING) add("provider_working", "the pane shows a turn in progress");
  const descendants = input.descendants || [];
  if (descendants.length) add("heavy_descendant", `${descendants.length} owned heavy workload(s) still running`);
  // Not knowing is not the same as none. Without a process table we cannot say
  // this seat owns no heavy work, and "we could not check" must never read as
  // "there is nothing there".
  if (input.descendants_known === false) add("descendants_unknown", "the process table was unavailable; owned descendants could not be enumerated");
  const claims = input.validation_claims || [];
  if (claims.length) add("validation_claim", `${claims.length} governed validation claim(s) held`);
  if (input.delivery_in_flight) add("delivery_in_flight", "an instruction is being delivered to this provider");
  if (activity === ACTIVITY.BLOCKED && input.blocker_kind) add("provider_blocker", `provider is blocked on ${input.blocker_kind}`);
  const leases = (input.resource_leases || []).filter((l) => l?.requires_live_provider !== false);
  if (leases.length) add("provider_required_lease", `${leases.length} resource lease(s) require the live provider`);
  const unresolved = unresolvedWithoutProvider(run);
  if (unresolved) add("unresolved_run_state", unresolved);
  // A pane we could not read is not a pane that is idle. Claiming otherwise is
  // how a seat gets reclaimed out from under a working agent.
  if (activity === ACTIVITY.UNKNOWN || activity == null) add("activity_unknown", "provider activity could not be observed");
  if (activity === ACTIVITY.BLOCKED && !input.blocker_kind) add("activity_unknown", "the pane looks blocked but the condition could not be named");

  const last = Number(input.last_meaningful_activity_at);
  const haveLast = Number.isFinite(last);
  if (!haveLast) add("activity_unknown", "no last-meaningful-activity timestamp is recorded");
  else if (now - last < grace) add("within_grace", `last interaction ${Math.round((now - last) / 1000)}s ago is inside the ${Math.round(grace / 1000)}s grace`);

  return {
    eligible: blockers.length === 0,
    blockers,
    grace_ms: grace,
    policy_version: policy.version,
    idle_since: haveLast ? last : null,
    reclaimable_since: haveLast ? last + grace : null,
  };
}

/**
 * The canonical seat state for one live-or-formerly-live provider.
 *
 * Order encodes the safety doctrine. Absence of a process wins outright;
 * a named blocker wins over everything that follows; anything that looks like
 * work wins over anything that looks like quiet; and `idle` is reached ONLY
 * when every gate has passed.
 */
export function classifySeat(input = {}, { now = Date.now(), policy = IDLE_GRACE_POLICY_V1, graceMs = null } = {}) {
  const base = {
    schema_version: SEAT_STATE_SCHEMA,
    lane_id: input.lane_id ?? null,
    lane_name: input.lane_name ?? null,
    provider: input.provider ?? null,
    pid: input.pid ?? null,
    tmux_session: input.tmux_session ?? null,
    worktree_path: input.worktree_path ?? null,
    agent_session_id: input.agent_session_id ?? null,
    run_id: input.run?.run_id ?? null,
    run_state: input.run?.state ?? null,
    activity: input.activity ?? null,
    descendant_workloads: (input.descendants || []).length,
    last_meaningful_activity_at: Number.isFinite(Number(input.last_meaningful_activity_at))
      ? Number(input.last_meaningful_activity_at) : null,
    policy_version: policy.version,
    observed_at: now,
  };

  const processLive = Boolean(input.pid) || (input.activity && input.activity !== ACTIVITY.ABSENT);

  // ── dormant: the live execution resource is gone ──────────────────────────
  if (!processLive) {
    return {
      ...base,
      state: "dormant",
      reclaimable: false,
      holds_capacity: false,
      provider_process_absent: true,
      resume_available: Boolean(input.lane_id),
      dormant_since: input.dormant_since ?? null,
      resume_count: input.resume_count ?? 0,
      last_resume_result: input.last_resume_result ?? null,
      state_reason: input.session_state === "SUSPENDED"
        ? "provider released; lane durable and resumable"
        : "no provider process is running for this lane",
      blockers: [],
    };
  }

  // A record that says SUSPENDED while a process is demonstrably alive is a
  // wrong record, not a dormant seat. S7's rule: reality corrects metadata.
  const recordDisagrees = input.session_state === "SUSPENDED";

  // ── blocked: a NAMED provider-owned condition ─────────────────────────────
  if (input.activity === ACTIVITY.BLOCKED && input.blocker_kind) {
    return {
      ...base,
      state: "blocked",
      reclaimable: false,
      holds_capacity: true,
      record_disagrees: recordDisagrees || undefined,
      blocker_kind: input.blocker_kind,
      state_reason: `provider is blocked on ${input.blocker_kind}; releasing it would lose the condition`,
      blockers: [{ gate: "provider_blocker", detail: `provider is blocked on ${input.blocker_kind}` }],
    };
  }

  const elig = seatEligibility(input, { now, policy, graceMs });
  const WORK_GATES = new Set([
    "active_run", "starting_session", "provider_working", "heavy_descendant",
    "validation_claim", "delivery_in_flight", "unresolved_run_state", "unattributed_process",
  ]);
  const working = elig.blockers.filter((b) => WORK_GATES.has(b.gate));

  // ── active: owns work, or owns something we must not orphan ───────────────
  if (working.length) {
    return {
      ...base,
      state: "active",
      reclaimable: false,
      holds_capacity: true,
      record_disagrees: recordDisagrees || undefined,
      state_reason: working.map((b) => b.detail).join("; "),
      blockers: elig.blockers,
    };
  }

  // ── attentive: quiet, but not provably releasable yet ─────────────────────
  if (!elig.eligible) {
    const why = elig.blockers.map((b) => b.detail).join("; ");
    return {
      ...base,
      state: "attentive",
      reclaimable: false,
      holds_capacity: true,
      record_disagrees: recordDisagrees || undefined,
      idle_since: elig.idle_since,
      reclaimable_since: elig.reclaimable_since,
      state_reason: why,
      blockers: elig.blockers,
    };
  }

  // ── idle: every gate passed. Eligible — NOT scheduled for anything. ───────
  return {
    ...base,
    state: "idle",
    reclaimable: true,
    holds_capacity: true,
    record_disagrees: recordDisagrees || undefined,
    idle_since: elig.idle_since,
    reclaimable_since: elig.reclaimable_since,
    idle_ms: elig.idle_since == null ? null : now - elig.idle_since,
    pending_operator_interaction: Boolean(input.pending_operator_interaction),
    dev_server_requires_provider: Boolean(input.dev_server_requires_provider),
    state_reason: "no active run, no owned workload, no provider blocker, grace elapsed",
    blockers: [],
  };
}

/**
 * Deterministic candidate ranking.
 *
 * Filtering has already removed everything unsafe, so this orders among equals.
 * Idle-longest leads, then the conservative tie-breaks, and finally the lane id
 * so that two seats identical on every axis still order the same way on every
 * host and in every replay. Lane AGE is deliberately absent: an old lane is not
 * a safe lane.
 */
export function rankReclaimCandidates(seats = [], { now = Date.now() } = {}) {
  const candidates = seats.filter((s) => s.state === "idle" && s.reclaimable === true);
  const keyed = candidates.map((s) => ({
    seat: s,
    key: {
      idle_ms: Number.isFinite(s.idle_since) ? now - s.idle_since : 0,
      descendant_workloads: s.descendant_workloads || 0,
      dev_server_requires_provider: s.dev_server_requires_provider ? 1 : 0,
      pending_operator_interaction: s.pending_operator_interaction ? 1 : 0,
      last_meaningful_activity_at: Number.isFinite(s.last_meaningful_activity_at) ? s.last_meaningful_activity_at : 0,
      lane_id: String(s.lane_id || ""),
    },
  }));
  keyed.sort((a, b) =>
    (b.key.idle_ms - a.key.idle_ms)
    || (a.key.descendant_workloads - b.key.descendant_workloads)
    || (a.key.dev_server_requires_provider - b.key.dev_server_requires_provider)
    || (a.key.pending_operator_interaction - b.key.pending_operator_interaction)
    || (a.key.last_meaningful_activity_at - b.key.last_meaningful_activity_at)
    || a.key.lane_id.localeCompare(b.key.lane_id));
  return keyed.map((k, i) => ({ rank: i + 1, lane_id: k.seat.lane_id, seat: k.seat, ranking_key: k.key }));
}

/** Why a reclaim plan produced nothing. Named, so health can tell them apart. */
export const NO_RECLAIM_REASONS = Object.freeze([
  "no_contention", "capacity_already_available", "no_reclaimable_seat",
]);

/**
 * The reclaim plan.
 *
 * CONTENTION IS THE TRIGGER, AND THE ONLY ONE. With nothing waiting this
 * returns before candidates are even ranked. That early return is the whole
 * safety property of S8 and a mutation test deletes it.
 *
 * MINIMAL BY CONSTRUCTION. `required` is the deficit between what is waiting
 * and what is free — never the number of reclaimable seats. Two idle seats and
 * one waiting admission reclaims exactly one.
 */
export function planReclamation({
  seats = [],
  contention = {},
  now = Date.now(),
  policy = IDLE_GRACE_POLICY_V1,
} = {}) {
  const waiting = contention.waiting || [];
  const summary = summarizeSeats(seats, { now });

  if (!waiting.length) {
    return {
      schema_version: SEAT_STATE_SCHEMA,
      reclaim: [],
      required: 0,
      reason: "no_contention",
      detail: "no admission is waiting on provider capacity; an idle seat stays live",
      candidates: [],
      seats: summary,
      policy_version: policy.version,
    };
  }

  const available = Math.max(0, Number(contention.available_seats) || 0);
  const required = Math.max(0, waiting.length - available);
  const ranked = rankReclaimCandidates(seats, { now });

  if (required === 0) {
    return {
      schema_version: SEAT_STATE_SCHEMA,
      reclaim: [], required: 0, reason: "capacity_already_available",
      detail: `${available} seat(s) free for ${waiting.length} waiting admission(s)`,
      candidates: ranked, seats: summary, policy_version: policy.version,
    };
  }
  if (!ranked.length) {
    return {
      schema_version: SEAT_STATE_SCHEMA,
      reclaim: [], required, reason: "no_reclaimable_seat",
      detail: `${required} seat(s) needed but no seat is in canonical idle+reclaimable state`,
      candidates: [], seats: summary, policy_version: policy.version,
    };
  }

  const take = Math.min(required, ranked.length);
  const reclaim = ranked.slice(0, take).map((c, i) => ({
    rank: c.rank,
    lane_id: c.lane_id,
    agent_session_id: c.seat.agent_session_id,
    pid: c.seat.pid,
    tmux_session: c.seat.tmux_session,
    idle_ms: c.ranking_key.idle_ms,
    ranking_key: c.ranking_key,
    reclaim_reason: "provider_capacity_contention",
    reclaimed_for: waiting[i] ? {
      admission_id: waiting[i].admission_id ?? null,
      run_id: waiting[i].run_id ?? null,
      lane_id: waiting[i].lane_id ?? null,
    } : null,
  }));

  return {
    schema_version: SEAT_STATE_SCHEMA,
    reclaim,
    required,
    reason: "contention",
    detail: `${waiting.length} waiting, ${available} free; reclaiming the minimum ${take}`,
    candidates: ranked,
    seats: summary,
    policy_version: policy.version,
  };
}

// ── Dormancy ─────────────────────────────────────────────────────────────────

/**
 * Everything that must survive the process, verified BEFORE it is released.
 *
 * Nothing on this list may come from provider memory. A snapshot that depends
 * on the process it describes is not a snapshot.
 */
export const DORMANCY_REQUIRED_FIELDS = Object.freeze([
  "lane_id", "worktree_path", "provider",
]);

/** Fields that are EXPECTED to change across dormancy. Continuity ignores them. */
export const VOLATILE_ACROSS_DORMANCY = Object.freeze([
  "pid", "tmux_pane", "tmux_session", "agent_session_id", "provider_process_id",
]);

/** Fields that must be byte-identical after resume. */
export const CONTINUITY_FIELDS = Object.freeze([
  "lane_id", "repository_id", "worktree_path", "branch", "provider",
  "last_instruction", "last_output", "run_ledger", "attachments",
  "configuration", "conversation_ref", "lane_order",
]);

export function captureDormancyState({
  lane = null, session = null, run = null, runLedger = [], attachments = [],
  conversationRef = null, configuration = null, lastInstruction = null, lastOutput = null,
  now = Date.now(),
} = {}) {
  if (!lane?.lane_id) return null;
  return {
    schema_version: SEAT_STATE_SCHEMA,
    captured_at: now,
    lane_id: lane.lane_id,
    lane_name: lane.name ?? null,
    lane_order: lane.order ?? lane.position ?? null,
    repository_id: lane.repository_id ?? null,
    worktree_path: lane.binding?.worktree_path ?? null,
    worktree_name: lane.binding?.worktree_name ?? null,
    branch: lane.binding?.branch ?? null,
    provider: lane.preferred_provider || lane.binding?.provider || session?.provider || null,
    // Resumable identity. The provider conversation id is what makes the next
    // instruction land in the same conversation rather than a new one.
    provider_session_id: session?.provider_session_id ?? null,
    prior_agent_session_id: session?.agent_session_id ?? null,
    prior_tmux_session: lane.binding?.tmux_session ?? null,
    last_instruction: lastInstruction ?? run?.instruction ?? null,
    last_output: lastOutput ?? run?.completion_report?.summary ?? run?.latest_progress?.summary ?? null,
    last_run_id: run?.run_id ?? null,
    last_run_state: run?.state ?? null,
    run_ledger: (runLedger || []).map((r) => ({ run_id: r.run_id, state: r.state, created_at: r.created_at ?? null })),
    attachments: (attachments || []).map((a) => a?.attachment_id ?? a?.id ?? a).filter(Boolean),
    conversation_ref: conversationRef ?? lane.conversation_id ?? null,
    configuration: configuration ?? lane.configuration ?? null,
  };
}

/**
 * Is the snapshot good enough to stop a process over?
 *
 * A dormancy that loses the lane's binding is worse than a held seat.
 */
export function dormancyIsDurable(snapshot) {
  if (!snapshot) return { ok: false, missing: [...DORMANCY_REQUIRED_FIELDS], error: "no_snapshot" };
  const missing = DORMANCY_REQUIRED_FIELDS.filter((f) => snapshot[f] == null || snapshot[f] === "");
  return missing.length
    ? { ok: false, missing, error: "dormancy_state_not_durable" }
    : { ok: true, missing: [] };
}

/**
 * Did resume preserve the lane?
 *
 * Process ids and pane ids are expected to differ and are excluded by name —
 * a continuity check that failed on them would be untrue, and one that ignored
 * everything would be useless.
 */
export function verifyResumeContinuity(before, after) {
  const differences = [];
  for (const field of CONTINUITY_FIELDS) {
    const a = JSON.stringify(before?.[field] ?? null);
    const b = JSON.stringify(after?.[field] ?? null);
    if (a !== b) differences.push({ field, before: before?.[field] ?? null, after: after?.[field] ?? null });
  }
  return {
    ok: differences.length === 0,
    differences,
    volatile_ignored: [...VOLATILE_ACROSS_DORMANCY],
  };
}

// ── S6 bridge ────────────────────────────────────────────────────────────────

/**
 * The wait a provider-capacity block produces.
 *
 * S8 invents no waiting mechanism: this is the existing
 * `waiting_for_execution_capacity` reason, owned by provider-capacity, bounded
 * by S6 policy. Reclaim resolves it through the canonical run-resume path.
 */
export const PROVIDER_CAPACITY_WAIT_REASON = "waiting_for_execution_capacity";
/** A failed resume is a session-recovery wait, not a new kind of wait. */
export const RESUME_FAILURE_WAIT_REASON = "recovering";

// ── Summary for health ───────────────────────────────────────────────────────

export function summarizeSeats(seats = [], { now = Date.now() } = {}) {
  const counts = Object.fromEntries(SEAT_STATES.map((s) => [s, 0]));
  for (const s of seats) counts[s.state] = (counts[s.state] || 0) + 1;
  const reclaimable = seats.filter((s) => s.state === "idle" && s.reclaimable);
  return {
    schema_version: SEAT_STATE_SCHEMA,
    counts,
    total: seats.length,
    // Dormant seats are durable lanes, not capacity.
    holding_capacity: seats.filter((s) => s.holds_capacity).length,
    idle_reclaimable: reclaimable.length,
    longest_idle_ms: reclaimable.reduce((m, s) => Math.max(m, Number.isFinite(s.idle_since) ? now - s.idle_since : 0), 0),
    reclaimable_lanes: reclaimable.map((s) => s.lane_id).filter(Boolean),
  };
}
