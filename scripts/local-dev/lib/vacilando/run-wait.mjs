/**
 * S6 — the canonical waiting contract for Execution Runs.
 *
 * THE RULE. A run may be non-terminal, but it may never be non-terminal
 * INDEFINITELY without saying what it waits on, who owns that condition, when
 * the waiting began, and what happens when the condition resolves or the bound
 * expires. "Queued" with no further information is not a state; it is an
 * absence of one.
 *
 * THE GAP THIS CLOSES. Fixture Proof sat QUEUED for 2.8 days on
 * `waiting_for_agent_session` for a lane with no worktree binding — a session
 * that could never arrive. Nothing owned that wait, so nothing could ever end
 * it. A wait whose condition is impossible must fail truthfully and quickly,
 * with the reason named.
 *
 * BOUNDED IS NOT THE SAME AS IMPATIENT. NEEDS_INPUT may legitimately wait for a
 * person for as long as it takes — but that must be an EXPLICIT policy
 * (`human_indefinite`), never the absence of a bound. The difference between
 * "we decided this waits for a human" and "nobody thought about it" is the
 * whole point of this module.
 *
 * AGE IS NEVER THE VERDICT. Status comes from the deadline and the policy. A
 * five-day human wait is healthy; a five-minute machine wait past its bound is
 * not.
 *
 * NOTHING HERE TERMINATES A PROCESS. Reconciliation transitions RUN STATE
 * through the existing failure path. Providers and validation processes are
 * never signalled.
 */

export const RUN_WAIT_SCHEMA = "vacilando.run_wait.v1";

/** How a wait is allowed to end. */
export const BOUND_POLICIES = Object.freeze(["bounded", "human_indefinite", "invalid"]);

/** Observable status of a wait. Derived from policy and deadline, never age. */
export const WAIT_STATUS = Object.freeze([
  "waiting", "near_deadline", "expired", "indefinite_human", "invalid", "resolved",
]);

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

/**
 * Bound policy per waiting reason, with the canonical owner of each condition.
 *
 * Every machine/resource wait is bounded. The only unbounded entry is the
 * deliberate human one, and it says so.
 */
export const WAIT_REASONS = Object.freeze({
  waiting_for_agent_session: {
    resource_type: "agent_session",
    owner: "agent-session-lifecycle",
    policy: "bounded",
    bound_ms: 30 * MIN,
    // A lane with no worktree/session binding can NEVER get a session. That is
    // not a slow wait, it is an impossible one, and it fails immediately.
    impossible_when: "no_session_binding",
  },
  waiting_for_execution_capacity: {
    resource_type: "provider_capacity",
    owner: "provider-capacity",
    policy: "bounded",
    bound_ms: 2 * HOUR,
  },
  waiting_for_validation_capacity: {
    resource_type: "validation_tokens",
    owner: "validation-admission",
    policy: "bounded",
    bound_ms: HOUR,
  },
  waiting_for_resource_lease: {
    resource_type: "named_resource",
    owner: "execution-resource",
    policy: "bounded",
    bound_ms: 2 * HOUR,
  },
  waiting_for_machine_pressure: {
    resource_type: "host_capacity",
    owner: "capacity-policy",
    policy: "bounded",
    bound_ms: HOUR,
  },
  send_in_progress: {
    resource_type: "lane_send_lock",
    owner: "execution-run-send",
    policy: "bounded",
    // A transient concurrency refusal. execution-resume already lists it as
    // RETRYABLE; failing a run on it was the defect this slice fixes.
    bound_ms: 5 * MIN,
  },
  recovering: {
    resource_type: "session_recovery",
    owner: "execution-stale",
    policy: "bounded",
    bound_ms: 20 * MIN,
  },
  needs_operator_input: {
    resource_type: "operator",
    owner: "director",
    // EXPLICIT policy, not an oversight. A question for a person waits until the
    // person answers.
    policy: "human_indefinite",
    bound_ms: null,
  },
});

/** Fraction of the bound after which a wait is reported as near-deadline. */
export const NEAR_DEADLINE_FRACTION = 0.8;

/**
 * Build a wait descriptor.
 *
 * An unrecognised reason produces an `invalid` descriptor rather than a
 * silently-unbounded one: a wait nobody defined is a defect to surface, not a
 * state to keep alive.
 */
export function describeWait({
  reason,
  resource_id = null,
  waiting_since,
  now = Date.now(),
  context = {},
  policyTable = WAIT_REASONS,
} = {}) {
  const spec = policyTable[reason] || null;
  const since = Number(waiting_since) || now;

  if (!spec) {
    return {
      schema_version: RUN_WAIT_SCHEMA,
      reason: reason || null,
      resource_type: null,
      resource_id,
      owner: null,
      waiting_since: since,
      deadline: null,
      bound_policy: "invalid",
      last_observed_at: now,
      resolution_state: "invalid",
      invalid_because: reason ? "unknown_wait_reason" : "missing_wait_reason",
    };
  }

  // Impossible conditions are not slow — they never resolve. Detected here so
  // the deadline never has to expire before the truth is available.
  const impossible = spec.impossible_when && context?.[spec.impossible_when] === true;

  return {
    schema_version: RUN_WAIT_SCHEMA,
    reason,
    resource_type: spec.resource_type,
    resource_id,
    owner: spec.owner,
    waiting_since: since,
    deadline: spec.policy === "bounded" ? since + spec.bound_ms : null,
    bound_policy: spec.policy,
    last_observed_at: now,
    resolution_state: impossible ? "impossible" : "waiting",
    ...(impossible ? { impossible_because: spec.impossible_when } : {}),
  };
}

/**
 * Current status of a wait.
 *
 * Derived from policy and deadline. Age alone never appears in this decision —
 * a long human wait is healthy and a short expired machine wait is not.
 */
export function waitStatus(descriptor, now = Date.now()) {
  if (!descriptor) return "invalid";
  if (descriptor.resolution_state === "resolved") return "resolved";
  if (descriptor.bound_policy === "invalid") return "invalid";
  if (descriptor.resolution_state === "impossible") return "expired";
  if (descriptor.bound_policy === "human_indefinite") return "indefinite_human";
  const { deadline, waiting_since: since } = descriptor;
  if (!Number.isFinite(deadline)) return "invalid";
  if (now >= deadline) return "expired";
  const span = deadline - since;
  if (span > 0 && (now - since) / span >= NEAR_DEADLINE_FRACTION) return "near_deadline";
  return "waiting";
}

/**
 * What should happen to this wait right now?
 *
 * Deterministic and side-effect free: the caller performs the transition
 * through the canonical run path. Nothing here mutates a run or a process.
 */
export function reconcileWait(descriptor, { resolved = false, now = Date.now() } = {}) {
  if (resolved) {
    return {
      action: "resume",
      via: "canonical_run_path",
      descriptor: { ...descriptor, resolution_state: "resolved", last_observed_at: now },
    };
  }
  const status = waitStatus(descriptor, now);
  switch (status) {
    case "indefinite_human":
      // Explicitly allowed to stay non-terminal. Never stale.
      return { action: "hold", reason: "explicit_human_wait_policy", descriptor: { ...descriptor, last_observed_at: now } };
    case "invalid":
      // Surfaced, not kept alive on a guess.
      return {
        action: "fail",
        via: "canonical_failure_path",
        failure_reason: descriptor?.invalid_because || "invalid_wait_descriptor",
        // The prior wait is retained as evidence on the terminal run.
        evidence: { ...descriptor, last_observed_at: now },
      };
    case "expired":
      return {
        action: "fail",
        via: "canonical_failure_path",
        failure_reason: descriptor.resolution_state === "impossible"
          ? `${descriptor.reason}_impossible`
          : `${descriptor.reason}_bound_exceeded`,
        evidence: { ...descriptor, last_observed_at: now, expired_at: now },
      };
    case "near_deadline":
      return { action: "hold", reason: "near_deadline", descriptor: { ...descriptor, last_observed_at: now } };
    default:
      return { action: "hold", reason: "within_bound", descriptor: { ...descriptor, last_observed_at: now } };
  }
}

/**
 * Bounded backoff for the reconciler.
 *
 * Never a busy loop: the interval grows with each unresolved observation and is
 * capped, so a wait that will not resolve costs almost nothing to keep checking.
 */
export function nextBackoffMs(observations = 0, { baseMs = 2000, maxMs = 60000 } = {}) {
  const n = Math.max(0, Math.floor(observations));
  return Math.min(maxMs, baseMs * 2 ** Math.min(n, 10));
}

/**
 * Adapt an S5 validation-capacity queue entry to the canonical contract.
 *
 * S5 already carried owner, axes, waiting_since and wait_deadline. S6 does not
 * give it separate semantics — it expresses the same wait in the one shape
 * every other wait uses.
 */
export function waitFromValidationQueueEntry(entry, { now = Date.now() } = {}) {
  if (!entry) return null;
  const spec = WAIT_REASONS.waiting_for_validation_capacity;
  return {
    schema_version: RUN_WAIT_SCHEMA,
    reason: "waiting_for_validation_capacity",
    resource_type: spec.resource_type,
    resource_id: entry.request_id || null,
    owner: spec.owner,
    waiting_since: Number(entry.waiting_since) || now,
    // S5's own deadline is authoritative when present; the policy default fills in.
    deadline: Number(entry.wait_deadline) || (Number(entry.waiting_since) || now) + spec.bound_ms,
    bound_policy: "bounded",
    last_observed_at: now,
    resolution_state: "waiting",
    blocked_axes: (entry.blocked_by || []).map((b) => b.axis),
    lane_id: entry.lane_id ?? null,
    execution_run_id: entry.execution_run_id ?? null,
  };
}

/** Summarise a set of waits for health. */
export function summarizeWaits(descriptors = [], now = Date.now()) {
  const counts = { waiting: 0, near_deadline: 0, expired: 0, indefinite_human: 0, invalid: 0, resolved: 0 };
  const expired = [];
  const invalid = [];
  for (const d of descriptors) {
    const s = waitStatus(d, now);
    counts[s] = (counts[s] || 0) + 1;
    if (s === "expired") expired.push(d);
    if (s === "invalid") invalid.push(d);
  }
  return { counts, expired, invalid, total: descriptors.length };
}
