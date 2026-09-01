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
import { createHash } from "node:crypto";
import { afterLaneInstructionDelivered } from "./lane-notify.mjs";
import {
  activeRunForLane,
  createQueuedRun,
  executionEnvelope,
  isTerminalRunState,
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

function instructionFingerprint(text) {
  return createHash("sha256").update(String(text || ""), "utf8").digest("hex");
}

async function markDeliveryAcknowledged(run, out, {
  nowMs,
  root,
  provider = null,
  instruction = null,
} = {}) {
  const { patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
  patchRunFields(run.run_id, {
    delivery: {
      acknowledged: true,
      provider: provider || run.delivery?.provider || null,
      at: out?.delivered_at || new Date(nowMs).toISOString(),
      worktree_path: out?.worktree_path || run.worktree_path || null,
      instruction_fingerprint: instruction
        ? instructionFingerprint(instruction)
        : (run.delivery?.instruction_fingerprint || null),
      provider_session_id: out?.session_id || out?.provider_session_id || null,
      // The receipt token is what later proves output belongs to THIS run.
      // Delivery starts unconfirmed: a paste that tmux accepted is not yet
      // evidence a provider read anything.
      receipt_token: run.run_id,
      receipt_confirmed: false,
      prompt_readiness: out?.prompt_readiness || run.delivery?.prompt_readiness || null,
      output_baseline_fingerprint: out?.output_baseline_fingerprint
        || run.delivery?.output_baseline_fingerprint
        || null,
      output_baseline_captured_at: out?.output_baseline_captured_at
        || run.delivery?.output_baseline_captured_at
        || null,
      error: null,
    },
    // Bind the run to the baseline captured immediately BEFORE the paste, not
    // to the first capture that happens to arrive after it.
    output_fingerprint_at_send: out?.output_baseline_fingerprint || undefined,
  }, { nowMs, root });
  return getExecutionRun(run.run_id, root) || run;
}

export const UNDELIVERED_PROMPT_BLOCK = "undelivered_provider_prompt_block";

/**
 * The operator answered a lane whose provider was suspended.
 *
 * Store the reply on the run FIRST, so a failure anywhere after this point
 * cannot lose it, then ask the capacity governor for a seat. With a seat the
 * provider comes back and delivery proceeds through the normal path — the reply
 * is pasted exactly once, by the one code path that pastes. Without a seat the
 * lane reads "Queued to resume" and the reply waits; it is not re-typed by the
 * operator and not delivered twice.
 *
 * Returns a response when the caller should stop here, or null to continue into
 * the ordinary continuation path.
 */
async function resumeSuspendedForReply({ laneId, run, text, nowMs, root, size }) {
  const { patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
  const { resumeLaneProvider } = await import("./provider-suspension.mjs");

  const pending = {
    instruction: text,
    queued_at: new Date(nowMs).toISOString(),
    fingerprint: instructionFingerprint(text),
  };
  // Durable before anything else can fail.
  patchRunFields(run.run_id, {
    provider_suspension: { ...(run.provider_suspension || {}), pending_reply: pending },
  }, { nowMs, root });

  const resumed = await resumeLaneProvider(laneId, { origin: "operator", nowMs, root });
  if (!resumed.ok) {
    return decorate({
      ok: true,
      schema_version: "vacilando.lane.send.v1",
      lane_id: laneId,
      status: "queued",
      error: null,
      instruction_size: size,
      delivered_at: null,
      admission_queued: true,
      resume_pending: true,
      blocking_screen: "Queued to resume — your reply is saved and will be delivered when a provider is free.",
    }, getExecutionRun(run.run_id, root) || run);
  }
  // The provider is back; clear the pending copy so the continuation below is
  // the single delivery, and fall through to it.
  patchRunFields(run.run_id, {
    provider_suspension: {
      ...(getExecutionRun(run.run_id, root)?.provider_suspension || {}),
      state: "RESUMED",
      pending_reply: null,
      resumed_at: new Date(nowMs).toISOString(),
    },
  }, { nowMs, root });
  return null;
}

/**
 * A non-terminal run whose instruction was refused at the readiness gate and
 * never reached the provider.
 *
 * Recognises runs parked by the older NEEDS_INPUT behaviour as well as the
 * current QUEUED one, because lanes stuck that way exist in the store right now
 * and must be recoverable without hand-editing JSON.
 */
export function undeliveredPromptBlocked(run) {
  if (!run) return false;
  if (isTerminalRunState(run.state)) return false;
  if (run.delivery?.acknowledged === true) return false;
  if (run.started_at) return false;
  const err = run.delivery?.error || null;
  const reason = run.state_reason || null;
  return err === "provider_prompt_not_ready"
    || reason === "provider_prompt_not_ready"
    || reason === UNDELIVERED_PROMPT_BLOCK
    || reason === "waiting_for_ready_prompt";
}

/**
 * Operator Send is a NEW turn, not an answer to a dialog the composer cannot
 * reach. Close the undelivered run so the send creates a fresh one; its
 * instruction is preserved on the failed run for reference.
 */
function supersedeUndeliveredPromptBlock(run, { root, nowMs }) {
  const out = transitionExecutionRun(run.run_id, "FAILED", {
    reason: UNDELIVERED_PROMPT_BLOCK,
    origin: "operator",
    nowMs,
    root,
    completion_report: {
      summary: "Not sent — the agent terminal was showing a prompt that cannot be answered from Vacilando. Superseded by a new instruction.",
    },
  });
  return out.ok;
}

/**
 * The pane was not at an actionable prompt, so nothing was pasted.
 *
 * This used to park the run in NEEDS_INPUT, which was wrong in a way that stuck
 * the lane. NEEDS_INPUT means "the agent asked the operator something", and the
 * operator answers it from the Vacilando composer. A Claude permission dialog
 * is the opposite: it can only be answered at the terminal, and the composer
 * cannot reach it. Worse, NEEDS_INPUT is protective — the governor will not
 * close it — and the next Send was treated as a decision reply, so it retried
 * the paste into the same blocked pane. The lane could not move.
 *
 *   a standing dialog (permission / onboarding / trust / login / update /
 *   setup / resume picker)  -> FAIL the run. It needs a person at the keyboard,
 *   it will not clear on its own, and the instruction was never delivered.
 *
 *   a passing condition (mid-turn, unreadable screen) -> keep the run QUEUED
 *   and let admission retry it once the pane is actually ready.
 *
 * Either way the instruction is preserved and the run never claims to have
 * been delivered.
 */
async function refuseUndeliveredPromptBlock({ run, out, nowMs, root, size, laneId }) {
  const { transitionExecutionRun, patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
  const { PROMPT_NOT_READY_ERROR } = await import("./provider-prompt-readiness.mjs");
  const readiness = out?.prompt_readiness || null;
  const needsTerminal = readiness?.needs_terminal_operator === true;
  const detail = readiness?.summary
    || "The agent terminal was not at a prompt, so the instruction was not sent.";
  // If the screen offers numbered choices, the operator can answer it from
  // Vacilando — so do not tell them to go find a terminal. The old copy said
  // "this prompt has to be answered in the agent's terminal", which on a phone
  // was a dead end: the lane could be blocked with no way forward at all.
  let answerable = null;
  try {
    const { answerableScreen } = await import("./provider-screen-answer.mjs");
    const { capturePaneText } = await import("./lanes.mjs");
    const { getDurableLane } = await import("./development-lane.mjs");
    const rec = getDurableLane(laneId, root);
    const target = rec?.binding?.tmux_pane || rec?.binding?.tmux_session || null;
    if (target) {
      const cap = await capturePaneText(target);
      if (cap?.ok && cap.text) {
        answerable = answerableScreen(cap.text, { provider: rec?.preferred_provider || null });
      }
    }
  } catch { /* fall back to the terminal wording */ }
  const canAnswerHere = answerable?.answerable === true;
  const summary = canAnswerHere
    ? `Not sent — ${detail} Answer it below and send again.`
    : needsTerminal
      ? `Not sent — ${detail} This prompt can only be answered in the agent's terminal, not from Vacilando.`
      : `Not sent — ${detail}`;

  patchRunFields(run.run_id, {
    delivery: {
      ...(run.delivery || {}),
      acknowledged: false,
      error: PROMPT_NOT_READY_ERROR,
      at: new Date(nowMs).toISOString(),
      instruction_fingerprint: instructionFingerprint(run.instruction),
      prompt_readiness: readiness,
      needs_terminal_operator: needsTerminal && !canAnswerHere,
      answerable_screen: canAnswerHere ? answerable : null,
    },
    state_reason: needsTerminal ? UNDELIVERED_PROMPT_BLOCK : "waiting_for_ready_prompt",
  }, { nowMs, root });

  if (!needsTerminal) {
    // Transient. Leave it QUEUED so admission can deliver it when the pane is
    // ready, rather than failing work nobody has refused.
    const { createAdmissionRequest, evaluateAdmissionQueue } = await import("./execution-admission.mjs");
    try {
      createAdmissionRequest({ laneId, runId: run.run_id, nowMs, root });
      await evaluateAdmissionQueue({ root, nowMs });
    } catch { /* it stays QUEUED for the next sweep either way */ }
    return decorate({
      ok: false,
      schema_version: "vacilando.lane.send.v1",
      lane_id: laneId,
      status: "queued",
      error: PROMPT_NOT_READY_ERROR,
      instruction_size: size,
      delivered_at: null,
      prompt_readiness: readiness,
      needs_terminal_operator: false,
      blocking_screen: summary,
      admission_queued: true,
    }, getExecutionRun(run.run_id, root) || run);
  }

  const failed = transitionExecutionRun(run.run_id, "FAILED", {
    reason: UNDELIVERED_PROMPT_BLOCK,
    origin: "system",
    nowMs,
    root,
    progress: summary,
    completion_report: { summary },
  });
  const resolved = failed.ok ? failed.run : (getExecutionRun(run.run_id, root) || run);
  return decorate({
    ok: false,
    schema_version: "vacilando.lane.send.v1",
    lane_id: laneId,
    status: "failed",
    error: PROMPT_NOT_READY_ERROR,
    instruction_size: size,
    delivered_at: null,
    prompt_readiness: readiness,
    needs_terminal_operator: true,
    blocking_screen: summary,
  }, resolved);
}

export function laneInstructionHttpStatus(out) {
  if (out?.ok) return 200;
  const e = out?.error;
  if (e === "invalid_lane_id" || e === "instruction_empty" || e === "instruction_too_large" || e === "unexpected_control_field" || e === "missing_lane_id") return 400;
  if (e === "send_in_progress" || e === "duplicate_send" || e === "current_run_active") return 409;
  if (e === "pane_unavailable" || e === "target_mismatch" || e === "delivery_failed" || e === "cursor_delivery_unavailable") return 503;
  // The pane is alive but showing a modal only a human can clear.
  if (e === "provider_prompt_not_ready") return 409;
  return 404;
}

function bindingExists(rec) {
  return Boolean(rec?.binding?.worktree_path || rec?.binding?.tmux_session);
}

async function laneHasEligibleSession(laneId) {
  try {
    const { getDevelopmentLane } = await import("./lanes.mjs");
    const { laneClaudePresent } = await import("./agent-session-lifecycle.mjs");
    const found = await getDevelopmentLane(laneId, { includeGitFacts: false });
    if (!found?.ok) return false;
    const preferred = String(
      found.lane?.preferred_provider || found.lane?.binding?.provider || "",
    ).toLowerCase();
    if (preferred === "cursor") {
      const { cursorExecutableTransport } = await import("./lanes.mjs");
      return cursorExecutableTransport(found.lane).ok;
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

/**
 * A send is intent to provision.
 *
 * THE DEFECT THIS REPLACES: when a lane had no eligible session the send only
 * ENQUEUED and reported `waiting_for_agent_session`, then relied on the
 * admission tick to start a provider. Two things made that a dead end. The
 * reason was a lie whenever the real condition was full provider capacity, and
 * a lane whose admission row was stale never got re-driven at all — so a
 * healthy bound lane rested at `waiting_for_agent_session` indefinitely and the
 * operator had to click Start Session (or open a terminal) before every send.
 *
 * The send now provisions directly when capacity allows, and when it cannot it
 * says WHICH condition it is waiting on.
 */
async function provisionSessionForSend({ rec, run, nowMs, root, size }) {
  if (!bindingExists(rec)) {
    // No worktree/tmux binding: a session is impossible, not merely slow.
    // run-wait's `impossible_when: no_session_binding` fails this fast.
    return { queued: await queueWithoutImmediateDelivery({
      rec, run, nowMs, root, size, reason: "waiting_for_agent_session",
    }) };
  }
  let capacity = null;
  try {
    const { assessSessionStartCapacity } = await import("./alloy-dev-adapter.mjs");
    capacity = await assessSessionStartCapacity({ root });
  } catch { capacity = null; }
  const capacityAvailable = capacity && typeof capacity === "object"
    ? capacity.ok !== false && capacity.available !== false
    : true;
  if (!capacityAvailable) {
    // Explicitly a capacity wait, with a queue position — never a fake
    // session wait. When capacity frees, the admission tick resumes it.
    return { queued: await queueWithoutImmediateDelivery({
      rec, run, nowMs, root, size, reason: "waiting_for_provider_capacity",
    }) };
  }
  let start = null;
  try {
    const { startLaneAgentSession } = await import("./agent-session-lifecycle.mjs");
    start = await startLaneAgentSession({ laneId: rec.lane_id, nowMs, root, origin: "operator" });
  } catch (e) {
    start = { ok: false, error: e?.message || "provider_start_failed" };
  }
  if (start?.ok && !start?.queued) {
    // Provider is coming up. Queue the run so the admission/delivery path
    // hands it over the moment the pane is ready, and say so truthfully.
    return { queued: await queueWithoutImmediateDelivery({
      rec, run, nowMs, root, size, reason: "provider_provisioning",
    }) };
  }
  if (start?.queued || start?.waiting_for_execution_capacity || start?.error === "provider_capacity") {
    return { queued: await queueWithoutImmediateDelivery({
      rec, run, nowMs, root, size, reason: "waiting_for_provider_capacity",
    }) };
  }
  if (start?.error === "lane_has_active_session") {
    // A record says a session exists but it was not eligible above. The
    // reaper owns proving it dead; until then this is a transport wait.
    return { queued: await queueWithoutImmediateDelivery({
      rec, run, nowMs, root, size, reason: "waiting_for_executable_transport",
    }) };
  }
  // A real, named start failure. Surface it instead of resting forever.
  const { patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
  const reasonText = start?.error || "provider_start_failed";
  patchRunFields(run.run_id, {
    state_reason: "provider_start_failed",
    delivery: {
      acknowledged: false,
      provider: rec.binding?.provider || null,
      error: reasonText,
      at: new Date(nowMs).toISOString(),
    },
  }, { nowMs, root });
  return { queued: decorate({
    ok: true,
    schema_version: "vacilando.lane.send.v1",
    lane_id: rec.lane_id,
    status: "queued",
    error: null,
    provider_start_error: reasonText,
    instruction_size: size,
    delivered_at: null,
    admission_queued: false,
    session_required: true,
  }, getExecutionRun(run.run_id, root) || run) };
}

/**
 * Delivery refusals that are transient, not failures.
 *
 * Kept in step with execution-resume's RETRYABLE set: a lane whose send lock is
 * momentarily held will accept the same instruction a moment later.
 */
export const RETRYABLE_DELIVERY_REFUSALS = new Set(["send_in_progress"]);

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

async function ensureCursorDeliveryTransport({ rec, nowMs, root }) {
  try {
    const { getDevelopmentLane, cursorExecutableTransport, CURSOR_DELIVERY_UNAVAILABLE } = await import("./lanes.mjs");
    const found = await getDevelopmentLane(rec.lane_id, { includeGitFacts: false });
    if (cursorExecutableTransport(found?.lane).ok) return { ok: true };
    try {
      const { setLanePreferredProvider } = await import("./development-lane.mjs");
      setLanePreferredProvider(rec.lane_id, "cursor", { nowMs, root });
    } catch { /* send still owns the Cursor attempt */ }
    const { startLaneAgentSession } = await import("./agent-session-lifecycle.mjs");
    const start = await startLaneAgentSession({ laneId: rec.lane_id, nowMs, root, origin: "operator" });
    if (start?.queued || start?.waiting_for_execution_capacity || start?.error === "provider_capacity") {
      return { ok: false, queue: true };
    }
    // A pane that is still booting cursor-agent is a WAIT, not a refusal.
    // Failing the run here is what turned "Cursor is starting" into a terminal
    // `cursor_delivery_unavailable` the operator had to work around by hand.
    if (start?.retryable) {
      return { ok: false, queue: true };
    }
    if (!start?.ok) {
      return { ok: false, error: start?.error || CURSOR_DELIVERY_UNAVAILABLE };
    }
    const again = await getDevelopmentLane(rec.lane_id, { includeGitFacts: false });
    if (cursorExecutableTransport(again?.lane).ok) return { ok: true, started: true };
    return { ok: false, queue: true };
  } catch (e) {
    return { ok: false, error: e?.message || "cursor_delivery_unavailable" };
  }
}
async function failCursorDeliveryUnavailable({ rec, run, nowMs, root, size }) {
  const { transitionExecutionRun, patchRunFields, getExecutionRun } = await import("./execution-run.mjs");
  const { CURSOR_DELIVERY_UNAVAILABLE, CURSOR_DELIVERY_UNAVAILABLE_SUMMARY } = await import("./lanes.mjs");
  patchRunFields(run.run_id, {
    delivery: {
      acknowledged: false,
      provider: "cursor",
      error: CURSOR_DELIVERY_UNAVAILABLE,
      at: new Date(nowMs).toISOString(),
      instruction_fingerprint: instructionFingerprint(run.instruction),
    },
  }, { nowMs, root });
  const failed = transitionExecutionRun(run.run_id, "FAILED", {
    reason: CURSOR_DELIVERY_UNAVAILABLE,
    origin: "system",
    nowMs,
    root,
    completion_report: { summary: CURSOR_DELIVERY_UNAVAILABLE_SUMMARY },
  });
  // THE LANE STAYS ON THE PROVIDER THE OPERATOR CHOSE.
  //
  // This used to call setLanePreferredProvider(lane, "claude") here, silently
  // undoing the operator's explicit selection every time a Cursor delivery
  // failed. That is the loop behind the reported symptom: select Cursor, send,
  // the delivery loses the boot race, the runtime quietly puts the lane back on
  // Claude, and the next Send is a Claude send again. The audit log for
  // lane_db3431e755a8 records NINE consecutive `lane.set_provider cursor`
  // events — the operator re-selecting Cursor against a runtime that kept
  // un-selecting it.
  //
  // A failed delivery is reported, not answered by rewriting the choice that
  // produced it. Switching back to Claude remains one operator action away.
  const next = failed.ok ? failed.run : (getExecutionRun(run.run_id, root) || run);
  return decorate({
    ok: false,
    schema_version: "vacilando.lane.send.v1",
    lane_id: rec.lane_id,
    status: "failed",
    error: CURSOR_DELIVERY_UNAVAILABLE,
    instruction_size: size,
    delivered_at: null,
  }, next);
}

/**
 * Gateway / API entry. One active non-terminal run per lane.
 * NEEDS_INPUT: operator send continues the same run (decision reply).
 * Other non-terminal states: refuse current_run_active.
 */
/**
 * A run exists, but its images could not be prepared.
 *
 * The run must NOT proceed to EXECUTING and must NOT be delivered as text-only:
 * the operator wrote about a picture. FAILED with an explicit reason is the
 * closest valid existing state — no new ungoverned state is invented — and the
 * attachment records keep their own error for the operator to read.
 */
function failAttachmentPreparation({ run, laneId, nowMs, root, size, error }) {
  try {
    transitionExecutionRun(run.run_id, "FAILED", {
      reason: `attachment_preparation_failed:${error}`,
      origin: "system",
      nowMs,
      root,
    });
  } catch { /* the refusal below is what the operator sees either way */ }
  return refused(laneId, error, nowMs, size, activeRunForLane(laneId, root) || run);
}

export async function deliverManagedLaneInstruction(laneId, instruction, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const root = opts.root;
  const send = opts.sendLaneInstruction || sendLaneInstruction;
  const text = String(instruction ?? "");
  const size = text.length;

  // ---------------------------------------------------------------------
  // Attachments are validated BEFORE any run is created or continued.
  //
  // A prompt with images is one prompt: if an image cannot be delivered, the
  // operator must not end up with a run carrying text they wrote about a
  // picture the provider never saw. Failing here leaves the draft and the
  // attachment records untouched, so the operator can retry.
  // ---------------------------------------------------------------------
  const attachmentIds = Array.isArray(opts.attachmentIds)
    ? opts.attachmentIds.map(String).filter(Boolean)
    : [];
  let A = null;
  let promptKey = text;
  if (attachmentIds.length) {
    A = await import("./lane-attachments.mjs");
    if (attachmentIds.length > A.ATTACHMENT_MAX_PER_PROMPT) {
      return refused(laneId, "too_many_attachments", nowMs, size, null);
    }
    const preflight = A.validateAttachmentsForPrompt(attachmentIds, { laneId, root });
    if (!preflight.ok) return refused(laneId, preflight.error, nowMs, size, null);
    // Different images are a different prompt, so the duplicate window keys on
    // text PLUS the ordered attachment checksums.
    promptKey = A.promptFingerprint(text, preflight.attachments.map((a) => ({
      checksum_sha256: a.checksum_sha256,
    })));
  }

  if (opts.provider) {
    try {
      const { setLanePreferredProvider } = await import("./development-lane.mjs");
      setLanePreferredProvider(laneId, opts.provider, { nowMs, root });
    } catch { /* send still proceeds with the live binding */ }
  }

  let staleClosed = false;
  try {
    const rec = reconcileLaneBeforeSend(laneId, { root, nowMs });
    staleClosed = Boolean(rec.stale_run_closed);
  } catch { /* send still proceeds; active-run check below is authoritative */ }

  let active = activeRunForLane(laneId, root);
  // Never continue into a run whose instruction never reached the provider.
  // Continuing it retried the paste into the same blocked pane, and because
  // NEEDS_INPUT is protective the governor could not close it either — the lane
  // had no way forward at all.
  if (active && undeliveredPromptBlocked(active)) {
    if (supersedeUndeliveredPromptBlock(active, { root, nowMs })) {
      staleClosed = true;
      active = null;
    }
  }
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
  if (active) {
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

  // A reply to a suspended lane must bring the provider back before it can be
  // delivered. The reply is retained on the run either way, so it is never lost
  // and never delivered twice: the resume path hands it to the ordinary
  // NEEDS_INPUT continuation below, which is the only thing that pastes.
  if (active && active.state === "NEEDS_INPUT" && active.provider_suspension?.state === "SUSPENDED") {
    const resumed = await resumeSuspendedForReply({ laneId, run: active, text, nowMs, root, size });
    if (resumed) return resumed;
    active = activeRunForLane(laneId, root) || active;
  }

  if (isLaneSendInProgress(laneId)) {
    return refused(laneId, "send_in_progress", nowMs, size, active);
  }

  if (!active && wouldDuplicateLaneSend(laneId, promptKey, nowMs, opts.duplicateWindowMs)) {
    return send(laneId, text, opts);
  }

  if (active?.state === "NEEDS_INPUT") {
    let replyText = text;
    if (A) {
      const bound = A.bindAttachmentsToRun(attachmentIds, { laneId, runId: active.run_id, nowMs, root });
      if (!bound.ok) return refused(laneId, bound.error, nowMs, size, active);
      replyText = `${text}${A.providerAttachmentBlock(bound.attachments)}`;
    }
    const out = await send(laneId, replyText, {
      ...opts,
      nowMs,
      dedupeKey: promptKey,
      duplicateWindowMs: 0,
    });
    if (!(out.ok && out.status === "delivered")) {
      // Text did not land, so the images did not either. The attachments stay
      // BOUND and undelivered rather than being marked as if they arrived.
      return decorate(out, active);
    }
    if (A) A.markAttachmentsDelivered(active.run_id, { nowMs, root });
    try {
      await markDeliveryAcknowledged(active, out, {
        nowMs,
        root,
        provider: opts.provider || null,
        instruction: text,
      });
    } catch { /* ack fields must not block EXECUTING */ }
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
  // Bind BEFORE the eligibility branch below. A run that queues for a session
  // must already own its images, or the later delivery would paste the text
  // without them — the exact silent text-only send this must never do.
  if (A) {
    const bound = A.bindAttachmentsToRun(attachmentIds, { laneId, runId: run.run_id, nowMs, root });
    if (!bound.ok) {
      return failAttachmentPreparation({ run, laneId, nowMs, root, size, error: bound.error });
    }
  }
  try {
    const { getDurableLane } = await import("./development-lane.mjs");
    const { normalizeExecutionProvider } = await import("./execution-providers.mjs");
    const rec = getDurableLane(laneId, root);
    if (rec) {
      const selected = normalizeExecutionProvider(
        opts.provider || rec.preferred_provider || rec.binding?.provider,
        rec.binding?.provider || "claude",
      );
      if (selected === "cursor") {
        const ensured = await ensureCursorDeliveryTransport({ rec, nowMs, root });
        if (ensured.queue) {
          return queueWithoutImmediateDelivery({
            rec, run, nowMs, root, size, reason: "waiting_for_agent_session",
          });
        }
        if (!ensured.ok) {
          return failCursorDeliveryUnavailable({ rec, run, nowMs, root, size });
        }
      }
      const eligible = await laneHasEligibleSession(rec.lane_id);
      if (!eligible) {
        const provisioned = await provisionSessionForSend({ rec, run, nowMs, root, size });
        return provisioned.queued;
      }
    }
  } catch { /* fall through to live send */ }
  const providerText = A
    ? `${text}${A.providerAttachmentBlock(A.listRunAttachments(run.run_id, { root, includePath: true }))}`
    : text;
  const out = await send(laneId, executionEnvelope(run.run_id, providerText, { laneId }), {
    ...opts,
    nowMs,
    dedupeKey: promptKey,
    // Operator Send means start this instruction now. A pane that is mid-turn
    // (not on a modal) is interrupted once, then re-read. Admission retries
    // do not set this, so a queued prompt still waits for a natural prompt.
    interruptIfBusy: opts.interruptIfBusy !== false,
  });

  if (out.ok && out.status === "delivered") {
    if (A) A.markAttachmentsDelivered(run.run_id, { nowMs, root });
    try {
      run = await markDeliveryAcknowledged(run, out, {
        nowMs,
        root,
        provider: opts.provider || null,
        instruction: text,
      });
    } catch { /* ack fields must not block EXECUTING */ }
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

  if (out.error === "provider_prompt_not_ready") {
    return refuseUndeliveredPromptBlock({ run, out, nowMs, root, size, laneId });
  }

  try {
    const { getDurableLane } = await import("./development-lane.mjs");
    const rec = getDurableLane(laneId, root);
    const offlineMiss = rec && (out.error === "pane_unavailable" || out.error === "target_mismatch")
      && !(await laneHasEligibleSession(rec.lane_id));
    if (offlineMiss) {
      const { normalizeExecutionProvider } = await import("./execution-providers.mjs");
      const selected = normalizeExecutionProvider(
        opts.provider || rec.preferred_provider || rec.binding?.provider,
        rec.binding?.provider || "claude",
      );
      if (selected === "cursor") {
        const ensured = await ensureCursorDeliveryTransport({ rec, nowMs, root });
        if (ensured.queue) {
          return queueWithoutImmediateDelivery({
            rec, run, nowMs, root, size, reason: "waiting_for_agent_session",
          });
        }
        if (!ensured.ok) {
          return failCursorDeliveryUnavailable({ rec, run, nowMs, root, size });
        }
      }
      const provisioned = await provisionSessionForSend({ rec, run, nowMs, root, size });
      return provisioned.queued;
    }
  } catch { /* retain FAILED for true delivery failure */ }

  // A RETRYABLE refusal is not a delivery failure.
  //
  // `send_in_progress` means another send for this lane is momentarily in
  // flight. execution-resume already lists it as RETRYABLE, yet this path failed
  // the run on it — producing runs that were FAILED with reason
  // "send_in_progress" while `delivery.acknowledged` was true, i.e. the
  // instruction HAD reached the provider. Three S5 instructions were recorded
  // that way. A transient condition now becomes a bounded wait, which is exactly
  // what the S6 waiting contract is for.
  if (RETRYABLE_DELIVERY_REFUSALS.has(out.error)) {
    return queueWithoutImmediateDelivery({ rec, run, nowMs, root, size, reason: out.error });
  }

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
  if (run.delivery && typeof run.delivery === "object") {
    if (run.delivery.acknowledged === true) {
      return { ok: true, already_delivered: true, run };
    }
  } else if (run.state === "EXECUTING" || run.started_at) {
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
  // A queued run keeps its images. Admission delivers the SAME prompt the
  // operator wrote, references included — a run that waited for a session must
  // not arrive as text about pictures the provider was never given.
  let queuedText = run.instruction;
  let queuedAttachments = null;
  try {
    const A = await import("./lane-attachments.mjs");
    const bound = A.listRunAttachments(run.run_id, { root, includePath: true });
    if (bound.length) {
      queuedAttachments = A;
      queuedText = `${run.instruction}${A.providerAttachmentBlock(bound)}`;
    }
  } catch { /* text-only delivery is correct when there are no attachments */ }
  const out = await send(run.lane_id, executionEnvelope(run.run_id, queuedText, { laneId: run.lane_id }), {
    ...opts,
    nowMs,
    dedupeKey: `admission:${run.run_id}`,
    interruptIfBusy: false,
  });
  if (out.ok && out.status === "delivered") {
    if (queuedAttachments) queuedAttachments.markAttachmentsDelivered(run.run_id, { nowMs, root });
    let next = run;
    try {
      next = await markDeliveryAcknowledged(run, out, {
        nowMs,
        root,
        provider: opts.provider || null,
        instruction: run.instruction,
      });
    } catch { /* ack fields must not block EXECUTING */ }
    const exec = transitionExecutionRun(run.run_id, "EXECUTING", {
      reason: "admission_delivered",
      origin: "governor",
      nowMs,
      root,
      worktreePath: out.worktree_path || opts.worktreePath || null,
    });
    return decorate(out, exec.ok ? exec.run : next);
  }
  if (out.error === "provider_prompt_not_ready") {
    const refused = await refuseUndeliveredPromptBlock({
      run, out, nowMs, root, size: String(run.instruction || "").length, laneId: run.lane_id,
    });
    return {
      ok: false,
      deferred: refused.status === "queued",
      error: out.error,
      delivery: out,
      run: refused.execution_run || run,
      needs_terminal_operator: refused.needs_terminal_operator === true,
    };
  }
  return { ok: false, deferred: true, error: out.error || "delivery_failed", delivery: out, run };
}
