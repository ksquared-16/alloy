/**
 * ONE ANSWER TO "WHAT IS THIS LANE DOING, AND DO I HAVE TO DO ANYTHING?"
 *
 * ── THE PRODUCT LAW ──
 *
 * NEEDS_YOU has exactly one meaning: there is a currently actionable decision
 * that only the operator can provide, and they have not provided it. A decision
 * they already made is history, not an obligation.
 *
 * ── THE DEFECT THIS REPLACES ──
 *
 * `laneAttentionView` derived the obligation from the RUN STATE alone:
 * `NEEDS_INPUT` meant "Needs you". But `releaseRunAfterGovernedFailure` puts a
 * run into NEEDS_INPUT when a governed action FAILS, which is not a question
 * for anybody — there is no input to provide, only an outcome to read.
 *
 * MEASURED: 34 runs have entered NEEDS_INPUT and 10 of them entered because an
 * action failed. Each rendered "Needs you" on a lane where the operator had
 * nothing to do, and the only way to discover that was to open the lane. That
 * is the cost: a badge that is sometimes wrong is a badge that gets checked
 * every time and trusted none of the time.
 *
 * The authoritative source is the governed action store, which knows whether a
 * decision is outstanding: `awaiting_operator` with no recorded decision. Run
 * state answers a different question — what the lane is DOING — and is used for
 * exactly that.
 *
 * ── PRECEDENCE, IN ONE PLACE ──
 *
 *   1. a currently actionable operator request
 *   2. what the run is doing now
 *   3. a self-healing or waiting condition
 *   4. the most recent terminal outcome
 *   5. history
 *
 * Anything lower may never overwrite anything higher. An older transcript line
 * cannot outrank a newer run state, and no historical wait can make a finished
 * lane look unfinished.
 */

export const LANE_OPERATOR_STATE_SCHEMA = "vacilando.lane_operator_state.v1";

/**
 * The whole vocabulary. Six words, and no hidden subtypes.
 *
 * `tone` is the ONLY colour input, and it is a property of the state rather
 * than of how alarming a particular instance felt. "Working" was rendered in an
 * active colour when a run was attached and an error colour when one was not —
 * two colours for one word, which teaches a reader that colour means nothing.
 * A detail worth saying goes in `secondary`, in words.
 */
export const LANE_OPERATOR_STATES = Object.freeze({
  NEEDS_YOU: { label: "Needs you", tone: "attention", actionable: true },
  WORKING: { label: "Working", tone: "active", actionable: false },
  WAITING: { label: "Waiting", tone: "secondary", actionable: false },
  BLOCKED: { label: "Blocked", tone: "blocking", actionable: false },
  FAILED: { label: "Stopped", tone: "blocking", actionable: false },
  READY: { label: "Ready", tone: "neutral", actionable: false },
});

/**
 * Is this governed request still asking the operator something?
 *
 * A recorded decision — approved OR denied — ends the obligation. The record
 * stays; the obligation does not.
 */
export function isUnresolvedOperatorRequest(request) {
  if (!request) return false;
  if (String(request.status) !== "awaiting_operator") return false;
  return !request.operator_approval?.decision;
}

/** Every request this lane is genuinely still waiting on a person for. */
export function unresolvedOperatorRequests(requests = [], laneId = null) {
  return requests.filter((r) =>
    (!laneId || r.lane_id === laneId) && isUnresolvedOperatorRequest(r));
}

/*
 * COPY AN OPERATOR SHOULD NEVER SEE.
 *
 * `execution-stale` renders "The run waited on <reason> past its <policy>
 * bound", and when the reason was missing that reached the operator as
 * "The run waited on null". When it was a caption it read "The run waited on
 * Waiting on Director...". Both are the state machine talking to itself in
 * front of a customer.
 */
const INTERNAL_SUMMARY = /\bwaited on (null|undefined)\b|\bwaited on Waiting on\b|\bnull\b|\bundefined\b/i;

/**
 * Is this string fit to be a lane's current summary?
 *
 * Refusing is better than rewriting: a summary nobody can phrase honestly
 * should be absent, and the surface falls back to the state's own label.
 */
export function isPresentableSummary(text) {
  const s = String(text ?? "").trim();
  if (!s) return false;
  return !INTERNAL_SUMMARY.test(s);
}

export function presentableSummary(text, fallback = null) {
  return isPresentableSummary(text) ? String(text).trim() : fallback;
}

/**
 * Derive one lane's current operator state.
 *
 * Sources are passed in rather than read, so the precedence is testable without
 * a runtime and so there is exactly one place where it is decided.
 */
export function laneOperatorState({
  laneId = null,
  runState = null,
  runStateReason = null,
  requests = [],
  executionTracked = true,
  summary = null,
} = {}) {
  const pending = unresolvedOperatorRequests(requests, laneId);
  const run = String(runState || "").toUpperCase();

  // 1. THE ONLY THING THAT MAKES A LANE ACTIONABLE.
  if (pending.length) {
    return finalize({
      state: "NEEDS_YOU",
      pending,
      secondary: pending.length > 1 ? `${pending.length} decisions waiting` : null,
      summary,
    });
  }

  // 2. WHAT THE RUN IS DOING. NEEDS_INPUT is deliberately absent: with no
  //    unresolved request it is a run that stopped, not a question.
  if (run === "EXECUTING") {
    return finalize({
      state: "WORKING",
      pending,
      // The subtype in WORDS, not in a second colour. An unattached run is a
      // transient tracking condition the operator cannot act on and which
      // resolves itself the moment a run opens.
      secondary: executionTracked ? null : "Execution tracking is connecting",
      summary,
    });
  }
  if (run === "VALIDATING") return finalize({ state: "WORKING", pending, secondary: "Validating", summary });
  if (run === "WAITING_RESOURCE") return finalize({ state: "WAITING", pending, secondary: null, summary });
  if (run === "RECOVERING") return finalize({ state: "WAITING", pending, secondary: "Recovering", summary });
  if (run === "NEEDS_INPUT") {
    /*
     * A run parked here with nothing outstanding is BLOCKED, not NEEDS_YOU.
     * The difference is the whole point: blocked says "this stopped and you may
     * want to look", needs-you says "it cannot continue until you answer".
     */
    return finalize({ state: "BLOCKED", pending, secondary: presentableSummary(runStateReason), summary });
  }
  if (run === "FAILED" || run === "ABANDONED") return finalize({ state: "FAILED", pending, secondary: null, summary });

  // 4. NOTHING RUNNING. The most recent outcome, or simply ready.
  return finalize({ state: "READY", pending, secondary: null, summary });
}

function finalize({ state, pending, secondary, summary }) {
  const def = LANE_OPERATOR_STATES[state];
  return {
    schema_version: LANE_OPERATOR_STATE_SCHEMA,
    state,
    label: def.label,
    tone: def.tone,
    actionable: def.actionable,
    // The count IS the number of outstanding decisions. A badge that counts
    // anything else is a badge that has to be verified by opening the lane.
    needs_you_count: pending.length,
    pending_request_ids: pending.map((r) => r.request_id),
    secondary: secondary || null,
    // History may not speak for the present. An unpresentable summary is
    // dropped rather than shown, and the label carries the meaning instead.
    summary: presentableSummary(summary),
  };
}

/**
 * ATTACH THE CANONICAL STATE TO EVERY LANE THE API RETURNS.
 *
 * `/api/v2/lanes` composed a lane from a chain of `attach*` helpers and attached
 * no operator state at all, so every surface that needed one — the list, the
 * header, the bell, the approval card, the composer — derived its own from
 * `lane.execution_run`. Six readers, six rules, and the only way to find out
 * they disagreed was to look at two of them at once.
 *
 * This makes the API the single producer. A surface may map or re-word what it
 * finds here; it may not compute it again.
 *
 * The governed requests are READ ONCE for the whole list. Reading per lane is
 * not merely slower — it lets two lanes in the same response answer from
 * different instants, which is exactly the class of disagreement this removes.
 */
export function attachLaneOperatorState(lanes, { requests = null, readRequests = null } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  let all = requests;
  if (!Array.isArray(all)) {
    try { all = typeof readRequests === "function" ? readRequests() : []; }
    catch { all = []; }
  }
  return list.map((lane) => {
    const run = lane?.execution_run || null;
    const state = laneOperatorState({
      laneId: lane?.lane_id ?? null,
      runState: run?.state ?? null,
      runStateReason: run?.state_reason ?? null,
      requests: all,
      // A lane whose provider is working without a run attached is WORKING with
      // a tracking note, never an error and never an operator obligation.
      executionTracked: Boolean(run?.run_id),
      summary: lane?.summary ?? run?.state_reason ?? null,
    });
    return {
      ...lane,
      operator_state: state.state,
      operator_tone: state.tone,
      needs_you: state.actionable,
      needs_you_count: state.needs_you_count,
      pending_request_ids: state.pending_request_ids,
      primary_status: state.label,
      secondary_status: state.secondary,
      operator_summary: state.summary,
      // The whole object too, so a surface that wants everything reads one
      // field rather than reassembling it from six.
      lane_operator_state: state,
    };
  });
}

/**
 * The badge. One number, and it is the number of decisions outstanding.
 *
 * Not runs in NEEDS_INPUT, not historical approvals, not failed actions. A count
 * that includes any of those has to be verified by opening the lane, which is
 * the same as not having a count.
 */
export function operatorAttentionCount(requests = []) {
  return unresolvedOperatorRequests(requests).length;
}
