/**
 * Stale / orphaned Execution Run reconciliation.
 *
 * ABANDONED SEMANTICS (Phase 2 contract).
 *
 *   ABANDONED means: Vacilando holds POSITIVE evidence that this run no longer
 *   owns a viable worker/session, and the operator has not continued it.
 *
 *   ABANDONED does NOT mean: "no checkpoint arrived recently". Inactivity is not
 *   abandonment. Long agent work legitimately runs for tens of minutes with no
 *   state transition — reading, planning, compiling, validating.
 *
 * WHY THIS WAS REWRITTEN. The previous contract abandoned a run 2 minutes after
 * delivery whenever no agent report had landed yet (`orphaned_pre_protocol_run`).
 * Two facts made that fire against healthy lanes:
 *
 *   1. `sends.activity_at` is a NOTIFICATION-DEDUP timestamp, not a liveness
 *      clock. `noteOutputAfterInstruction` writes it exactly ONCE per delivered
 *      instruction and then short-circuits on `notification_emitted_at`. It is
 *      normally written within seconds of delivery, which also classifies it as
 *      a delivery echo — so `genuine_recent_activity` was false for the entire
 *      life of essentially every run.
 *   2. A worker's first and most natural report, `vac run-status <run> executing`
 *      on an already-EXECUTING run, was discarded by `transitionExecutionRun` as
 *      a noop. It appended no transition and set no progress, so `hasAgentReport`
 *      stayed false no matter how many times the agent reported.
 *
 *   With both liveness signals structurally dead, every run fell through to
 *   "orphaned pre-protocol" at the 2-minute settle. Measured on this host's live
 *   store: 44 of 53 runs ABANDONED, 39 of them `orphaned_pre_protocol_run`,
 *   42 of 44 killed inside 150 seconds (median 124.9s == the first governor
 *   sweep past STALE_SETTLE_MS). Only 4 runs ever reached COMPLETE.
 *
 * Liveness is now positive and cheap (no pane capture, no transcript parse):
 *   - worker heartbeat  — any agent-origin report, including same-state
 *   - session BUSY      — STARTING / HANDOFF / RESTARTING / VERIFYING
 *   - worktree activity — git HEAD/index mtime, one stat call
 *   - open resources / in-flight continuations / protective states (as before)
 *
 * A durable session in ACTIVE is NOT run liveness. Claude and Cursor keep an
 * ACTIVE session between turns so the next instruction has a pane. Treating
 * that as "this Execution Run is still in flight" left lanes on Executing
 * after recent output was already done, and blocked a second prompt.
 *
 * Terminal choice: ABANDONED, not FAILED.
 *   FAILED = the work itself failed.
 *   COMPLETE = the work finished.
 *   ABANDONED = the run is no longer live work; closed by reconciliation or
 *     operator. History is preserved, and ABANDONED is RECOVERABLE — see
 *     recoverExecutionRun() in execution-run.mjs.
 *
 * Authority is durable JSON facts (run, sends, resources, session). TUI
 * prompt and spinner glyphs are never parsed.
 */
import {
  activeRunForLane,
  getExecutionRun,
  isCertificationInstruction,
  isTerminalRunState,
  patchRunFields,
  publicExecutionRun,
  readExecutionRunStore,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { readResourceRequestStore } from "./execution-resource.mjs";
import { SEND_BASELINE_WINDOW_MS, readLaneRuntimeStore } from "./lane-runtime.mjs";
import { activeAgentSessionForLane } from "./agent-session.mjs";
import { canonicalLaneStoreId, getDurableLane, setLanePreferredProvider } from "./development-lane.mjs";
import { statSync } from "node:fs";
import { join } from "node:path";

const OPEN_REQUEST = new Set(["REQUESTED", "QUEUED", "GRANTED"]);
const IN_FLIGHT_CONTINUATION = new Set(["PENDING", "DELIVERING"]);
const SESSION_BUSY = new Set(["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"]);
/** Paste/submit still landing. After this, a new operator instruction is a new turn. */
export const OPERATOR_SUPERSEDE_GRACE_MS = 20 * 1000;
const PROTECTIVE_STATES = new Set(["VALIDATING", "RECOVERING", "WAITING_RESOURCE", "NEEDS_INPUT"]);

/** Genuine post-delivery activity is protective within this window. Not sole stale authority. */
export const STALE_ACTIVITY_RECENT_MS = 30 * 60 * 1000;
/**
 * Auto-abandon is not allowed until the run has had time to report.
 * Was 2 minutes, which is shorter than a single file-reading pass. A worker that
 * orients, reads a subsystem and plans before its first report is normal, not dead.
 */
export const STALE_SETTLE_MS = 20 * 60 * 1000;
/** A worker heartbeat is protective for this long. Reports are cheap; silence is not proof. */
export const WORKER_HEARTBEAT_RECENT_MS = 45 * 60 * 1000;
/** Worktree commits/index writes are protective for this long. */
export const WORKTREE_ACTIVITY_RECENT_MS = 45 * 60 * 1000;
/**
 * A run that HAS reported has proven the protocol works on this lane, so its
 * silence is much stronger evidence than a run that never spoke. It is still
 * only abandonable after a long multi-signal silence — no session, no worktree
 * movement, and no heartbeat for this long — never on silence alone.
 */
export const ABANDON_AFTER_HEARTBEAT_MS = 4 * 60 * 60 * 1000;
/** QUEUED→EXECUTING requires a provider ack. Fail closed if none arrives. */
export const DELIVERY_ACK_TIMEOUT_MS = 30 * 1000;

export function runHasDeliveryAck(run) {
  if (run?.delivery && typeof run.delivery === "object") {
    return run.delivery.acknowledged === true;
  }
  return Boolean(run?.started_at);
}

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

const SESSION_ALIVE = new Set(["STARTING", "ACTIVE", "ROTATION_PENDING", "HANDOFF", "RESTARTING", "VERIFYING"]);

/**
 * Cheap worktree liveness: newest mtime across the git control files a working
 * agent necessarily touches (commits, staging, checkouts). Bounded to a handful
 * of stat() calls — no directory walk, no `git` subprocess, no repo scan.
 */
export function worktreeActivityMs(worktreePath) {
  if (!worktreePath) return null;
  const git = join(String(worktreePath), ".git");
  let base = git;
  try {
    const st = statSync(git);
    if (st.isFile()) {
      // Linked worktree: `.git` is a file pointing at the real gitdir.
      base = git;
      return st.mtimeMs;
    }
  } catch { return null; }
  let newest = null;
  for (const rel of ["HEAD", "index", "logs/HEAD", "COMMIT_EDITMSG"]) {
    try {
      const ms = statSync(join(base, rel)).mtimeMs;
      if (newest == null || ms > newest) newest = ms;
    } catch { /* absent control file is not evidence of death */ }
  }
  return newest;
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
  let worktree = run?.worktree_path || null;
  if (!worktree) {
    try { worktree = getDurableLane(run.lane_id, root)?.binding?.worktree_path || null; } catch { worktree = null; }
  }
  return {
    delivered_ms: deliveredMs,
    activity_ms: activityMs,
    activity_is_delivery_echo: isDeliveryEcho(deliveredMs, activityMs),
    open_resource: hasOpenResource(requests),
    in_flight_continuation: hasInFlightContinuation(requests),
    request_count: requests.length,
    session_state: session?.state || null,
    session_run_id: session?.run_id || null,
    session_alive: SESSION_ALIVE.has(session?.state),
    worker_report_ms: parseMs(run?.last_worker_report_at),
    worktree_activity_ms: worktreeActivityMs(worktree),
    now_ms: nowMs,
  };
}

function workerHeartbeatRecent(facts) {
  if (facts.worker_report_ms == null) return false;
  return (facts.now_ms - facts.worker_report_ms) <= WORKER_HEARTBEAT_RECENT_MS;
}

function worktreeActivityRecent(facts) {
  if (facts.worktree_activity_ms == null) return false;
  return (facts.now_ms - facts.worktree_activity_ms) <= WORKTREE_ACTIVITY_RECENT_MS;
}

function genuineRecentActivity(facts) {
  if (facts.activity_ms == null) return false;
  if (facts.activity_is_delivery_echo) return false;
  return (facts.now_ms - facts.activity_ms) <= STALE_ACTIVITY_RECENT_MS;
}

/**
 * When the run last began EXECUTING. `started_at` is stamped on the first
 * EXECUTING transition; the transition scan covers runs restored from older
 * stores that predate that field.
 */
function lastExecutingAt(run) {
  const fromStarted = parseMs(run?.started_at);
  if (fromStarted != null) return fromStarted;
  const exec = [...(run?.transitions || [])].reverse().find((t) => t?.to_state === "EXECUTING");
  return parseMs(exec?.occurred_at || exec?.at);
}

function pastSettle(run, facts) {
  // Queue wait is NOT settle time. `created_at` must never be the clock: a run
  // can sit QUEUED for hours and then start, and measuring settle from creation
  // makes it eligible for auto-abandon the instant it begins executing.
  const start = lastExecutingAt(run) ?? facts.delivered_ms;
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
    session_alive: Boolean(merged.session_alive),
    worker_heartbeat_recent: workerHeartbeatRecent(merged),
    worker_report_count: Number(run?.worker_report_count) || 0,
    worktree_activity_recent: worktreeActivityRecent(merged),
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
  if (SESSION_BUSY.has(merged.session_state)) {
    return { class: "active", reason: "session_busy", evidence };
  }
  // Positive liveness. Any one of these is proof the run still owns a worker,
  // and outranks silence on the reporting channel.
  if (evidence.worker_heartbeat_recent) {
    return { class: "active", reason: "worker_heartbeat", evidence };
  }
  if (evidence.worktree_activity_recent) {
    return { class: "active", reason: "worktree_activity", evidence };
  }
  if (evidence.genuine_recent_activity) {
    return { class: "active", reason: "recent_output_activity", evidence };
  }
  // NOTE: "has reported at some point" used to short-circuit to ambiguous here,
  // which made tier-2 abandonment unreachable and could block a lane forever
  // behind a worker that really was gone. It is now the FALLBACK below, after
  // the dead-worker evaluation, not a veto before it.
  if (!evidence.past_settle) {
    return { class: "active", reason: "still_settling", evidence };
  }

  // Everything protective is exhausted. An idle ACTIVE session is the resting
  // state of a persistent agent, not proof this run still owns in-flight work.
  // Auto-close then requires: no busy session, no worker heartbeat ever, and
  // no worktree movement. A reported run that later goes silent stays
  // ambiguous for the operator unless the heartbeat-gone path fires.
  const sessionBusy = SESSION_BUSY.has(merged.session_state);
  const noLiveSignals = !sessionBusy && !evidence.worktree_activity_recent;
  // Tier 1: the run never spoke at all. Nothing on this lane has proven the
  // reporting protocol works, so an orphan is the likeliest reading.
  const neverReported = noLiveSignals && evidence.worker_report_count === 0;
  // Tier 2: the run did speak, then went fully silent for a long time. The lane
  // must not be blocked forever by a worker that really is gone.
  const heartbeatMs = merged.worker_report_ms;
  const goneAfterReporting = noLiveSignals
    && evidence.worker_report_count > 0
    && heartbeatMs != null
    && (nowMs - heartbeatMs) >= ABANDON_AFTER_HEARTBEAT_MS;
  const deadWorker = neverReported || goneAfterReporting;

  if (evidence.certification && deadWorker) {
    return {
      class: "stale",
      reason: "stale_certification_run",
      evidence,
      summary: "Abandoned: certification/soak run went idle without a completion report.",
    };
  }
  if (neverReported && !evidence.has_agent_report) {
    if (evidence.session_alive && !sessionBusy) {
      return {
        class: "stale",
        reason: "turn_finished_session_remains",
        evidence,
        summary: "This turn finished. The agent session is still available for the next instruction.",
      };
    }
    return {
      class: "stale",
      reason: "orphaned_pre_protocol_run",
      evidence,
      summary: "Abandoned: no agent session, no worker report, and no worktree activity.",
    };
  }
  if (goneAfterReporting) {
    return {
      class: "stale",
      reason: "worker_gone_after_reporting",
      evidence,
      summary: "Abandoned: the worker reported, then went silent with no session and no worktree activity.",
    };
  }

  if (evidence.has_agent_report || evidence.has_progress) {
    return { class: "ambiguous", reason: "managed_reports_without_recent_activity", evidence };
  }
  return { class: "ambiguous", reason: "executing_without_live_signals", evidence };
}

function completeIdleRun(run, { root, nowMs, origin, reason, summary }) {
  return transitionExecutionRun(run.run_id, "COMPLETE", {
    reason,
    origin,
    nowMs,
    root,
    completion_report: { summary: summary || "This turn finished. The agent session remains." },
  });
}

/**
 * Operator Send is a new turn. An EXECUTING run with an idle (not rotating)
 * session must not 409 forever because of a leftover heartbeat or ACTIVE pane.
 */
export function canOperatorSupersedeRun(run, facts = {}) {
  if (!run || run.state !== "EXECUTING") return false;
  if (facts.open_resource || facts.in_flight_continuation) return false;
  if (SESSION_BUSY.has(facts.session_state)) return false;
  const delivered = facts.delivered_ms;
  const nowMs = facts.now_ms || Date.now();
  if (delivered != null && (nowMs - delivered) < OPERATOR_SUPERSEDE_GRACE_MS) return false;
  return true;
}

export function completeRunForOperatorFollowUp(run, { root, nowMs = Date.now() } = {}) {
  return completeIdleRun(run, {
    root,
    nowMs,
    origin: "operator",
    reason: "operator_follow_up",
    summary: "Operator sent a new instruction. Previous turn closed.",
  });
}

function closeClassifiedRun(run, cls, { root, nowMs, origin }) {
  if (cls.reason === "turn_finished_session_remains") {
    return completeIdleRun(run, {
      root,
      nowMs,
      origin,
      reason: cls.reason,
      summary: cls.summary,
    });
  }
  return abandonRun(run, {
    root,
    nowMs,
    origin,
    reason: cls.reason,
    summary: cls.summary,
  });
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
    const out = closeClassifiedRun(run, cls, {
      root,
      nowMs,
      origin: "governor",
    });
    if (out.ok && !out.noop) abandoned.push(out.run);
  }
  return { ok: true, abandoned, count: abandoned.length };
}

/**
 * Fail runs that never received a provider delivery acknowledgement.
 * Cursor observation (transcript readability) is not delivery. Claude QUEUED
 * waiting for a real agent session is not failed here.
 */
export function reconcileUndeliveredRuns({
  root,
  nowMs = Date.now(),
} = {}) {
  const store = readExecutionRunStore(root);
  const failed = [];
  for (const id of Object.keys(store.lanes || {})) {
    const pack = store.lanes[id];
    if (!pack?.current_run_id) continue;
    const run = (pack.runs || []).find((r) => r.run_id === pack.current_run_id);
    if (!run || isTerminalRunState(run.state) || runHasDeliveryAck(run)) continue;
    const rec = getDurableLane(run.lane_id, root);
    const selected = String(
      run.delivery?.provider || rec?.preferred_provider || rec?.binding?.provider || "",
    ).toLowerCase();
    const createdMs = parseMs(run.created_at) ?? parseMs(run.updated_at) ?? nowMs;
    const timedOut = nowMs - createdMs >= DELIVERY_ACK_TIMEOUT_MS;
    const cursorUndelivered = selected === "cursor";
    const executingWithoutAck = run.state === "EXECUTING" && timedOut;
    if (!cursorUndelivered && !executingWithoutAck) continue;
    const reason = cursorUndelivered ? "cursor_delivery_unavailable" : "delivery_unacknowledged";
    const summary = cursorUndelivered
      ? "Cursor delivery unavailable: transcript is readable, but no executable Cursor transport is attached."
      : "No provider delivery acknowledgement for this instruction.";
    patchRunFields(run.run_id, {
      delivery: {
        ...(run.delivery && typeof run.delivery === "object" ? run.delivery : {}),
        acknowledged: false,
        provider: cursorUndelivered ? "cursor" : (run.delivery?.provider || selected || null),
        error: reason,
        at: new Date(nowMs).toISOString(),
      },
    }, { nowMs, root });
    const out = transitionExecutionRun(run.run_id, "FAILED", {
      reason,
      origin: "governor",
      nowMs,
      root,
      completion_report: { summary },
    });
    if (cursorUndelivered && rec?.lane_id) {
      try { setLanePreferredProvider(rec.lane_id, "claude", { nowMs, root }); } catch { /* retry with Claude */ }
    }
    if (out.ok) failed.push(out.run);
  }
  return { ok: true, failed, count: failed.length };
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
  const out = closeClassifiedRun(run, cls, {
    root,
    nowMs,
    origin: origin === "operator" || origin === "governor" ? origin : "operator",
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
