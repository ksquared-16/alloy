/**
 * A LANE MUST BE ABLE TO HEAR ABOUT THE ACTION IT ASKED FOR.
 *
 * THE DEFECT. A lane files a governed action during its turn. The action is
 * decided — approved, executed, or refused — and Vacilando immediately tries to
 * tell the lane by pasting into its bound tmux pane. The pane is the same pane
 * that is still executing the turn in which the action was requested, so
 * `assessPanePromptReadiness` correctly answers `busy` and delivery is refused
 * `provider_prompt_not_ready`. That refusal was recorded on the request and
 * NOTHING EVER TRIED AGAIN. The lane was never told.
 *
 * MEASURED, on this host: 37 of 62 failed governed actions carry
 * `resume_delivery.error = "provider_prompt_not_ready"`. Thirty-seven times a
 * lane asked for something, was refused for a real reason, and never found out
 * why. The same hole exists on the success path — `resumeLaneAfterGovernedAction`
 * records the identical dead field — so a lane can equally miss the result of an
 * action that WORKED.
 *
 * WHAT THIS IS NOT. It is not the case that prompt-readiness terminally failed
 * governed actions: across the whole store, ZERO actions have
 * `failure_code: provider_prompt_not_ready`. Every one of those 37 failed on its
 * own merits first — `repository_not_allowlisted`, `query_hash_mismatch`,
 * `execution_failed` — and prompt-readiness only stopped the lane from being
 * told. Reading the symptom the other way round is easy and wrong: from inside
 * the lane, the only signal that ever arrives is the delivery error, so the
 * messenger's failure looks exactly like the action's.
 *
 * PROMPT-READINESS IS NOT THE BUG. Pasting into a busy pane would corrupt the
 * turn in progress. The bug is treating TEMPORARILY not ready as a permanent
 * outcome — a lane is busy precisely because it is doing the work that will make
 * it ready, and the one thing guaranteed about that state is that it ends.
 *
 * SO: defer, and redeliver when the lane yields.
 *
 *   DELIVERED                 the lane has been told; terminal, exactly once
 *   PENDING_PROMPT_READINESS  temporarily undeliverable; try again on yield
 *   UNDELIVERABLE             permanently undeliverable; terminal, and says why
 *
 * The redelivery signal is the lane's own run reaching a terminal state — the
 * canonical "I have yielded". No new scheduler, no sleeping a guessed number of
 * milliseconds, and no asking the worker to predict when its own pane goes idle.
 * The conductor tick that already runs every 30 seconds is the safety net for
 * turns that end without a clean transition.
 */
/*
 * The store lives in governed-action-request.mjs, which imports THIS module to
 * defer its own deliveries. Importing it back would make a cycle, so the three
 * store operations are injected. They are also the whole seam the tests need:
 * a deterministic redelivery test should not have to stand up a runtime root
 * just to prove a busy pane defers instead of failing.
 */
let store = null;
export function setDeliveryStoreForTests(impl) { store = impl || null; }
export function resetDeliveryStoreForTests() { store = null; }

async function storeApi() {
  if (store) return store;
  const m = await import("./governed-action-request.mjs");
  return {
    get: (id, root) => m.getGovernedAction(id, root),
    list: ({ root }) => m.listGovernedActions({ root, limit: 1000 }),
    save: (rec, root) => m.saveGovernedActionRecord(rec, root),
  };
}

export const DELIVERY_SCHEMA = "vacilando.governed_notification_delivery.v1";

export const DELIVERY_STATES = Object.freeze({
  DELIVERED: "DELIVERED",
  PENDING: "PENDING_PROMPT_READINESS",
  UNDELIVERABLE: "UNDELIVERABLE",
});

/**
 * Temporarily not ready. Every one of these ends on its own once the lane
 * finishes what it is doing.
 */
export const TEMPORARY_READINESS_STATES = Object.freeze(["busy", "unknown", "blocked"]);

/**
 * Delivery errors that mean "not now", not "not ever".
 *
 * `send_in_progress` and the awaiting_* codes are the same condition seen from a
 * different angle: another delivery to this lane is mid-flight.
 */
export const TEMPORARY_DELIVERY_ERRORS = Object.freeze([
  "send_in_progress",
  "awaiting_instruction_receipt",
  "awaiting_provider_output",
  "duplicate_send",
]);

/**
 * Permanently undeliverable. A retry cannot change any of these, and retrying
 * would turn a clear failure into an unbounded one.
 */
export const PERMANENT_DELIVERY_ERRORS = Object.freeze([
  "lane_not_found",
  "invalid_lane_id",
  "missing_target",
  "target_mismatch",
  "pane_unavailable",
  "instruction_empty",
  "instruction_too_large",
  "unexpected_control_field",
  "unsupported_key_argv",
  "cursor_delivery_unavailable",
  "transcript_unreadable",
  "latest_response_failed",
  "delivery_failed",
  "lane_closed",
  "lane_worktree_unregistered",
]);

/** Bounded. A deferral that never resolves must become a visible dead end. */
export const MAX_REDELIVERY_ATTEMPTS = 12;
export const MAX_REDELIVERY_AGE_MS = 60 * 60 * 1000;

const iso = (ms) => new Date(ms).toISOString();

/**
 * Was this delivery temporarily or permanently impossible?
 *
 * Fails closed on anything unrecognised: an error we cannot classify becomes
 * UNDELIVERABLE rather than an unbounded retry. A stuck queue is worse than a
 * reported dead end, because a dead end is something an operator can see.
 */
export function classifyDeliveryOutcome(delivered) {
  if (delivered?.ok) return { state: DELIVERY_STATES.DELIVERED, temporary: false, reason: null };
  const error = String(delivered?.error || "unknown_delivery_error");
  const readiness = String(delivered?.prompt_readiness?.state || delivered?.readiness?.state || "");

  if (error === "provider_prompt_not_ready") {
    // `capture_unavailable` means the pane could not be read at all. That is not
    // a busy pane; treat it as permanent so a vanished pane cannot hold a
    // deferral open for an hour.
    if (TEMPORARY_READINESS_STATES.includes(readiness)) {
      return { state: DELIVERY_STATES.PENDING, temporary: true, reason: readiness };
    }
    if (!readiness) {
      // No readiness detail. The refusal itself is the readiness gate, and the
      // overwhelmingly common cause is a busy pane, so defer — bounded.
      return { state: DELIVERY_STATES.PENDING, temporary: true, reason: "not_ready" };
    }
    return { state: DELIVERY_STATES.UNDELIVERABLE, temporary: false, reason: readiness };
  }
  if (TEMPORARY_DELIVERY_ERRORS.includes(error)) {
    return { state: DELIVERY_STATES.PENDING, temporary: true, reason: error };
  }
  return { state: DELIVERY_STATES.UNDELIVERABLE, temporary: false, reason: error };
}

/**
 * Record what one delivery attempt did, and what happens next.
 *
 * `kind` is the notification this record owes its lane, so a redelivery can
 * rebuild exactly the same message rather than inventing a second one.
 */
export function recordDeliveryAttempt(rec, delivered, {
  kind,
  nowMs = Date.now(),
  save = null,
} = {}) {
  const verdict = classifyDeliveryOutcome(delivered);
  const prev = rec.notification_delivery || {};
  const attempts = Number(prev.attempts || 0) + 1;

  let state = verdict.state;
  let exhausted = null;
  if (state === DELIVERY_STATES.PENDING) {
    const firstAt = prev.first_deferred_at ? Date.parse(prev.first_deferred_at) : nowMs;
    if (attempts >= MAX_REDELIVERY_ATTEMPTS) {
      state = DELIVERY_STATES.UNDELIVERABLE;
      exhausted = "max_attempts";
    } else if (nowMs - firstAt > MAX_REDELIVERY_AGE_MS) {
      state = DELIVERY_STATES.UNDELIVERABLE;
      exhausted = "window_expired";
    }
  }

  rec.notification_delivery = {
    schema_version: DELIVERY_SCHEMA,
    state,
    kind: kind || prev.kind || null,
    attempts,
    first_deferred_at: verdict.temporary
      ? (prev.first_deferred_at || iso(nowMs))
      : (prev.first_deferred_at || null),
    last_attempt_at: iso(nowMs),
    last_error: delivered?.ok ? null : (delivered?.error || "unknown_delivery_error"),
    last_readiness_state: delivered?.prompt_readiness?.state || null,
    reason: exhausted || verdict.reason,
    delivered_at: state === DELIVERY_STATES.DELIVERED ? iso(nowMs) : (prev.delivered_at || null),
  };
  rec.updated_at = iso(nowMs);
  if (typeof save === "function") save(rec);
  return rec.notification_delivery;
}

/** Governed actions still owed a notification, oldest deferral first. */
export async function pendingNotificationDeliveries({ root = undefined, laneId = null } = {}) {
  const api = await storeApi();
  const all = (await api.list({ root })) || [];
  return all
    .filter((r) => r?.notification_delivery?.state === DELIVERY_STATES.PENDING)
    .filter((r) => (laneId ? r.lane_id === laneId : true))
    .sort((a, b) => String(a.notification_delivery.first_deferred_at || "")
      .localeCompare(String(b.notification_delivery.first_deferred_at || "")));
}

/**
 * EXACTLY ONCE.
 *
 * Two drains can run at the same moment — the run-terminal hook and the
 * conductor tick — so an in-flight claim is taken before any send, and the
 * record is re-read inside the claim. A request that is no longer PENDING is
 * skipped, not resent: one governed action, one decision surface, one
 * notification.
 */
const inFlight = new Set();

export function inFlightRedeliveries() {
  return [...inFlight];
}

export function resetRedeliveryStateForTests() {
  inFlight.clear();
}

export async function redeliverGovernedNotification(requestId, {
  root = undefined,
  nowMs = Date.now(),
  send,
  getLane = null,
  buildText,
} = {}) {
  const id = String(requestId || "");
  if (!id) return { ok: false, error: "missing_request_id" };
  if (inFlight.has(id)) return { ok: false, error: "redelivery_in_flight", skipped: true };
  inFlight.add(id);
  try {
    const api = await storeApi();
    const save = (r) => api.save(r, root);
    const rec = await api.get(id, root);
    if (!rec) return { ok: false, error: "request_not_found" };
    const pending = rec.notification_delivery;
    if (pending?.state !== DELIVERY_STATES.PENDING) {
      return { ok: false, error: "not_pending", skipped: true, state: pending?.state || null };
    }

    // A lane that is gone or closed can never be told. That is a permanent
    // outcome and must be recorded as one rather than retried to the bound.
    if (typeof getLane === "function") {
      let lane = null;
      try { lane = await getLane(rec.lane_id); } catch { lane = null; }
      const record = lane?.lane || lane || null;
      if (!record) {
        recordDeliveryAttempt(rec, { ok: false, error: "lane_not_found" }, { kind: pending.kind, nowMs, save });
        return { ok: false, error: "lane_not_found", terminal: true };
      }
      if (String(record.status || "").toUpperCase() === "CLOSED") {
        recordDeliveryAttempt(rec, { ok: false, error: "lane_closed" }, { kind: pending.kind, nowMs, save });
        return { ok: false, error: "lane_closed", terminal: true };
      }
    }

    const text = await buildText(rec);
    if (!text) {
      recordDeliveryAttempt(rec, { ok: false, error: "instruction_empty" }, { kind: pending.kind, nowMs, save });
      return { ok: false, error: "instruction_empty", terminal: true };
    }
    const delivered = await send(rec.lane_id, text, {
      origin: "director",
      source: pending.kind || "governed_action_resume",
      runId: rec.run_id,
      redelivery: true,
    });
    const outcome = recordDeliveryAttempt(rec, delivered, { kind: pending.kind, nowMs, save });
    return {
      ok: Boolean(delivered?.ok),
      request_id: id,
      state: outcome.state,
      attempts: outcome.attempts,
      error: delivered?.ok ? null : (delivered?.error || null),
    };
  } finally {
    inFlight.delete(id);
  }
}

/**
 * Drain everything a lane is owed. Called when a run reaches a terminal state —
 * the lane has yielded, which is the only moment its pane is expected to become
 * pastable — and again from the conductor tick for turns that end untidily.
 */
export async function drainGovernedNotifications({
  root = undefined,
  laneId = null,
  nowMs = Date.now(),
  send,
  getLane = null,
  buildText,
  limit = 25,
} = {}) {
  const due = (await pendingNotificationDeliveries({ root, laneId })).slice(0, limit);
  const results = [];
  for (const rec of due) {
    results.push(await redeliverGovernedNotification(rec.request_id, { root, nowMs, send, getLane, buildText }));
  }
  return {
    ok: true,
    considered: due.length,
    delivered: results.filter((r) => r.ok).length,
    still_pending: results.filter((r) => r.state === DELIVERY_STATES.PENDING).length,
    results,
  };
}
