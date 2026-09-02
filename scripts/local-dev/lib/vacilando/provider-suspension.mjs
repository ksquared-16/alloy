/**
 * Provider suspension — putting the computation down without losing the work.
 *
 * WHY. A lane in NEEDS_INPUT is durable work waiting on a person. The question
 * has been asked; nothing will happen until the operator answers, which may be
 * minutes or days. Meanwhile the Claude process sits there holding one of three
 * provider seats, and a queued lane cannot start. Observed on this host: three
 * agents against a ceiling of three, one of which had been parked on a question
 * since the previous day.
 *
 * WHAT SUSPENSION IS. Stop the process. Keep everything else: the lane, the run
 * and its NEEDS_INPUT state, the exact question, the conversation, the
 * worktree, the branch, the provider type, the resumable session identity and
 * the output baseline that correlates a reply to its run. The operator sees
 * "Needs input · provider suspended" — not Working, which would be a lie, and
 * not Offline, which would suggest the work is gone.
 *
 * THE ORDER IS THE SAFETY PROPERTY. Durability is established and verified
 * BEFORE the process is stopped. If the question cannot be made durable, the
 * provider is not touched — a suspension that loses the question is worse than
 * a held seat.
 */
import { randomUUID } from "node:crypto";

import {
  activeAgentSessionForLane,
  getAgentSession,
  listAgentSessionsForLane,
  patchAgentSession,
} from "./agent-session.mjs";
import { getExecutionRun, patchRunFields } from "./execution-run.mjs";
import { getDurableLane } from "./development-lane.mjs";
import { writeAuditEvent } from "./commands/audit.mjs";

export const SUSPEND_COMMAND = "lane.suspend_provider";
export const RESUME_COMMAND = "lane.resume_provider";

/**
 * How long a parked lane keeps its provider before the seat is released.
 * Long enough that an immediate reply never pays a restart; short enough that a
 * question left overnight does not hold a seat.
 */
export const NEEDS_INPUT_GRACE_MS = Number(process.env.VACILANDO_NEEDS_INPUT_GRACE_MS || 120_000);

/** Run states from which suspension is routine — nothing is interrupted. */
export const AUTO_SUSPENDABLE_RUN_STATES = Object.freeze(["NEEDS_INPUT", "WAITING_RESOURCE"]);
/** Run states where suspension interrupts real work and needs confirmation. */
export const INTERRUPTS_WORK_RUN_STATES = Object.freeze(["EXECUTING", "VALIDATING", "RECOVERING"]);

function iso(ms) {
  return new Date(ms ?? Date.now()).toISOString();
}

let suspendImpl = null;
export function setProviderSuspensionImplForTests(impl = {}) {
  suspendImpl = impl && typeof impl === "object" ? impl : null;
}
export function resetProviderSuspensionImplForTests() {
  suspendImpl = null;
}

async function stopProcess({ tmuxSession }) {
  if (typeof suspendImpl?.stopSession === "function") return suspendImpl.stopSession({ tmuxSession });
  const { stopPersistentAgentSession } = await import("./alloy-dev-adapter.mjs");
  return stopPersistentAgentSession({ tmuxSession });
}

async function startProcess({ laneId, root, nowMs }) {
  if (typeof suspendImpl?.startSession === "function") return suspendImpl.startSession({ laneId, root, nowMs });
  const { startLaneAgentSession } = await import("./agent-session-lifecycle.mjs");
  return startLaneAgentSession({ laneId, nowMs, root });
}

/**
 * Everything needed to bring this lane back exactly where it was.
 *
 * Captured from the run itself, so it survives the process it describes. The
 * question is taken from the structured report when the lane has adopted
 * `vac run-report`, and otherwise from the run's own durable status fields —
 * a lane on the older CLI still has a real question, and refusing to suspend it
 * for want of a preferred format would hold a seat over a formality.
 */
export function captureResumeState(run, session, lane, { nowMs = Date.now() } = {}) {
  if (!run) return null;
  const report = run.agent_report || null;
  const question = report?.type === "needs_input" && report.message
    ? report.message
    : (run.state_reason || run.latest_progress?.summary || run.completion_report?.summary || "");
  if (!String(question).trim()) return null;
  return {
    captured_at: iso(nowMs),
    run_id: run.run_id,
    run_state: run.state,
    question: String(question),
    question_source: report?.type === "needs_input" ? "agent_report" : "run_status",
    report_id: report?.report_id || null,
    choices: report?.choices || null,
    provider: lane?.preferred_provider || lane?.binding?.provider || session?.provider || "claude",
    // Resumable identity: which session and which provider conversation.
    agent_session_id: session?.agent_session_id || null,
    provider_session_id: session?.provider_session_id || null,
    tmux_session: lane?.binding?.tmux_session || null,
    worktree_path: lane?.binding?.worktree_path || run.worktree_path || null,
    // The correlation baseline, so a reply is matched to this run and not to
    // whatever the pane happens to show after a restart.
    output_fingerprint_at_send: run.output_fingerprint_at_send || null,
    receipt_token: run.delivery?.receipt_token || null,
  };
}

/**
 * Is the question durable enough to stop the process over?
 *
 * Verified by reading it back from the store, not by trusting the write.
 */
/**
 * NOTE ON `root`. These default to `undefined`, never `null`.
 *
 * The helpers below declare `root = runtimeRoot()`, and a default parameter
 * only fires for `undefined`. Defaulting to `null` here passed a literal null
 * through as the runtime root, so every lookup missed and suspend/resume
 * returned `lane_not_found` for a lane that plainly existed.
 */
export function needsInputIsDurable(runId, { root = undefined } = {}) {
  const run = getExecutionRun(runId, root);
  if (!run) return { ok: false, error: "run_not_found" };
  const snap = run.provider_suspension?.resume_state || null;
  if (!snap?.question || !String(snap.question).trim()) {
    return { ok: false, error: "question_not_durable" };
  }
  if (snap.run_id !== runId) return { ok: false, error: "snapshot_run_mismatch" };
  return { ok: true, resume_state: snap };
}

export function laneProviderIsSuspended(lane) {
  const s = lane?.agent_session?.state || null;
  if (s === "SUSPENDED") return true;
  return lane?.execution_run?.provider_suspension?.state === "SUSPENDED";
}

/** Lanes whose provider is suspended, for the capacity assessment. */
export function suspendedLaneIds(lanes = []) {
  return lanes.filter(laneProviderIsSuspended).map((l) => l.lane_id).filter(Boolean);
}

/**
 * Suspend the provider on a lane, preserving all durable work.
 *
 * `confirm` is required when the run is doing something a person would not
 * expect to be interrupted. A parked lane past its grace period is routine and
 * needs no confirmation.
 */
export async function suspendLaneProvider(laneId, {
  origin = "governor",
  reason = "parked_awaiting_input",
  confirm = false,
  nowMs = Date.now(),
  root = undefined,
} = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found", command: SUSPEND_COMMAND };
  const session = activeAgentSessionForLane(rec.lane_id, root);
  if (!session) return { ok: false, error: "no_agent_session", command: SUSPEND_COMMAND };
  if (session.state === "SUSPENDED") {
    return { ok: true, already: true, command: SUSPEND_COMMAND, lane_id: rec.lane_id };
  }
  const run = session.run_id ? getExecutionRun(session.run_id, root) : null;
  const runState = run?.state || null;

  if (INTERRUPTS_WORK_RUN_STATES.includes(runState) && confirm !== true) {
    return {
      ok: false,
      error: "confirm_required",
      command: SUSPEND_COMMAND,
      run_state: runState,
      detail: "Suspending would interrupt work that is currently running.",
    };
  }

  // ---- durability BEFORE the process is stopped ----
  let resumeState = null;
  if (run) {
    resumeState = captureResumeState(run, session, rec, { nowMs });
    if (!resumeState && runState === "NEEDS_INPUT") {
      return { ok: false, error: "question_not_durable", command: SUSPEND_COMMAND };
    }
    if (resumeState) {
      patchRunFields(run.run_id, {
        provider_suspension: {
          state: "SUSPENDED",
          reason,
          at: iso(nowMs),
          origin,
          resume_state: resumeState,
        },
      }, { nowMs, root });
      const verified = needsInputIsDurable(run.run_id, { root });
      if (!verified.ok) {
        return { ok: false, error: verified.error, command: SUSPEND_COMMAND };
      }
    }
  }

  const tmux = rec.binding?.tmux_session || null;
  const stopped = tmux ? await stopProcess({ tmuxSession: tmux }) : { ok: true, skipped: "no_tmux_session" };
  if (tmux && stopped?.ok === false) {
    // The work is already durable; the process just would not go down. Leave
    // the session ACTIVE rather than claiming a seat was freed.
    return { ok: false, error: "provider_stop_failed", command: SUSPEND_COMMAND, detail: stopped?.error || null };
  }

  patchAgentSession(session.agent_session_id, {
    state: "SUSPENDED",
    suspended_at: iso(nowMs),
    suspension_reason: reason,
  }, { root, event: "provider_suspended", extra: { reason, origin } });

  try {
    writeAuditEvent({
      actor: origin,
      command: SUSPEND_COMMAND,
      input: { lane_id: rec.lane_id, reason },
      target: { kind: "lane", label: rec.name || rec.lane_id, ref: { lane_id: rec.lane_id } },
      preview_summary: `Suspend provider on ${rec.name || rec.lane_id}; durable work preserved`,
      confirmed: true,
      outcome: "succeeded",
    }, nowMs);
  } catch { /* audit must not block the lifecycle */ }

  return {
    ok: true,
    command: SUSPEND_COMMAND,
    lane_id: rec.lane_id,
    agent_session_id: session.agent_session_id,
    run_id: run?.run_id || null,
    run_state: runState,
    resume_state: resumeState,
    capacity_released: true,
  };
}

/**
 * Bring the provider back in the same worktree and session.
 *
 * Does not deliver anything: readiness and delivery acknowledgment are the send
 * path's job, and a reply must not be pasted into a pane that is still booting.
 */
export async function resumeLaneProvider(laneId, {
  origin = "governor",
  nowMs = Date.now(),
  root = undefined,
} = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found", command: RESUME_COMMAND };
  const session = activeAgentSessionForLane(rec.lane_id, root);
  if (session && session.state !== "SUSPENDED") {
    return { ok: true, already_running: true, command: RESUME_COMMAND, lane_id: rec.lane_id };
  }
  const started = await startProcess({ laneId: rec.lane_id, root, nowMs });
  if (!started?.ok) {
    return { ok: false, error: started?.error || "provider_start_failed", command: RESUME_COMMAND, detail: started };
  }
  if (session) {
    patchAgentSession(session.agent_session_id, {
      state: "ACTIVE",
      resumed_at: iso(nowMs),
      suspension_reason: null,
    }, { root, event: "provider_resumed", extra: { origin } });
  }
  const run = session?.run_id ? getExecutionRun(session.run_id, root) : null;
  if (run?.provider_suspension?.state === "SUSPENDED") {
    patchRunFields(run.run_id, {
      provider_suspension: {
        ...run.provider_suspension,
        state: "RESUMED",
        resumed_at: iso(nowMs),
      },
    }, { nowMs, root });
  }
  try {
    writeAuditEvent({
      actor: origin,
      command: RESUME_COMMAND,
      input: { lane_id: rec.lane_id },
      target: { kind: "lane", label: rec.name || rec.lane_id, ref: { lane_id: rec.lane_id } },
      preview_summary: `Resume provider on ${rec.name || rec.lane_id}`,
      confirmed: true,
      outcome: "succeeded",
    }, nowMs);
  } catch { /* */ }
  return {
    ok: true,
    command: RESUME_COMMAND,
    lane_id: rec.lane_id,
    agent_session_id: session?.agent_session_id || started.agent_session_id || null,
    run_id: run?.run_id || null,
  };
}

/**
 * Is this parked lane past its warm grace period?
 *
 * The grace exists so an operator who answers straight away never pays for a
 * restart. Past it, the seat is worth more than the warm process.
 */
export function parkedPastGrace(run, { nowMs = Date.now(), graceMs = NEEDS_INPUT_GRACE_MS } = {}) {
  if (!run) return false;
  if (!AUTO_SUSPENDABLE_RUN_STATES.includes(run.state)) return false;
  if (run.provider_suspension?.state === "SUSPENDED") return false;
  // WAITING_RESOURCE is only safe to suspend when nothing in-memory has to stay
  // alive: an exclusive lease actively held, or a continuation mid-delivery,
  // both need the process.
  if (run.state === "WAITING_RESOURCE") {
    const wait = run.resource_wait || {};
    if (wait.exclusive_phase === "EXCLUSIVE_ACTIVE") return false;
    if (wait.continuation_state === "PENDING" || wait.continuation_state === "DELIVERING") return false;
    if (wait.resuming || wait.ready_to_resume) return false;
  }
  const since = Date.parse(run.updated_at || run.started_at || run.created_at || "");
  if (!Number.isFinite(since)) return false;
  return (nowMs - since) >= graceMs;
}

/**
 * Sweep: suspend every parked lane past its grace period, freeing seats for
 * queued work. Never touches a lane that is doing something.
 */
export async function reconcileParkedProviders({
  lanes = [],
  nowMs = Date.now(),
  root = undefined,
  graceMs = NEEDS_INPUT_GRACE_MS,
} = {}) {
  const suspended = [];
  for (const lane of lanes) {
    if (laneProviderIsSuspended(lane)) continue;
    const session = activeAgentSessionForLane(lane.lane_id, root);
    if (!session || session.state !== "ACTIVE") continue;
    const run = session.run_id ? getExecutionRun(session.run_id, root) : null;
    if (!parkedPastGrace(run, { nowMs, graceMs })) continue;
    const out = await suspendLaneProvider(lane.lane_id, {
      origin: "governor",
      reason: run.state === "NEEDS_INPUT" ? "parked_awaiting_input" : "parked_awaiting_resource",
      nowMs,
      root,
    });
    if (out.ok && !out.already) suspended.push({ lane_id: lane.lane_id, run_id: out.run_id });
  }
  // The inverse, which nothing corrected before: a record that says SUSPENDED
  // while a provider is demonstrably ALIVE in the lane.
  //
  // Suspension is stored in two places — the agent session and the run — and a
  // resume that brings the process up without flipping both leaves the lane
  // reading "Needs input · suspended" while a Claude sits at a ready prompt in
  // its worktree. Observed on two lanes at once: live panes, ready carets, and
  // both records still SUSPENDED, with nothing in the governor to fix it. To an
  // operator the lane simply looks dead.
  //
  // The live process is the truth; the record follows it.
  const revived = [];
  for (const lane of lanes) {
    // Resolve suspension from the STORES, not from projection fields.
    //
    // laneProviderIsSuspended reads lane.agent_session / lane.execution_run,
    // which exist only on a PROJECTED lane. The governor calls this with durable
    // lane RECORDS, which carry neither — so the predicate was always false here
    // and this loop never ran once in production. Runtime Performance sat with a
    // live Claude (pid 97004, ready caret) and a SUSPENDED session record,
    // holding a seat while its own run stayed QUEUED: it starved itself, and
    // capacity read 4/3 because a fourth provider was alive.
    // activeAgentSessionForLane filters to ACTIVE-ish states, so it never
    // returns a SUSPENDED session — the exact record this pass exists to heal.
    // Look at the lane's sessions directly.
    const all = listAgentSessionsForLane(lane.lane_id, root) || [];
    const session = all.find((x) => x?.state === "SUSPENDED")
      || activeAgentSessionForLane(lane.lane_id, root);
    const linkedRun = session?.run_id ? getExecutionRun(session.run_id, root) : null;
    const suspended = session?.state === "SUSPENDED"
      || linkedRun?.provider_suspension?.state === "SUSPENDED"
      || laneProviderIsSuspended(lane);
    if (!suspended) continue;
    const alive = await providerIsLive(lane, { root });
    if (!alive) continue;
    if (session && session.state === "SUSPENDED") {
      patchAgentSession(session.agent_session_id, {
        state: "ACTIVE",
        resumed_at: iso(nowMs),
        suspension_reason: null,
      }, { root, event: "provider_resumed", extra: { origin: "reconciler", evidence: "live_provider" } });
    }
    const run = linkedRun;
    if (run?.provider_suspension?.state === "SUSPENDED") {
      patchRunFields(run.run_id, {
        provider_suspension: { ...run.provider_suspension, state: "RESUMED", resumed_at: iso(nowMs) },
      }, { nowMs, root });
    }
    revived.push({ lane_id: lane.lane_id, run_id: run?.run_id || null });
  }
  return { ok: true, suspended, revived };
}

/**
 * Is a provider actually running for this lane right now?
 *
 * Asks the substrate, not the record — the record is what we are checking.
 */
async function providerIsLive(lane, { root = undefined } = {}) {
  const session = lane?.binding?.tmux_session || null;
  const path = lane?.binding?.worktree_path || null;
  if (!session && !path) return false;
  try {
    // liveClaudePanes is NOT exported from alloy-dev-adapter — importing it
    // threw straight into the catch below, so this helper answered "not live"
    // for every lane and the revive pass could never fire. Use the exported
    // pane listing instead.
    const { discoverLivePanes } = await import("./lanes.mjs");
    // `discoverLivePanes` is the canonical boundary: it distinguishes "no tmux
    // server" (zero panes — a fact) from "tmux could not answer" (unknown).
    // Reading the raw exit code here treated a fresh host with no server as
    // unknown, which degrades capacity to a refusal and blocks every start.
    const seen = await discoverLivePanes();
    if (!seen.ok) return false;
    const panes = seen.panes || [];
    return panes.some((p) => (session && p.session === session)
      || (path && (p.cwd === path || String(p.cwd || "").startsWith(`${path}/`))));
  } catch {
    return false;
  }
}

// ── S8: contention-driven seat reclamation ───────────────────────────────────
//
// Suspension above is the parked case: a lane holding a seat while it waits on
// a person. S8 adds the IDLE case — a live agent at a ready prompt with no run
// at all — and one rule that governs it: the seat is released only because
// another admission is waiting for provider capacity, never because time
// passed. The classification, the grace policy, the ranking and the plan live
// in provider-seat-state.mjs; the release itself goes through the code above,
// because there must be exactly one way to put a provider down.

import {
  captureDormancyState,
  dormancyIsDurable,
  verifyResumeContinuity,
  RESUME_FAILURE_WAIT_REASON,
} from "./provider-seat-state.mjs";
import { describeWait } from "./run-wait.mjs";
import { listExecutionRunsForLane } from "./execution-run.mjs";

export const RECLAIM_COMMAND = "lane.reclaim_idle_seat";
/** Why a reclaim refused. Each one leaves the seat exactly as it was. */
export const RECLAIM_REFUSALS = Object.freeze([
  "lane_not_found", "no_agent_session", "no_recheck_provided",
  "eligibility_changed", "dormancy_state_not_durable", "provider_stop_failed",
]);

/**
 * Attachment IDENTITY for the dormancy snapshot — never the bytes.
 *
 * Attachments live in their own store on disk and outlive any process; what
 * dormancy must preserve is the reference set, so a resumed lane can prove it
 * still owns the same files.
 */
async function laneAttachments(laneId, root) {
  try {
    const { readAttachmentStore } = await import("./lane-attachments.mjs");
    const id = String(laneId || "");
    return Object.values(readAttachmentStore(root).attachments || {})
      .filter((a) => a?.lane_id === id)
      .sort((a, b) => String(a.attachment_id).localeCompare(String(b.attachment_id)));
  } catch { return []; }
}

/**
 * Release ONE idle seat because a specific admission is waiting for it.
 *
 * THE RECHECK IS THE SAFETY PROPERTY. A plan is computed from a snapshot, and
 * between the snapshot and the release an instruction can arrive. So the seat
 * is reclassified from live state immediately before the process is touched,
 * and any change at all aborts. `recheckSeat` is REQUIRED: omitting it refuses
 * the reclaim rather than falling back to the cached verdict, so no future
 * caller can skip the recheck by forgetting it.
 *
 * DURABILITY BEFORE RELEASE, as everywhere else in this module. The dormancy
 * snapshot is written and read back before the provider is stopped; if it
 * cannot be made durable the seat is kept.
 */
export async function reclaimIdleProviderSeat({
  laneId,
  reclaimedFor = null,
  reclaimReason = "provider_capacity_contention",
  recheckSeat = null,
  origin = "provider-capacity",
  nowMs = Date.now(),
  root = undefined,
} = {}) {
  if (typeof recheckSeat !== "function") {
    return { ok: false, error: "no_recheck_provided", command: RECLAIM_COMMAND, lane_id: laneId ?? null };
  }
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found", command: RECLAIM_COMMAND };
  const session = activeAgentSessionForLane(rec.lane_id, root);
  if (!session) return { ok: false, error: "no_agent_session", command: RECLAIM_COMMAND, lane_id: rec.lane_id };
  if (session.state === "SUSPENDED") {
    return { ok: true, already: true, command: RECLAIM_COMMAND, lane_id: rec.lane_id };
  }

  // ---- recompute eligibility from live state, immediately before release ----
  const fresh = await recheckSeat({ laneId: rec.lane_id, root, nowMs });
  if (!fresh || fresh.state !== "idle" || fresh.reclaimable !== true) {
    return {
      ok: false,
      error: "eligibility_changed",
      command: RECLAIM_COMMAND,
      lane_id: rec.lane_id,
      observed_state: fresh?.state || null,
      observed_reason: fresh?.state_reason || null,
      aborted: true,
    };
  }

  // ---- durability BEFORE the process is stopped ----
  const run = session.run_id ? getExecutionRun(session.run_id, root) : null;
  const snapshot = captureDormancyState({
    lane: rec,
    session,
    run,
    runLedger: listExecutionRunsForLane(rec.lane_id, root) || [],
    attachments: await laneAttachments(rec.lane_id, root),
    now: nowMs,
  });
  const durable = dormancyIsDurable(snapshot);
  if (!durable.ok) {
    return { ok: false, error: durable.error, command: RECLAIM_COMMAND, lane_id: rec.lane_id, missing: durable.missing };
  }
  patchAgentSession(session.agent_session_id, {
    dormancy: snapshot,
    dormancy_reason: reclaimReason,
    reclaimed_for: reclaimedFor,
  }, { root });
  // Read it back. A snapshot we cannot re-read is not durable, whatever the
  // write returned.
  const verified = getAgentSession(session.agent_session_id, root)?.dormancy || null;
  if (!verified || verified.lane_id !== rec.lane_id) {
    return { ok: false, error: "dormancy_state_not_durable", command: RECLAIM_COMMAND, lane_id: rec.lane_id };
  }

  // ---- release through the one canonical suspension path ----
  const out = await suspendLaneProvider(rec.lane_id, {
    origin,
    reason: reclaimReason,
    nowMs,
    root,
  });
  if (!out.ok) {
    return { ok: false, error: out.error, command: RECLAIM_COMMAND, lane_id: rec.lane_id, detail: out.detail ?? null };
  }

  patchAgentSession(session.agent_session_id, {
    dormant_since: iso(nowMs),
    reclaim_reason: reclaimReason,
    reclaimed_for: reclaimedFor,
  }, { root, event: "seat_reclaimed", extra: { reclaimed_for: reclaimedFor, reason: reclaimReason } });

  return {
    ok: true,
    command: RECLAIM_COMMAND,
    lane_id: rec.lane_id,
    agent_session_id: session.agent_session_id,
    // No fake live-provider metadata is left behind.
    provider_process_absent: true,
    provider_capacity_released: true,
    resume_available: true,
    dormant_since: iso(nowMs),
    reclaim_reason: reclaimReason,
    reclaimed_for: reclaimedFor,
    dormancy: snapshot,
  };
}

/**
 * Bring a dormant lane back.
 *
 * Capacity is reacquired through the canonical admission path because that is
 * what `startLaneAgentSession` does — it assesses provider capacity and queues
 * an admission when the ceiling binds. Resume does not get its own door.
 *
 * On failure the lane STAYS dormant and says so, with a bounded S6 wait. The
 * one thing that must never happen is a record claiming a live provider that
 * is not there.
 */
export async function resumeDormantLane(laneId, {
  origin = "operator",
  nowMs = Date.now(),
  root = undefined,
} = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found", command: RESUME_COMMAND };
  const sessions = listAgentSessionsForLane(rec.lane_id, root) || [];
  const dormantSession = sessions.find((s) => s?.state === "SUSPENDED" && s?.dormancy)
    || sessions.find((s) => s?.state === "SUSPENDED")
    || activeAgentSessionForLane(rec.lane_id, root);
  const before = dormantSession?.dormancy || null;

  const out = await resumeLaneProvider(rec.lane_id, { origin, nowMs, root });
  if (!out.ok) {
    if (dormantSession) {
      patchAgentSession(dormantSession.agent_session_id, {
        resume_attempts: Number(dormantSession.resume_attempts || 0) + 1,
        last_resume_result: { ok: false, error: out.error || "provider_start_failed", at: iso(nowMs) },
      }, { root, event: "provider_resume_failed", extra: { error: out.error || null } });
    }
    return {
      ok: false,
      error: out.error || "provider_start_failed",
      command: RESUME_COMMAND,
      lane_id: rec.lane_id,
      // Truthful: still dormant, still recoverable, holding nothing.
      still_dormant: true,
      provider_capacity_held: false,
      resume_available: true,
      wait: describeWait({
        reason: RESUME_FAILURE_WAIT_REASON,
        resource_id: rec.lane_id,
        waiting_since: nowMs,
        now: nowMs,
      }),
    };
  }

  const after = captureDormancyState({
    lane: getDurableLane(rec.lane_id, root) || rec,
    session: activeAgentSessionForLane(rec.lane_id, root),
    run: out.run_id ? getExecutionRun(out.run_id, root) : null,
    runLedger: listExecutionRunsForLane(rec.lane_id, root) || [],
    attachments: await laneAttachments(rec.lane_id, root),
    now: nowMs,
    // Carried from the snapshot: these describe the conversation the lane had,
    // not anything the new process invented.
    lastInstruction: before?.last_instruction ?? null,
    lastOutput: before?.last_output ?? null,
    conversationRef: before?.conversation_ref ?? null,
    configuration: before?.configuration ?? null,
  });
  const continuity = before
    ? verifyResumeContinuity(before, after)
    : { ok: true, differences: [], volatile_ignored: [], not_verified: "no_prior_dormancy_snapshot" };

  const sessionId = dormantSession?.agent_session_id || out.agent_session_id || null;
  if (sessionId) {
    const prior = getAgentSession(sessionId, root);
    patchAgentSession(sessionId, {
      resume_count: Number(prior?.resume_count || 0) + 1,
      last_resume_result: { ok: true, at: iso(nowMs), continuity_ok: continuity.ok },
      dormant_since: null,
      reclaim_reason: null,
    }, { root, event: "provider_resumed", extra: { origin, from: "dormant" } });
  }

  return {
    ok: true,
    command: RESUME_COMMAND,
    lane_id: rec.lane_id,
    agent_session_id: out.agent_session_id || sessionId,
    run_id: out.run_id || null,
    resumed_from_dormancy: Boolean(before),
    continuity,
    dormancy_before: before,
    lane_after: after,
  };
}
