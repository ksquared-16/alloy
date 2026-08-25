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
    const session = activeAgentSessionForLane(lane.lane_id, root);
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
    const { liveClaudePanes } = await import("./alloy-dev-adapter.mjs");
    const panes = await liveClaudePanes();
    return (panes || []).some((p) => (session && p.session === session)
      || (path && (p.cwd === path || String(p.cwd || "").startsWith(`${path}/`))));
  } catch {
    return false;
  }
}
