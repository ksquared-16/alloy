/**
 * Stale / orphaned Execution Run reconciliation.
 *
 * A non-terminal run is not automatically "active work". Certification soak,
 * pre-protocol bookkeeping, and sessions that returned to idle without a
 * structured completion event can leave EXECUTING forever. That must not
 * permanently block a durable lane.
 *
 * Terminal choice: ABANDONED, not FAILED.
 *   FAILED = the work itself failed.
 *   COMPLETE = the work finished.
 *   ABANDONED = the run is no longer live work; closed by reconciliation or
 *     operator. History is preserved. A stale certification run is not a
 *     product failure.
 * SUPERSEDED was considered for replacement-by-newer-run; this closer is
 * orphaned bookkeeping, not a successor run, so ABANDONED is the fit.
 *
 * Authority is durable JSON facts (run, sends, resources, session). TUI
 * prompt and spinner glyphs are never parsed.
 */
import {
  activeRunForLane,
  getExecutionRun,
  isCertificationInstruction,
  isTerminalRunState,
  publicExecutionRun,
  readExecutionRunStore,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { readResourceRequestStore } from "./execution-resource.mjs";
import { SEND_BASELINE_WINDOW_MS, readLaneRuntimeStore } from "./lane-runtime.mjs";
import { activeAgentSessionForLane } from "./agent-session.mjs";
import { canonicalLaneStoreId } from "./development-lane.mjs";

const OPEN_REQUEST = new Set(["REQUESTED", "QUEUED", "GRANTED"]);
const IN_FLIGHT_CONTINUATION = new Set(["PENDING", "DELIVERING"]);
const SESSION_BUSY = new Set(["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"]);
const PROTECTIVE_STATES = new Set(["VALIDATING", "RECOVERING", "WAITING_RESOURCE", "NEEDS_INPUT"]);

/** Genuine post-delivery activity is protective within this window. Not sole stale authority. */
export const STALE_ACTIVITY_RECENT_MS = 30 * 60 * 1000;
/** Auto-abandon is not allowed until the run has had time to report after it actually started. */
export const STALE_SETTLE_MS = 15 * 60 * 1000;

function parseMs(iso) {
  const n = Date.parse(iso || "");
  return Number.isFinite(n) ? n : null;
}

function hasAgentReport(run) {
  if (run?.latest_progress) return true;
  return (run?.transitions || []).some((t) => t?.origin === "agent");
}

function sendRecForRun(run, sendStore, root) {
  const lanes = sendStore?.lanes || {};
  const id = run?.lane_id;
  return lanes[id]
    || lanes[canonicalLaneStoreId(id, root)]
    || null;
}

function requestsForRun(run, resourceStore) {
  const id = run?.run_id;
  if (!id) return [];
  return (resourceStore?.requests || []).filter((r) => r.run_id === id);
}

function hasOpenResource(requests) {
  return requests.some((r) => OPEN_REQUEST.has(r.state));
}

function hasInFlightContinuation(requests) {
  return requests.some((r) => IN_FLIGHT_CONTINUATION.has(r.continuation?.delivery_state));
}

function isDeliveryEcho(deliveredMs, activityMs) {
  if (deliveredMs == null || activityMs == null) return false;
  const delta = activityMs - deliveredMs;
  return delta >= 0 && delta <= SEND_BASELINE_WINDOW_MS;
}

/**
 * Collect cheap facts already on disk. No pane capture, no transcript parse.
 */
export function collectStaleRunFacts(run, { root, nowMs = Date.now(), sendStore, resourceStore } = {}) {
  const sends = sendStore || readLaneRuntimeStore(root);
  const resources = resourceStore || readResourceRequestStore(root);
  const send = sendRecForRun(run, sends, root);
  const requests = requestsForRun(run, resources);
  let session = null;
  try { session = activeAgentSessionForLane(run.lane_id, root); } catch { session = null; }
  const deliveredMs = parseMs(send?.delivered_at) || parseMs(run?.started_at) || parseMs(run?.created_at);
  const activityMs = parseMs(send?.activity_at);
  return {
    delivered_ms: deliveredMs,
    activity_ms: activityMs,
    activity_is_delivery_echo: isDeliveryEcho(deliveredMs, activityMs),
    open_resource: hasOpenResource(requests),
    in_flight_continuation: hasInFlightContinuation(requests),
    request_count: requests.length,
    session_state: session?.state || null,
    session_run_id: session?.run_id || null,
    now_ms: nowMs,
  };
}

function genuineRecentActivity(facts) {
  if (facts.activity_ms == null) return false;
  if (facts.activity_is_delivery_echo) return false;
  return (facts.now_ms - facts.activity_ms) <= STALE_ACTIVITY_RECENT_MS;
}

function lastExecutingAt(run) {
  const fromStarted = parseMs(run?.started_at);
  const exec = [...(run?.transitions || [])].reverse().find((t) => t?.to_state === "EXECUTING");
  const fromTransition = parseMs(exec?.occurred_at || exec?.at);
  return fromStarted ?? fromTransition ?? null;
}

function pastSettle(run, facts) {
  // Queue wait is not settle time. A run can sit QUEUED for hours, then
  // start; created_at must not make that look abandoned two minutes later.
  const start = lastExecutingAt(run) || facts.delivered_ms;
  if (start == null) return false;
  return facts.now_ms - start >= STALE_SETTLE_MS;
}

/**
 * @returns {{ class: "active"|"stale"|"ambiguous", reason: string, evidence: object, summary?: string }}
 */
export function classifyExecutionRunStale(run, facts = {}) {
  const nowMs = facts.now_ms || Date.now();
  const merged = { ...facts, now_ms: nowMs };
  const evidence = {
    state: run?.state || null,
    origin: run?.origin || null,
    certification: Boolean(run?.origin === "certification" || isCertificationInstruction(run?.instruction)),
    has_agent_report: hasAgentReport(run),
    has_progress: Boolean(run?.latest_progress),
    recovery_state: run?.recovery_state || null,
    open_resource: Boolean(merged.open_resource),
    in_flight_continuation: Boolean(merged.in_flight_continuation),
    genuine_recent_activity: genuineRecentActivity(merged),
    activity_is_delivery_echo: Boolean(merged.activity_is_delivery_echo),
    session_state: merged.session_state || null,
    past_settle: pastSettle(run, merged),
  };

  if (!run || isTerminalRunState(run.state)) {
    return { class: "active", reason: "terminal", evidence };
  }
  if (PROTECTIVE_STATES.has(run.state)) {
    return { class: "active", reason: `protective_state_${run.state.toLowerCase()}`, evidence };
  }
  const governedPending = run.state === "WAITING_RESOURCE" && (
    run.resource_wait?.resource_key === "director_governed_action"
    || ["requested", "awaiting_director", "awaiting_operator", "executing"].includes(run.governed_action?.status)
  );
  if (governedPending) {
    return { class: "active", reason: "governed_action_pending", evidence };
  }
  if (run.state_reason === "governed_action_complete") {
    const resumedAt = parseMs(
      [...(run.transitions || [])].reverse().find((t) =>
        t?.to_state === "EXECUTING" && t?.reason === "governed_action_complete"
      )?.at,
    ) || parseMs(run.updated_at);
    if (resumedAt != null && (nowMs - resumedAt) < STALE_SETTLE_MS) {
      return { class: "active", reason: "governed_action_resumed", evidence };
    }
  }
  if (run.state !== "EXECUTING") {
    return { class: "active", reason: "not_executing", evidence };
  }
  if (run.recovery_state) {
    return { class: "active", reason: "recovery_in_flight", evidence };
  }
  if (evidence.open_resource) {
    return { class: "active", reason: "open_resource", evidence };
  }
  if (evidence.in_flight_continuation) {
    return { class: "active", reason: "in_flight_continuation", evidence };
  }
  if (SESSION_BUSY.has(merged.session_state) || merged.session_state === "ACTIVE") {
    return { class: "active", reason: merged.session_state === "ACTIVE" ? "live_agent_session" : "session_busy", evidence };
  }
  if (evidence.genuine_recent_activity) {
    return { class: "active", reason: "recent_output_activity", evidence };
  }
  if (evidence.has_agent_report || evidence.has_progress) {
    return {
      class: "ambiguous",
      reason: "managed_reports_without_recent_activity",
      evidence,
    };
  }
  if (!evidence.past_settle) {
    return { class: "active", reason: "still_settling", evidence };
  }

  const preProtocol = !evidence.has_agent_report;
  if (evidence.certification || preProtocol) {
    const reason = evidence.certification ? "stale_certification_run" : "orphaned_pre_protocol_run";
    return {
      class: "stale",
      reason,
      evidence,
      summary: evidence.certification
        ? "Abandoned: certification/soak run went idle without a completion report."
        : "Abandoned: run never reported managed status and is no longer live work.",
    };
  }

  return { class: "ambiguous", reason: "executing_without_live_signals", evidence };
}

function abandonRun(run, { root, nowMs, origin, reason, summary }) {
  return transitionExecutionRun(run.run_id, "ABANDONED", {
    reason,
    origin,
    nowMs,
    root,
    completion_report: { summary: summary || "Abandoned: stale/orphaned run; no work failure." },
  });
}

/**
 * Cheap pass: inspect current non-terminal runs from JSON and abandon those
 * classified stale. Does not capture Claude output.
 */
export function reconcileStaleExecutionRuns({
  root,
  nowMs = Date.now(),
  laneId = null,
} = {}) {
  const store = readExecutionRunStore(root);
  const sendStore = readLaneRuntimeStore(root);
  const resourceStore = readResourceRequestStore(root);
  const ids = laneId
    ? [canonicalLaneStoreId(laneId, root), String(laneId)].filter((id, i, arr) => arr.indexOf(id) === i)
    : Object.keys(store.lanes || {});
  const abandoned = [];
  const seen = new Set();
  for (const id of ids) {
    const pack = store.lanes[id];
    if (!pack?.current_run_id) continue;
    const run = (pack.runs || []).find((r) => r.run_id === pack.current_run_id);
    if (!run || seen.has(run.run_id) || isTerminalRunState(run.state)) continue;
    seen.add(run.run_id);
    const facts = collectStaleRunFacts(run, { root, nowMs, sendStore, resourceStore });
    const cls = classifyExecutionRunStale(run, facts);
    if (cls.class !== "stale") continue;
    const out = abandonRun(run, {
      root,
      nowMs,
      origin: "governor",
      reason: cls.reason,
      summary: cls.summary,
    });
    if (out.ok && !out.noop) abandoned.push(out.run);
  }
  return { ok: true, abandoned, count: abandoned.length };
}

export function closeStaleExecutionRun(runId, {
  root,
  nowMs = Date.now(),
  origin = "operator",
} = {}) {
  const run = getExecutionRun(runId, root);
  if (!run) return { ok: false, error: "run_not_found" };
  if (isTerminalRunState(run.state)) {
    return { ok: true, already_terminal: true, run: publicExecutionRun(run) };
  }
  const facts = collectStaleRunFacts(run, { root, nowMs });
  const cls = classifyExecutionRunStale(run, facts);
  if (cls.class === "active") {
    return { ok: false, error: "run_still_active", reason: cls.reason, run: publicExecutionRun(run) };
  }
  const out = abandonRun(run, {
    root,
    nowMs,
    origin: origin === "operator" || origin === "governor" ? origin : "operator",
    reason: "operator_closed_stale_run",
    summary: "Abandoned: operator closed stale or incomplete previous work.",
  });
  if (!out.ok) return out;
  return { ok: true, run: publicExecutionRun(out.run, { includeInstruction: true, includeTransitions: true }) };
}

export function attachLaneRunLifecycle(lanes, { root, nowMs = Date.now() } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const sendStore = readLaneRuntimeStore(root);
  const resourceStore = readResourceRequestStore(root);
  return list.map((lane) => {
    const run = lane?.execution_run;
    if (!run?.run_id || isTerminalRunState(run.state)) return lane;
    const full = getExecutionRun(run.run_id, root) || run;
    const facts = collectStaleRunFacts(full, { root, nowMs, sendStore, resourceStore });
    const cls = classifyExecutionRunStale(full, facts);
    return {
      ...lane,
      execution_run: {
        ...run,
        run_lifecycle: {
          class: cls.class,
          reason: cls.reason,
        },
      },
    };
  });
}

export function reconcileLaneBeforeSend(laneId, { root, nowMs = Date.now() } = {}) {
  const out = reconcileStaleExecutionRuns({ root, nowMs, laneId });
  let closedIdleGoverned = false;
  const active = activeRunForLane(laneId, root);
  if (active?.state === "EXECUTING" && active.state_reason === "governed_action_complete") {
    const facts = collectStaleRunFacts(active, { root, nowMs });
    const cls = classifyExecutionRunStale(active, facts);
    if (cls.class === "ambiguous" || cls.class === "stale") {
      const closed = closeStaleExecutionRun(active.run_id, { root, nowMs, origin: "governor" });
      closedIdleGoverned = Boolean(closed?.ok && closed.run?.state === "ABANDONED");
    }
  }
  return {
    stale_run_closed: out.count > 0 || closedIdleGoverned,
    abandoned: out.abandoned,
    active: activeRunForLane(laneId, root),
  };
}
