/**
 * Managed send: operator instruction → Execution Run → existing lane delivery.
 * Does not change tmux targeting, duplicate window, or resource leases.
 *
 * Creation: operator Send creates a QUEUED run, then delivers through
 * sendLaneInstruction. Success → EXECUTING. Delivery/target failure → FAILED
 * (evidence retained). Duplicate / in-progress refusals happen before create.
 *
 * One active non-terminal run per lane. NEEDS_INPUT continues the same run.
 */
import { afterLaneInstructionDelivered } from "./lane-notify.mjs";
import {
  activeRunForLane,
  createQueuedRun,
  executionEnvelope,
  lastInstructionFromRun,
  publicExecutionRun,
  transitionExecutionRun,
} from "./execution-run.mjs";
import {
  canOperatorSupersedeRun,
  collectStaleRunFacts,
  completeRunForOperatorFollowUp,
  reconcileLaneBeforeSend,
} from "./execution-stale.mjs";
import { isLaneSendInProgress, sendLaneInstruction, wouldDuplicateLaneSend } from "./lanes.mjs";

function decorate(out, run, extra = {}) {
  if (extra.stale_run_closed) out.stale_run_closed = true;
  if (!run) return out;
  out.run_id = run.run_id;
  out.execution_run = publicExecutionRun(run, { includeInstruction: true });
  const last = lastInstructionFromRun(run);
  if (last) out.last_instruction = last;
  return out;
}

export function laneInstructionHttpStatus(out) {
  if (out?.ok) return 200;
  const e = out?.error;
  if (e === "invalid_lane_id" || e === "instruction_empty" || e === "instruction_too_large" || e === "unexpected_control_field" || e === "missing_lane_id") return 400;
  if (e === "send_in_progress" || e === "duplicate_send" || e === "current_run_active") return 409;
  if (e === "pane_unavailable" || e === "target_mismatch" || e === "delivery_failed") return 503;
  return 404;
}

function bindingExists(rec) {
  return Boolean(rec?.binding?.worktree_path || rec?.binding?.tmux_session);
}

async function laneHasEligibleSession(laneId) {
  try {
    const { getDevelopmentLane, inferAgentPresence } = await import("./lanes.mjs");
    const { laneClaudePresent } = await import("./agent-session-lifecycle.mjs");
    const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
    if (!found?.ok) return false;
    const preferred = String(found.lane?.binding?.provider || found.lane?.preferred_provider || "").toLowerCase();
    if (preferred === "cursor") {
      return inferAgentPresence(found.lane?.tmux || {}, { provider: "cursor" }) === "present";
    }
    return Boolean(laneClaudePresent(found.lane));
  } catch {
    return false;
  }
}

async function replaceQueuedInstruction({ rec, run, text, nowMs, root, size }) {
  const { patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
  const reason = run.state_reason
    || (bindingExists(rec) ? "waiting_for_agent_session" : "waiting_for_execution_capacity");
  const patched = patchRunFields(run.run_id, { instruction: text, state_reason: reason }, { nowMs, root });
  if (!patched.ok) {
    return refused(rec.lane_id, patched.error || "instruction_empty", nowMs, size, run);
  }
  return decorate({
    ok: true,
    schema_version: "vacilando.lane.send.v1",
    lane_id: rec.lane_id,
    status: "queued",
    error: null,
    instruction_size: size,
    delivered_at: null,
    admission_queued: true,
    replaced: true,
    session_required: reason === "waiting_for_agent_session",
  }, getExecutionRun(run.run_id, root) || patched.run || run);
}

async function queueWithoutImmediateDelivery({ rec, run, nowMs, root, size, reason }) {
  const { createAdmissionRequest, evaluateAdmissionQueue } = await import("./execution-admission.mjs");
  createAdmissionRequest({ laneId: rec.lane_id, runId: run.run_id, nowMs, root });
  try { await evaluateAdmissionQueue({ root, nowMs }); } catch { /* stay queued */ }
  try {
    const { patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
    patchRunFields(run.run_id, { state_reason: reason }, { nowMs, root });
    return decorate({
      ok: true,
      schema_version: "vacilando.lane.send.v1",
      lane_id: rec.lane_id,
      status: "queued",
      error: null,
      instruction_size: size,
      delivered_at: null,
      admission_queued: true,
      session_required: reason === "waiting_for_agent_session",
    }, getExecutionRun(run.run_id, root) || run);
  } catch {
    return decorate({
      ok: true,
      schema_version: "vacilando.lane.send.v1",
      lane_id: rec.lane_id,
      status: "queued",
      error: null,
      instruction_size: size,
      delivered_at: null,
      admission_queued: true,
      session_required: reason === "waiting_for_agent_session",
    }, run);
  }
}

function refused(laneId, error, nowMs, size, run = null) {
  return decorate({
    ok: false,
    schema_version: "vacilando.lane.send.v1",
    lane_id: laneId,
    status: "refused",
    error,
    instruction_size: size,
    delivered_at: new Date(nowMs).toISOString(),
    audit_id: null,
  }, run);
}

/**
 * Gateway / API entry. One active non-terminal run per lane.
 * NEEDS_INPUT: operator send continues the same run (decision reply).
 * Other non-terminal states: refuse current_run_active.
 */
export async function deliverManagedLaneInstruction(laneId, instruction, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const root = opts.root;
  const send = opts.sendLaneInstruction || sendLaneInstruction;
  const text = String(instruction ?? "");
  const size = text.length;

  let staleClosed = false;
  try {
    const rec = reconcileLaneBeforeSend(laneId, { root, nowMs });
    staleClosed = Boolean(rec.stale_run_closed);
  } catch { /* send still proceeds; active-run check below is authoritative */ }

  let active = activeRunForLane(laneId, root);
  if (active?.state === "QUEUED") {
    try {
      const { getDurableLane } = await import("./development-lane.mjs");
      const rec = getDurableLane(laneId, root);
      if (rec) {
        return replaceQueuedInstruction({ rec, run: active, text, nowMs, root, size });
      }
    } catch { /* fall through to current_run_active */ }
    return refused(laneId, "current_run_active", nowMs, size, active);
  }
  if (active && active.state !== "NEEDS_INPUT") {
    try {
      const facts = collectStaleRunFacts(active, { root, nowMs });
      if (canOperatorSupersedeRun(active, facts)) {
        const closed = completeRunForOperatorFollowUp(active, { root, nowMs });
        if (closed.ok && !closed.noop) {
          staleClosed = true;
          active = null;
        }
      }
    } catch { /* fall through to current_run_active */ }
    if (active && active.state !== "NEEDS_INPUT") {
      return refused(laneId, "current_run_active", nowMs, size, active);
    }
  }

  if (isLaneSendInProgress(laneId)) {
    return refused(laneId, "send_in_progress", nowMs, size, active);
  }

  if (!active && wouldDuplicateLaneSend(laneId, text, nowMs, opts.duplicateWindowMs)) {
    return send(laneId, text, opts);
  }

  if (active?.state === "NEEDS_INPUT") {
    const out = await send(laneId, text, {
      ...opts,
      nowMs,
      dedupeKey: text,
      duplicateWindowMs: 0,
    });
    if (!(out.ok && out.status === "delivered")) {
      return decorate(out, active);
    }
    const continued = transitionExecutionRun(active.run_id, "EXECUTING", {
      reason: "operator_input",
      origin: "operator",
      nowMs,
      root,
      progress: "Operator continued the run",
      worktreePath: out.worktree_path || opts.worktreePath || null,
    });
    const run = continued.ok ? continued.run : active;
    try {
      const saved = await afterLaneInstructionDelivered(laneId, {
        instruction: text,
        delivered_at: out.delivered_at,
        status: "delivered",
        instruction_size: text.length,
      }, {
        getOutput: opts.getOutput,
        intervalMs: opts.notifyIntervalMs,
      });
      if (saved.ok) out.last_instruction = { ...saved.last_instruction, run_id: run.run_id, run_state: run.state };
    } catch { /* persistence must not block delivery ack */ }
    return decorate(out, run);
  }

  const created = createQueuedRun({
    laneId,
    instruction: text,
    worktreePath: opts.worktreePath || null,
    nowMs,
    origin: "operator",
    root,
  });
  if (!created.ok) {
    return refused(laneId, created.error, nowMs, size, created.run || null);
  }

  let run = created.run;
  try {
    const { getDurableLane } = await import("./development-lane.mjs");
    const rec = getDurableLane(laneId, root);
    if (rec) {
      const eligible = await laneHasEligibleSession(rec.lane_id);
      if (!eligible) {
        const reason = bindingExists(rec) ? "waiting_for_agent_session" : "waiting_for_execution_capacity";
        return queueWithoutImmediateDelivery({ rec, run, nowMs, root, size, reason });
      }
    }
  } catch { /* fall through to live send */ }
  const out = await send(laneId, executionEnvelope(run.run_id, text, { laneId }), {
    ...opts,
    nowMs,
    dedupeKey: text,
  });

  if (out.ok && out.status === "delivered") {
    const exec = transitionExecutionRun(run.run_id, "EXECUTING", {
      reason: "instruction_delivered",
      origin: "operator",
      nowMs,
      root,
      worktreePath: out.worktree_path || opts.worktreePath || null,
    });
    run = exec.ok ? exec.run : run;
    try {
      const saved = await afterLaneInstructionDelivered(laneId, {
        instruction: text,
        delivered_at: out.delivered_at,
        status: "delivered",
        instruction_size: text.length,
      }, {
        getOutput: opts.getOutput,
        intervalMs: opts.notifyIntervalMs,
      });
      if (saved.ok) out.last_instruction = { ...saved.last_instruction, run_id: run.run_id, run_state: run.state };
    } catch { /* persistence must not block delivery ack */ }
    return decorate(out, run, { stale_run_closed: staleClosed });
  }

  try {
    const { getDurableLane } = await import("./development-lane.mjs");
    const rec = getDurableLane(laneId, root);
    const offlineMiss = rec && (out.error === "pane_unavailable" || out.error === "target_mismatch")
      && !(await laneHasEligibleSession(rec.lane_id));
    if (offlineMiss) {
      const reason = bindingExists(rec) ? "waiting_for_agent_session" : "waiting_for_execution_capacity";
      return queueWithoutImmediateDelivery({ rec, run, nowMs, root, size, reason });
    }
  } catch { /* retain FAILED for true delivery failure */ }

  const failed = transitionExecutionRun(run.run_id, "FAILED", {
    reason: out.error || "delivery_failed",
    origin: "system",
    nowMs,
    root,
    completion_report: { summary: out.error || "delivery_failed" },
  });
  run = failed.ok ? failed.run : run;
  return decorate(out, run, { stale_run_closed: staleClosed });
}

/**
 * Deliver an already-approved QUEUED run after admission. Does not create a
 * second run. Delivery failure leaves the run QUEUED for a later bounded retry.
 */
export async function deliverExistingQueuedRun(runId, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const root = opts.root;
  const { getExecutionRun } = await import("./execution-run.mjs");
  const run = getExecutionRun(runId, root);
  if (!run) return { ok: false, error: "run_not_found" };
  if (run.state === "EXECUTING" || run.started_at) {
    return { ok: true, already_delivered: true, run };
  }
  if (run.state !== "QUEUED") return { ok: false, error: "not_queued", run };
  try {
    const { activeAgentSessionForLane } = await import("./agent-session.mjs");
    const session = activeAgentSessionForLane(run.lane_id, root);
    if (session && ["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"].includes(session.state)) {
      return { ok: false, deferred: true, error: "session_not_oriented", run };
    }
    if (run.state_reason === "waiting_for_agent_session" && session && !session.oriented_at) {
      return { ok: false, deferred: true, error: "session_not_oriented", run };
    }
  } catch { /* deliver if session store is unavailable */ }
  const send = opts.sendLaneInstruction || sendLaneInstruction;
  const out = await send(run.lane_id, executionEnvelope(run.run_id, run.instruction, { laneId: run.lane_id }), {
    ...opts,
    nowMs,
    dedupeKey: `admission:${run.run_id}`,
  });
  if (out.ok && out.status === "delivered") {
    const exec = transitionExecutionRun(run.run_id, "EXECUTING", {
      reason: "admission_delivered",
      origin: "governor",
      nowMs,
      root,
      worktreePath: out.worktree_path || opts.worktreePath || null,
    });
    return decorate(out, exec.ok ? exec.run : run);
  }
  return { ok: false, deferred: true, error: out.error || "delivery_failed", delivery: out, run };
}
