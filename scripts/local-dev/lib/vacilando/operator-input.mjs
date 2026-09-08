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
 * impossible state — an operator staring at a question with no control to
 * answer it is worse than any other outcome.
 *
 * IT IS NOT REPORTED AS A FAILURE. This transitioned to FAILED and reused
 * `run.state_reason` — the run's own NEEDS_INPUT reason — as the failure
 * reason, so a mission that was merely waiting was reported as having failed,
 * quoting the question it was waiting on. Measured as QUEUED -> EXECUTING ->
 * NEEDS_INPUT -> FAILED.
 *
 * ABANDONED is the state the platform already has for "this run is not going to
 * continue, and it is recoverable". It is terminal for scheduling, so the lane
 * is freed exactly as before; it is not a claim that the work failed.
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
    const out = transitionExecutionRun(run.run_id, "ABANDONED", {
      reason: "needs_input_without_operator_input",
      origin: "governor",
      nowMs,
      root,
      completion_report: {
        summary: `Run was waiting on operator input that no control could supply, so it was collected rather than left stranded. Last condition: ${why}`,
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
/**
 * A queued run whose lane has been closed will never start.
 *
 * THE DEFECT: closing a lane frees the lane, but a run already QUEUED against
 * it keeps its record. Four such runs sat QUEUED for over fifteen hours on
 * lanes closed within two minutes of the runs being created. Nothing was going
 * to admit them — the lane they were queued for no longer exists — so they were
 * not "waiting", they were stranded, and they counted against every queue and
 * capacity reading that looked at non-terminal runs.
 *
 * ABANDONED is the right state and it is the same one the sibling reconciler
 * uses: terminal for scheduling, explicitly recoverable, and not a claim that
 * the work failed. What is asserted here is only that the run cannot proceed,
 * which is a fact about the lane rather than a judgement about the work.
 *
 * Deliberately narrow. It touches ONLY runs that are still queued AND whose
 * lane is closed. A queued run on a live lane is genuinely waiting and is left
 * alone, because "has been queued a long time" is not evidence of anything.
 */
export function reconcileQueuedRunsOnClosedLanes({
  root,
  nowMs = Date.now(),
  listLanes = listDurableLanes,
  listRuns = null,
} = {}) {
  const reconciled = [];
  let lanes = [];
  try { lanes = listLanes(root) || []; } catch { lanes = []; }

  const closed = new Set(
    lanes.filter((l) => String(l?.status || "").toUpperCase() === "CLOSED")
      .map((l) => l.lane_id || l.id).filter(Boolean),
  );
  if (!closed.size) return { ok: true, reconciled };

  let runs = [];
  try {
    runs = listRuns ? listRuns(root) || [] : queuedRunsForLanes(closed, root);
  } catch { runs = []; }

  for (const run of runs) {
    if (!run || run.state !== "QUEUED") continue;
    if (!closed.has(run.lane_id)) continue;
    const out = transitionExecutionRun(run.run_id, "ABANDONED", {
      reason: "queued_on_closed_lane",
      origin: "governor",
      nowMs,
      root,
      completion_report: {
        summary: "The lane this run was queued against was closed, so nothing would ever admit it. "
          + "Collected rather than left counting against queue and capacity readings.",
        at: new Date(nowMs).toISOString(),
      },
    });
    if (out?.ok) reconciled.push({ lane_id: run.lane_id, run_id: run.run_id, was_state: "QUEUED" });
  }
  return { ok: true, reconciled };
}

/** Queued runs belonging to the given lanes, read from the run store. */
function queuedRunsForLanes(laneIds, root) {
  const out = [];
  for (const laneId of laneIds) {
    let run = null;
    try { run = activeRunForLane(laneId, root); } catch { run = null; }
    if (run && run.state === "QUEUED") out.push(run);
  }
  return out;
}

export function needsInputIsActionable(run, { root } = {}) {
  if (!run || run.state !== "NEEDS_INPUT") return true;
  return Boolean(actionableOperatorInputForRun(run, { root }));
}
