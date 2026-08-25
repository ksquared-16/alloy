/**
 * The summary an agent files when its work is done must actually be PRESENTED.
 *
 * WHAT WAS WRONG. Every managed lane is instructed to close its turn with
 * `vac run-status <run> complete --summary "<last output>"`. That command wrote
 * the text into `completion_report.summary` — a bounded one-liner used for rows
 * and lists — and nowhere else. The message the lane conversation actually
 * shows is `agent_report.message`, which only `submitAgentReport` writes. So the
 * mandated command could not satisfy the rule it was mandated for: the operator
 * saw a status line, or nothing, and never the agent's own account of the work.
 *
 * WORSE, AND THE REASON THIS WAS NOTICED. Operator Send closes the previous turn
 * as `operator_follow_up` with the placeholder "Operator sent a new instruction.
 * Previous turn closed." When the agent then filed its real summary, the run was
 * already COMPLETE, so `transitionExecutionRun` took its same-state branch —
 * which records liveness and DROPS `completion_report` entirely — and returned
 * `{ ok: true, noop: true }`. The CLI printed `… COMPLETE` and exited 0. A full
 * turn's summary was discarded while every signal said it had been filed.
 *
 * WHAT THIS DOES. Files the summary through `submitAgentReport`, the existing
 * owner of the operator-facing message. No parallel report system, no new
 * surface: it is the same record the lane already renders, so a summary filed
 * this way appears exactly where a structured report would.
 *
 * WHAT IT DELIBERATELY DOES NOT DO.
 *  - It never touches NEEDS_INPUT. A `needs_input` report with `blocking` unset
 *    is a real operator gate, and `canOperatorSupersedeRun` refuses Send while
 *    one is open. Turning a status line into that would strand lanes.
 *  - It never overwrites an agent report that already exists. If the agent
 *    filed a structured report, that report is the account of the turn.
 *  - It never claims success it did not get. When the message cannot be filed,
 *    the caller is told so it can say so, because "silently succeeded" is the
 *    defect this exists to remove.
 */
import { findExecutionRun, getExecutionRun, patchRunFields } from "./execution-run.mjs";
import { submitAgentReport } from "./execution-run-report.mjs";

/** Terminal states whose summary is the operator-facing account of the turn. */
const PRESENTED_STATES = Object.freeze({
  COMPLETE: "completion",
  FAILED: "failure",
});

export function presentedReportType(state) {
  return PRESENTED_STATES[String(state || "").toUpperCase()] || null;
}

function firstLine(text) {
  return String(text || "").split("\n").find((l) => l.trim()) || String(text || "").trim();
}

/**
 * File a terminal summary so the lane presents it.
 *
 * Returns `{ presented, reason }` always — never throws — so a reporting path
 * can report honestly whether the operator will see this text.
 */
export function fileTerminalSummaryOutput(runId, state, {
  summary = null,
  laneId = null,
  cwd = null,
  origin = "agent",
  nowMs = Date.now(),
  root = null,
} = {}) {
  const type = presentedReportType(state);
  if (!type) return { presented: false, reason: "state_not_presented" };

  const body = String(summary ?? "").trim();
  if (!body) return { presented: false, reason: "no_summary" };

  // Resolve the store ONCE. `root = null` is not `undefined`, so it does not
  // trigger a default parameter — passing it straight through reads every store
  // as missing and the summary silently goes nowhere.
  const found = root ? { run: getExecutionRun(runId, root), root } : findExecutionRun(runId);
  if (!found?.run) return { presented: false, reason: "run_not_found" };
  const storeRoot = found.root;
  const existing = found.run.agent_report || null;
  if (existing?.message && existing.type === type) {
    // The agent already gave its account of this turn. A trailing status
    // summary must not overwrite it.
    return { presented: true, reason: "already_reported", report_id: existing.report_id || null };
  }

  const filed = submitAgentReport(runId, {
    type,
    message: body,
    laneId,
    cwd,
    origin,
    nowMs,
    root: storeRoot,
  });
  if (!filed.ok) {
    return { presented: false, reason: filed.error || "report_failed", detail: filed.message_bytes || null };
  }

  // Keep the bounded row label in step with what is presented. Without this the
  // list still shows whatever closed the run — which is exactly how a real
  // summary ended up hidden behind "Operator sent a new instruction."
  const reportId = filed.report?.report_id || null;
  try {
    patchRunFields(runId, {
      completion_report: { summary: firstLine(body), report_id: reportId },
    }, { nowMs, root: storeRoot });
  } catch {
    // The presented message is already durable; the label is cosmetic.
  }

  return {
    presented: true,
    reason: filed.duplicate ? "duplicate" : "filed",
    report_id: reportId,
    bytes: filed.report?.message_bytes ?? Buffer.byteLength(body, "utf8"),
  };
}
