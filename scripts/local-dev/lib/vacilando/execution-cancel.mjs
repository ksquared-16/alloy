/**
 * Cancel a prompt the operator has already sent.
 *
 * WHY THIS EXISTS. Once an instruction is delivered there was no way to take it
 * back. `closeStaleExecutionRun` refuses a run that is genuinely active — which
 * is correct for cleaning up stale work and useless for the case that actually
 * happens: you send the wrong thing and want it stopped now. The lane then sits
 * EXECUTING on a prompt nobody wants, and the one-active-run rule blocks the
 * replacement.
 *
 * WHAT CANCEL IS NOT. It is not "the run failed" and it is not "the run
 * completed". Nothing broke and nothing finished — the operator changed their
 * mind. Vacilando's state machine has no CANCELLED, and inventing one would put
 * an ungoverned state into a machine every other owner reasons about, so the
 * run lands on FAILED with an explicit `operator_cancelled` reason and a
 * completion report that says so in words. The state is the closest valid one;
 * the reason carries the truth.
 *
 * WHAT SURVIVES. Everything durable: the lane, its branch, its worktree, its
 * conversation, every structured report already submitted, and the provider
 * session itself. Cancelling a prompt must never cost the operator their work
 * or their agent — it ends one instruction, not the lane.
 */
import { getDurableLane } from "./development-lane.mjs";
import {
  activeRunForLane,
  getExecutionRun,
  isTerminalRunState,
  transitionExecutionRun,
} from "./execution-run.mjs";

export const CANCEL_REASON = "operator_cancelled";

/** Keys that tell a provider to abandon the turn it is working on. */
export function interruptKeysArgv(target) {
  // Escape is Claude Code's cancel-current-turn. Sent twice: the first closes
  // any transient overlay, the second cancels the turn underneath it.
  return ["send-keys", "-t", target, "Escape", "Escape"];
}

/**
 * Can this run be cancelled right now, and should the operator be warned?
 *
 * A run that has not reached the provider is a clean take-back. A run the
 * provider is actively working is still cancellable — that is the whole point —
 * but the operator is told that work in progress will be interrupted.
 */
export function cancellability(run) {
  if (!run) return { ok: false, error: "run_not_found" };
  if (isTerminalRunState(run.state)) {
    return { ok: false, error: "run_already_terminal", state: run.state };
  }
  const delivered = run.delivery?.acknowledged === true || Boolean(run.started_at);
  return {
    ok: true,
    state: run.state,
    delivered,
    // Undelivered means the provider never saw it: nothing to interrupt.
    interrupts_work: delivered && run.state === "EXECUTING",
    warning: delivered && run.state === "EXECUTING"
      ? "The agent is working on this prompt. Cancelling interrupts that work; the lane, branch, worktree and conversation are all kept."
      : null,
  };
}

/**
 * Cancel the lane's active run.
 *
 * `confirm` is required whenever the provider is actually working, so a
 * mis-tap cannot discard a turn in progress. An undelivered prompt needs no
 * confirmation — taking back something the agent never saw costs nothing.
 */
export async function cancelActiveRun(laneId, {
  runId = null,
  confirm = false,
  origin = "operator",
  reason = null,
  nowMs = Date.now(),
  root = undefined,
  tmux = null,
} = {}) {
  const rec = getDurableLane(laneId, root);
  if (!rec) return { ok: false, error: "lane_not_found" };

  const run = runId ? getExecutionRun(runId, root) : activeRunForLane(rec.lane_id, root);
  if (!run) return { ok: false, error: "no_active_run" };
  if (runId && run.lane_id !== rec.lane_id) {
    // Never let a run id from one lane cancel work in another.
    return { ok: false, error: "run_lane_mismatch" };
  }

  const can = cancellability(run);
  if (!can.ok) return can;
  if (can.interrupts_work && !confirm) {
    return { ...can, ok: false, error: "confirm_required" };
  }

  // Interrupt the provider BEFORE the transition, so it stops working on a
  // prompt we are about to mark cancelled. Best-effort: a failure here must not
  // leave the run stuck EXECUTING, because then the operator could neither use
  // the lane nor cancel it again.
  let interrupted = false;
  let interrupt_error = null;
  const target = rec.binding?.tmux_pane || rec.binding?.tmux_session || null;
  if (can.delivered && target) {
    try {
      const send = tmux || (await import("./lanes.mjs")).interruptPane;
      const out = await send(target);
      interrupted = Boolean(out?.ok);
      if (!interrupted) interrupt_error = out?.error || "interrupt_failed";
    } catch (err) {
      interrupt_error = String(err?.message || err).slice(0, 200);
    }
  }

  const summary = reason
    ? `Cancelled by the operator: ${String(reason).slice(0, 200)}`
    : "Cancelled by the operator before it finished.";
  const moved = transitionExecutionRun(run.run_id, "FAILED", {
    reason: CANCEL_REASON,
    origin,
    nowMs,
    root,
    completion_report: { summary },
  });
  if (!moved.ok) return { ok: false, error: moved.error || "cancel_transition_failed" };

  return {
    ok: true,
    run_id: run.run_id,
    lane_id: rec.lane_id,
    previous_state: can.state,
    state: moved.run?.state || "FAILED",
    reason: CANCEL_REASON,
    interrupted,
    interrupt_error,
    // Say plainly what was NOT destroyed, so "cancel" is never read as "discard
    // my work".
    preserved: ["lane", "branch", "worktree", "conversation", "structured reports", "provider session"],
  };
}
