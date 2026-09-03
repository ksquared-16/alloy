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
  runCompletionAdmissible,
  transitionExecutionRun,
  noteInstructionReceipt,
} from "./execution-run.mjs";
import { runReceiptConfirmed, runReceiptToken } from "./lanes.mjs";
import { readResourceRequestStore } from "./execution-resource.mjs";
import { SEND_BASELINE_WINDOW_MS, readLaneRuntimeStore } from "./lane-runtime.mjs";
import { activeAgentSessionForLane } from "./agent-session.mjs";
import { canonicalLaneStoreId, getDurableLane } from "./development-lane.mjs";
import { statSync } from "node:fs";
import { join } from "node:path";
import { listResourceClaims } from "./resource-claims.mjs";

const OPEN_REQUEST = new Set(["REQUESTED", "QUEUED", "GRANTED"]);
const IN_FLIGHT_CONTINUATION = new Set(["PENDING", "DELIVERING"]);
const SESSION_BUSY = new Set(["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"]);
/** Paste/submit still landing. After this, a new operator instruction is a new turn. */
export const OPERATOR_SUPERSEDE_GRACE_MS = 20 * 1000;
/**
 * Auto-complete from leftover Cooked must not close a turn that just started.
 * Operator Send can supersede after 20s; inferring completion needs longer so
 * a new prompt is not closed on the previous viewport.
 */
export const IDLE_TURN_COMPLETE_GRACE_MS = 90 * 1000;
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
    // Positive evidence that a brokered validation is actually running. Read
    // from the claims owner rather than by looking for processes, because a
    // claim is what the broker actually arbitrates on.
    validation_in_flight: validationInFlight(run, worktree),
    now_ms: nowMs,
  };
}

/**
 * Does a live resource claim belong to this run?
 *
 * Deliberately generous about attribution: any active claim naming this run,
 * lane or worktree counts as in-flight. Over-attributing keeps a real
 * validation protected, which is the failure worth having; under-attributing
 * would let a running validation be treated as settled.
 */
function validationInFlight(run, worktree) {
  let claims = [];
  try {
    // An unreadable claims store must read as "no claim in flight", never throw
    // — this runs on the path that decides whether a lane can be used at all.
    claims = requireClaims();
  } catch { return false; }
  if (!Array.isArray(claims) || !claims.length) return false;
  const runId = run?.run_id || null;
  const laneId = run?.lane_id || null;
  const wt = worktree || run?.worktree_path || null;
  return claims.some((c) => {
    const blob = JSON.stringify(c || {});
    return (runId && blob.includes(runId))
      || (laneId && blob.includes(laneId))
      || (wt && blob.includes(wt));
  });
}

let claimsReader = null;
/** Test seam: the claims store is a runtime file in production. */
export function setClaimsReaderForTests(fn) { claimsReader = fn || null; }
export function resetClaimsReaderForTests() { claimsReader = null; }
function requireClaims() {
  if (claimsReader) return claimsReader();
  return listResourceClaims();
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
/**
 * Has the settle window passed since this run was recovered?
 *
 * A recovery that has produced nothing for a full settle window is not in
 * flight. With no timestamp to judge by, it is treated as still settling —
 * unknown timing must not become a licence to collect.
 */
/**
 * Is a VALIDATING run still plausibly validating?
 *
 * VALIDATING sat in PROTECTIVE_STATES unconditionally, alongside
 * WAITING_RESOURCE and NEEDS_INPUT. The comment there explains why those two
 * are unconditional: they wait on a PERSON or on a governed decision, and time
 * alone does not resolve either. VALIDATING is not like that. It waits on a
 * MACHINE — a brokered validation — and a machine either holds a claim or it
 * does not.
 *
 * MEASURED: the Payments run entered VALIDATING at 19:47 and was still there
 * three hours later. Its pane showed a finished turn, there was no vitest, no
 * tsc, no build, no heavy process in its worktree and ZERO active resource
 * claims anywhere on the host. Every stale check refused it with
 * `protective_state_validating`, so the Director was told "this lane still has
 * an open run" and offered manual stale-run surgery after an ordinary,
 * successful turn.
 *
 * This is the same shape as the RECOVERING defect fixed directly below, and the
 * fix is deliberately identical: protective while the work could still be IN
 * FLIGHT, then falls through to the ORDINARY evaluation. Falling through is not
 * a completion — the ordinary path still demands its own positive evidence
 * (an idle turn agreeing with the transcript, silence past settle, no
 * heartbeat) before anything is closed. Absence of a process is what lifts the
 * unconditional block; it is never by itself the reason a run is completed.
 */
function validationSettled(run, facts, nowMs) {
  // A live claim is positive evidence that validation really is in flight.
  //
  // When the caller did not collect the fact at all, ASK rather than assume.
  // Reading an absent fact as "nothing is validating" would fail open for every
  // caller that classifies a run without going through collectStaleRunFacts —
  // exactly the direction this protection must not fail.
  const inFlight = facts?.validation_in_flight ?? validationInFlight(run, run?.worktree_path || null);
  if (inFlight) return false;
  const enteredAt = parseMs(run?.updated_at);
  if (enteredAt == null) return false;
  return (nowMs - enteredAt) >= STALE_SETTLE_MS;
}

function recoverySettled(run, nowMs) {
  const recoveredAt = parseMs(run?.recovery_state?.recovered_at) ?? parseMs(run?.updated_at);
  if (recoveredAt == null) return false;
  return (nowMs - recoveredAt) >= STALE_SETTLE_MS;
}

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
    // RECOVERING is protective only while a recovery could still be IN FLIGHT.
    //
    // It was protective unconditionally, and a recovered run that never reports
    // again therefore sat in RECOVERING forever: the governor would not collect
    // it and the lane card read "Recovering" permanently. Communications sat
    // there for nearly two hours with an idle pane, past settle, no progress and
    // no agent report — nothing about that is a recovery in flight.
    //
    // The other protective states keep their unconditional protection: they wait
    // on a person or on a governed decision, and time alone does not resolve
    // either.
    if (run.state === "RECOVERING" && recoverySettled(run, nowMs)) {
      // fall through to the ordinary evaluation below
    } else if (run.state === "VALIDATING" && validationSettled(run, merged, nowMs)) {
      // fall through too: nothing is validating, and it has been long enough
      // that something would have claimed the broker if it were going to.
    } else {
      return { class: "active", reason: `protective_state_${run.state.toLowerCase()}`, evidence };
    }
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
  // RECOVERING was added here when its unconditional protection was lifted;
  // VALIDATING needs the same allowance for the same reason. Without it the
  // fall-through above is inert: the run clears the protective gate and is then
  // refused two lines later for not being EXECUTING, which is exactly how the
  // Payments run stayed open for three hours.
  const settledProtective = run.state === "VALIDATING" && validationSettled(run, merged, nowMs);
  if (run.state !== "EXECUTING" && run.state !== "RECOVERING" && !settledProtective) {
    return { class: "active", reason: "not_executing", evidence };
  }
  // `recovery_state` is the RECORD of a past recovery, not a live flag. Read as
  // "a recovery is happening" it never cleared, so any run that had ever been
  // recovered became permanently uncollectable. It protects the settle window
  // after the recovery, and no longer.
  if (run.recovery_state && !recoverySettled(run, nowMs)) {
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

/**
 * Close an idle turn as COMPLETE — but only when the completion is actually
 * attributable to THIS run.
 *
 * A run delivered through the receipt-tracking path carries its own token. If
 * that token was never observed in advanced pane output, nothing on this lane
 * has proven the instruction reached a provider, and an idle pane is showing
 * some EARLIER turn. Completing on that evidence is how a stale completion gets
 * attached to a newer instruction. Such a run is abandoned instead: terminal for
 * scheduling, recoverable, and never a false claim that work finished.
 */
function completeIdleRun(run, { root, nowMs, origin, reason, summary, attributionRequired = false }) {
  if (attributionRequired && runReceiptToken(run) && !runReceiptConfirmed(run)) {
    return abandonRun(run, {
      root,
      nowMs,
      origin,
      reason: "completion_not_attributable",
      summary: "Not completed: this run's instruction receipt was never observed in provider output.",
    });
  }
  const admissible = runCompletionAdmissible(run);
  if (attributionRequired && !admissible.ok) {
    return abandonRun(run, {
      root,
      nowMs,
      origin,
      reason: admissible.error,
      summary: "Not completed: the instruction was never delivered to a provider.",
    });
  }
  return transitionExecutionRun(run.run_id, "COMPLETE", {
    reason,
    origin,
    nowMs,
    root,
    completion_report: { summary: summary || "This turn finished. The agent session remains." },
  });
}

async function defaultCollectLatestOutput(lane) {
  const cwd = lane?.execution_run?.worktree_path || lane?.worktree?.path || lane?.binding?.worktree_path;
  if (!cwd) return { available: false, text: null };
  const sessionId = lane?.agent_session?.session_id || lane?.claude?.session_id || null;
  const provider = lane?.preferred_provider || lane?.binding?.provider || "claude";
  if (provider === "cursor") {
    const { collectLatestCursorResponse } = await import("./providers/cursor/telemetry.mjs");
    return collectLatestCursorResponse({ cwd, sessionId: lane?.agent_session?.session_id });
  }
  const { collectLatestClaudeResponse } = await import("./providers/claude/telemetry.mjs");
  return collectLatestClaudeResponse({ cwd, sessionId });
}

/**
 * The pane still showing the previous turn must not close a new send. The
 * transcript has to be the same writeup as the Cooked viewport.
 */
export function paneResultAgreesWithTranscript(paneSummary, transcript) {
  const pane = String(paneSummary || "").replace(/\s+/g, " ").trim();
  const tr = String(transcript || "").replace(/\s+/g, " ").trim();
  if (pane.length < 40 || tr.length < 40) return false;
  const offset = pane.length > 160 ? 24 : 0;
  const needle = pane.slice(offset, offset + 64).trim();
  if (needle.length >= 40 && tr.includes(needle)) return true;
  const head = pane.slice(0, 48).trim();
  return head.length >= 40 && tr.includes(head);
}

/**
 * When a worker finishes a turn but forgets `vac run-status complete --summary`,
 * Vacilando still has to provide that last output at completion. The pane
 * saying Cooked plus an idle prompt is the finished-turn signal; the session
 * transcript is the last output. Filed as a completion report so the
 * conversation and the run record both carry it.
 */
export async function maybeCompleteIdleTurnFromLastOutput(lane, {
  root,
  nowMs = Date.now(),
  collectLatest = null,
} = {}) {
  const run = lane?.execution_run;
  // EXECUTING, or a VALIDATING run whose validation is demonstrably not in
  // flight. Every other gate below still applies, so this widens WHICH runs may
  // be completed from a finished turn, never the evidence required to complete
  // one: the pane must be idle, the turn must have finished, no governed action
  // may be pending, the grace must have passed, and the last output must agree
  // with the transcript.
  //
  // Without this the Payments run could not be completed by any automatic path.
  // Its turn had visibly finished — "Crunched for 58s · done" at an idle prompt
  // — but the run had moved to VALIDATING, so the one routine that reads that
  // signal refused it as not_executing and the Director was left to perform
  // stale-run surgery by hand after an ordinary successful turn.
  const completable = run?.state === "EXECUTING"
    || (run?.state === "VALIDATING" && validationSettled(run, { validation_in_flight: validationInFlight(run, lane?.worktree?.path || run?.worktree_path || null) }, nowMs));
  if (!run?.run_id || !completable) {
    return { ok: true, completed: false, skipped: "not_executing" };
  }
  if (lane?.provider_activity?.activity !== "ready") {
    return { ok: true, completed: false, skipped: "not_idle" };
  }
  if (lane?.provider_activity?.live_progress?.idle_result !== true) {
    return { ok: true, completed: false, skipped: "turn_not_finished" };
  }
  const ga = lane?.governed_action || run?.governed_action;
  if (ga && ["requested", "awaiting_director", "awaiting_control_plane_refresh", "awaiting_operator", "executing"].includes(ga.status)) {
    return { ok: true, completed: false, skipped: "governed_action_pending" };
  }
  const started = parseMs(run.started_at);
  if (started != null && (nowMs - started) < IDLE_TURN_COMPLETE_GRACE_MS) {
    return { ok: true, completed: false, skipped: "grace" };
  }
  const admissible = runCompletionAdmissible(run);
  if (!admissible.ok) {
    return { ok: true, completed: false, skipped: admissible.error };
  }

  let latest = null;
  try {
    latest = collectLatest ? await collectLatest(lane) : await defaultCollectLatestOutput(lane);
  } catch {
    latest = null;
  }
  const text = String(latest?.text || "").trim();
  if (text.length < 40) {
    return { ok: true, completed: false, skipped: "no_last_output" };
  }
  const captured = parseMs(latest?.captured_at || latest?.timestamp);
  if (started != null && captured != null && captured < started) {
    return { ok: true, completed: false, skipped: "last_output_predates_run" };
  }
  if (started != null && captured == null) {
    return { ok: true, completed: false, skipped: "last_output_unattributed" };
  }
  const paneSummary = lane?.provider_activity?.live_progress?.summary || "";
  if (!paneResultAgreesWithTranscript(paneSummary, text)) {
    return { ok: true, completed: false, skipped: "last_output_mismatch" };
  }

  if (runReceiptToken(run) && !runReceiptConfirmed(run)) {
    noteInstructionReceipt(run.run_id, { text, nowMs, root });
  }
  // The receipt token lives in the delivery envelope, not in the last output.
  // Requiring it in the completion writeup is how a delivered, cooked turn
  // never got its last-output summary. Delivery ack is the proof the
  // instruction reached the provider; the Cooked pane is the finished turn.
  const confirmed = runReceiptConfirmed(getExecutionRun(run.run_id, root) || run);
  if (runReceiptToken(run) && !confirmed && !runHasDeliveryAck(run)) {
    return { ok: true, completed: false, skipped: "receipt_unconfirmed" };
  }

  const { submitAgentReport } = await import("./execution-run-report.mjs");
  const out = submitAgentReport(run.run_id, {
    type: "completion",
    message: text,
    origin: "governor",
    reason: "last_output_at_idle_prompt",
    laneId: run.lane_id,
    cwd: run.worktree_path,
    nowMs,
    root,
  });
  if (!out.ok) return { ok: false, completed: false, error: out.error };
  return {
    ok: true,
    completed: out.run?.state === "COMPLETE" || out.transition === "COMPLETE",
    run: out.run,
    report: out.report,
  };
}

export async function applyIdleTurnCompletions(lanes, { root, nowMs = Date.now(), collectLatest = null } = {}) {
  const list = Array.isArray(lanes) ? lanes : [];
  if (!list.length) return list;
  const { attachLaneRuns } = await import("./execution-run.mjs");
  for (let i = 0; i < list.length; i += 1) {
    try {
      const out = await maybeCompleteIdleTurnFromLastOutput(list[i], { root, nowMs, collectLatest });
      if (!out?.completed) continue;
      const activity = list[i].provider_activity;
      list[i] = attachLaneRuns([list[i]], root, { includeInstruction: true })[0];
      if (activity) list[i].provider_activity = activity;
    } catch { /* a missed completion must not fail discovery */ }
  }
  return list;
}

/**
 * Operator Send is a new turn. An EXECUTING run with an idle (not rotating)
 * session must not 409 forever because of a leftover heartbeat or ACTIVE pane.
 */
export function canOperatorSupersedeRun(run, facts = {}) {
  if (!run) return false;
  // An in-flight continuation is a resume being pasted into the pane.
  // A GRANTED exclusive lock with no continuation is not: Vacilando sat
  // EXECUTING with gateway_host_mutation granted, the pane idle at a prompt,
  // and Send / Close / stale-governor all refused. Completing the turn
  // releases the grant (cleanupRunResources). Operator Send is the way out.
  if (facts.in_flight_continuation) return false;
  if (SESSION_BUSY.has(facts.session_state)) return false;
  const nowMs = facts.now_ms || Date.now();
  if (run.state === "NEEDS_INPUT") {
    const report = run.agent_report;
    // A structured blocking question is a real operator decision. Status-only
    // NEEDS_INPUT is a parked status string — Send is a new turn, not an answer.
    if (report?.type === "needs_input" && report.blocking !== false) return false;
    return true;
  }
  // RECOVERING is superseded on the same terms as EXECUTING.
  //
  // A recovered run waits for the agent to report again. When the agent already
  // answered BEFORE the recovery — or its reply was consumed as a delivery echo
  // — nothing further is coming, and the run parks in RECOVERING forever. The
  // stale governor calls that class "active", so it never collects it either.
  // The lane is then unreachable: Send is refused, nothing closes the run, and
  // the operator has no way back in. Communications sat exactly there for 46
  // minutes with an idle pane.
  //
  // The guards above still hold — an open resource, an in-flight continuation
  // or a busy session all still refuse — so this widens the state, never the
  // conditions.
  if (run.state !== "EXECUTING" && run.state !== "RECOVERING") return false;
  const delivered = facts.delivered_ms;
  if (delivered != null && (nowMs - delivered) < OPERATOR_SUPERSEDE_GRACE_MS) return false;
  return true;
}

/**
 * Operator Send closes the previous turn. This is an explicit operator act on a
 * run they can see, not an inference from pane output, so it does not require
 * receipt attribution — the operator moving on is the authority.
 */
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
    // Inferred from an idle pane, not from a worker report. Attribution is
    // mandatory here: without it, the PREVIOUS turn's finished screen closes
    // this run. Operator follow-up (below) is an explicit operator act and is
    // governed differently.
    return completeIdleRun(run, {
      root,
      nowMs,
      origin,
      reason: cls.reason,
      summary: cls.summary,
      attributionRequired: true,
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
      // OBSERVED, not swept: this path has just established that the provider
      // never acknowledged the instruction, which is a real delivery failure
      // whatever state the run is parked in.
      execution_failure: true,
    });
    // The governor reports an undelivered Cursor run; it does not re-decide
    // which provider the lane is on. Silently reverting to Claude here undid
    // the operator's explicit selection from a background sweep — invisible,
    // and indistinguishable to the operator from "selecting Cursor did not
    // work". See the matching note in execution-run-send.
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
    // Governor must not auto-collect a grant holder (exclusive install can
    // look idle). The operator still has to be able to close it: a leaked
    // GRANTED lock with no in-flight continuation is how Vacilando became
    // unreachable — Close returned run_still_active, Send returned
    // current_run_active, and the decision bar never appeared.
    const operatorCloseLeakedGrant = origin === "operator"
      && cls.reason === "open_resource"
      && !facts.in_flight_continuation;
    if (!operatorCloseLeakedGrant) {
      return { ok: false, error: "run_still_active", reason: cls.reason, run: publicExecutionRun(run) };
    }
    const out = closeClassifiedRun(run, {
      class: "stale",
      reason: "operator_closed_leaked_grant",
      evidence: cls.evidence,
      summary: "Abandoned: the run was holding a shared lock after the agent had already finished.",
    }, {
      root,
      nowMs,
      origin: "operator",
    });
    if (!out.ok) return out;
    return { ok: true, run: publicExecutionRun(out.run, { includeInstruction: true, includeTransitions: true }) };
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
