/**
 * NEEDS_INPUT integrity — the state and the input object are one fact.
 *
 * THE DEFECT THIS FIXES: NEEDS_INPUT was reachable from prose. A governed
 * action that FAILED, or a resource continuation that could not be delivered,
 * transitioned the run to NEEDS_INPUT carrying the failure TEXT as its reason —
 * `identity_not_registered`, `Operator approved, but the trusted host still
 * refused (grant_pull_request_mismatch).` Those are outcomes, not questions.
 * The request was already terminal, so no approval control could render, and
 * the lane sat in "Needs input" with nothing on the screen to act on. Worse,
 * NEEDS_INPUT is protective: the governor will not close it, so the run could
 * not even age out.
 *
 * NEEDS_INPUT is now only ever true alongside a concrete, unresolved,
 * operator-actionable record. Everything else is a failure to surface.
 */
import {
  activeRunForLane,
  getExecutionRun,
  isTerminalRunState,
  transitionExecutionRun,
} from "./execution-run.mjs";
import { listDurableLanes } from "./development-lane.mjs";
import { pendingGovernedActionForRun } from "./governed-action-request.mjs";

/** Governed statuses that still present an operator control. */
const OPERATOR_ACTIONABLE_GOVERNED = new Set([
  "awaiting_operator",
  "awaiting_operator_approval",
  "pending_operator",
]);

/**
 * The one unresolved thing the operator can act on for this run, or null.
 *
 * Only modeled records count. Provider prose never does.
 */
export function actionableOperatorInputForRun(run, { root } = {}) {
  if (!run) return null;

  // 1. A governed action still waiting on a human decision. A FAILED or
  //    complete request is terminal and presents no control.
  try {
    const rec = pendingGovernedActionForRun(run.run_id, root);
    if (rec && OPERATOR_ACTIONABLE_GOVERNED.has(String(rec.status || ""))) {
      return { kind: "governed_approval", id: rec.request_id, action_key: rec.action_key };
    }
  } catch { /* fall through */ }

  // 2. A worker that actually ASKED: a modeled needs_input agent report is a
  //    real question with a reason (and often choices) the lane renders, plus
  //    a reply control. This is the legitimate, common case and must survive.
  const latest = run.agent_report
    || (Array.isArray(run.agent_reports) ? run.agent_reports[run.agent_reports.length - 1] : null);
  if (latest && String(latest.type) === "needs_input") {
    return {
      kind: "agent_question",
      id: latest.report_id || null,
      choices: Array.isArray(latest.choices) ? latest.choices.length : 0,
    };
  }

  // 3. A modeled question/choice carried on the run itself.
  const q = run.question || run.pending_question || null;
  if (q && !q.answered_at && (q.question_id || q.text || q.prompt)) {
    return { kind: "question", id: q.question_id || null };
  }

  // 4. A provider suspension the operator resumes by replying.
  if (run.provider_suspension?.state === "SUSPENDED") {
    return { kind: "provider_suspension", id: run.run_id };
  }

  // 5. An undelivered provider prompt block: the pane is on a modal only a
  //    human can clear, and the lane renders that as an actionable callout.
  if (run.delivery && run.delivery.needs_terminal_operator === true) {
    return { kind: "provider_prompt_block", id: run.run_id };
  }
  return null;
}

/**
 * Enforce the invariant across every lane.
 *
 * A NEEDS_INPUT run with no actionable input is reconciled OUT of the
 * impossible state: to FAILED, naming the real condition, so the operator sees
 * an actionable failure instead of a control that does not exist.
 */
export function reconcileNeedsInputWithoutInput({ root, nowMs = Date.now() } = {}) {
  const reconciled = [];
  let lanes = [];
  try { lanes = listDurableLanes(root) || []; } catch { lanes = []; }
  for (const lane of lanes) {
    let run = null;
    try { run = activeRunForLane(lane.lane_id, root); } catch { run = null; }
    if (!run || run.state !== "NEEDS_INPUT") continue;
    if (isTerminalRunState(run.state)) continue;
    const input = actionableOperatorInputForRun(run, { root });
    if (input) continue;
    const why = run.state_reason || "needs_input_without_operator_input";
    const out = transitionExecutionRun(run.run_id, "FAILED", {
      reason: why,
      origin: "governor",
      nowMs,
      root,
      completion_report: {
        summary: `Run required operator input but no actionable operator input existed. Last condition: ${why}`,
        at: new Date(nowMs).toISOString(),
      },
    });
    if (out?.ok) {
      reconciled.push({ lane_id: lane.lane_id, run_id: run.run_id, was_reason: why });
    }
  }
  return { ok: true, reconciled };
}

/** Read-only assertion used by the API/UI: is this NEEDS_INPUT legitimate? */
export function needsInputIsActionable(run, { root } = {}) {
  if (!run || run.state !== "NEEDS_INPUT") return true;
  return Boolean(actionableOperatorInputForRun(run, { root }));
}
