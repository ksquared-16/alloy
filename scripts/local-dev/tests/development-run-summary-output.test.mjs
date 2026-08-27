#!/usr/bin/env node
/**
 * A finished turn's summary must reach the operator.
 *
 * THE RULE. Every managed lane closes its turn with
 * `vac run-status <run> complete --summary "<last output>"`. That text is the
 * agent's account of the work and the operator has to be able to read it.
 *
 * THE FAILURE THIS LOCKS OUT. The summary was written only to
 * `completion_report.summary` — a bounded label for rows — while the lane
 * conversation reads `agent_report.message`. And when Operator Send had already
 * closed the turn as `operator_follow_up`, the run was COMPLETE before the
 * summary arrived, so `transitionExecutionRun` took its same-state branch,
 * dropped `completion_report`, and returned `{ ok: true, noop: true }`. The CLI
 * printed `… COMPLETE` and exited 0 with the entire summary discarded.
 *
 * So both halves are tested: the summary is FILED where the lane reads, and the
 * lane PRESENTS it over the status line it used to show instead.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-summary-output-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  createQueuedRun,
  transitionExecutionRun,
  getExecutionRun,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { submitAgentReport } = await import("../lib/vacilando/execution-run-report.mjs");
const { fileTerminalSummaryOutput, presentedReportType } =
  await import("../lib/vacilando/run-summary-output.mjs");
const { completeRunForOperatorFollowUp } = await import("../lib/vacilando/execution-stale.mjs");
const { createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { assistantMessageSource, statusSummaryMessage } =
  await import("../apps/vacilando/public/gateway-view.mjs");

const SUMMARY = [
  "Governed approval built, tested, committed.",
  "",
  "The dead end is gone: a lane with no Mission but a repository that carries",
  "governed promotion now reaches an approvable proposal.",
].join("\n");

let pass = 0;
let fail = 0;

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetDevelopmentLanesForTests(ROOT);
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/**
 * A delivered, executing run — the only shape a completion may close.
 *
 * The run is bound to ROOT as its worktree because an agent-origin report must
 * come from inside the worktree the run belongs to. Knowing a run id is not
 * authority, which is why every filing call below passes `cwd`.
 */
function executingRun() {
  const made = createDurableLane({ name: "vacilando gateway", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const queued = createQueuedRun({
    laneId,
    instruction: "Do the work",
    worktreePath: ROOT,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system", root: ROOT, reason: "delivered", worktreePath: ROOT,
  });
  assert.equal(moved.ok, true, moved.error);
  return { laneId, runId: queued.run.run_id };
}

function laneShowing(runId) {
  return { execution_run: getExecutionRun(runId, ROOT) };
}

// --------------------------------------------------------------- filing

await test("a completion summary is filed where the lane reads from", () => {
  const { laneId, runId } = executingRun();
  transitionExecutionRun(runId, "COMPLETE", { origin: "agent", root: ROOT, reason: "done" });
  const out = fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });
  assert.equal(out.presented, true, out.reason);
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.agent_report.type, "completion");
  // Unbounded: the whole account survives, not a truncated first line.
  assert.equal(run.agent_report.message, SUMMARY);
  // And the row label is kept in step with what is presented.
  assert.match(run.completion_report.summary, /Governed approval built/);
  assert.equal(run.completion_report.report_id, run.agent_report.report_id);
});

await test("a summary filed after Operator Send still reaches the operator", () => {
  // THE REGRESSION. Operator Send closes the turn first; the agent's summary
  // arrives afterwards, against a run that is already COMPLETE.
  const { laneId, runId } = executingRun();
  const closed = completeRunForOperatorFollowUp(getExecutionRun(runId, ROOT), { root: ROOT });
  assert.equal(closed.ok, true, closed.error);
  const before = getExecutionRun(runId, ROOT);
  assert.equal(before.state, "COMPLETE");
  assert.match(before.completion_report.summary, /Operator sent a new instruction/);
  assert.equal(before.agent_report, null, "the placeholder close files no agent report");

  const out = fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });
  assert.equal(out.presented, true, out.reason);
  const after = getExecutionRun(runId, ROOT);
  assert.equal(after.agent_report.message, SUMMARY);
  // The placeholder no longer stands in for the work.
  assert.doesNotMatch(after.completion_report.summary, /Operator sent a new instruction/);
});

await test("a failure summary is presented too", () => {
  const { laneId, runId } = executingRun();
  transitionExecutionRun(runId, "FAILED", { origin: "agent", root: ROOT, reason: "blocked" });
  const out = fileTerminalSummaryOutput(runId, "FAILED", { summary: "Could not proceed: X.", laneId, cwd: ROOT, root: ROOT });
  assert.equal(out.presented, true, out.reason);
  assert.equal(getExecutionRun(runId, ROOT).agent_report.type, "failure");
});

await test("NEEDS_INPUT is deliberately left alone", () => {
  // POSITIVE CONTROL for the two above. A `needs_input` report is an operator
  // gate that refuses Send while it is open; a status summary must never become
  // one. If this ever starts returning presented:true, lanes will strand.
  assert.equal(presentedReportType("NEEDS_INPUT"), null);
  const { runId } = executingRun();
  transitionExecutionRun(runId, "NEEDS_INPUT", { origin: "agent", root: ROOT, reason: "question" });
  const out = fileTerminalSummaryOutput(runId, "NEEDS_INPUT", { summary: "waiting", root: ROOT });
  assert.equal(out.presented, false);
  assert.equal(out.reason, "state_not_presented");
  assert.equal(getExecutionRun(runId, ROOT).agent_report, null);
});

await test("an agent's own report is never overwritten by a status summary", () => {
  const { laneId, runId } = executingRun();
  const filed = submitAgentReport(runId, {
    type: "completion",
    message: "The structured account of this turn.",
    laneId,
    cwd: ROOT,
    root: ROOT,
  });
  assert.equal(filed.ok, true, filed.error);
  const out = fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });
  assert.equal(out.presented, true);
  assert.equal(out.reason, "already_reported");
  assert.equal(getExecutionRun(runId, ROOT).agent_report.message, "The structured account of this turn.");
});

await test("nothing is claimed when there is nothing to file", () => {
  const { laneId, runId } = executingRun();
  transitionExecutionRun(runId, "COMPLETE", { origin: "agent", root: ROOT, reason: "done" });
  assert.equal(fileTerminalSummaryOutput(runId, "COMPLETE", { summary: "   ", root: ROOT }).reason, "no_summary");
  assert.equal(fileTerminalSummaryOutput("erun_missing", "COMPLETE", { summary: SUMMARY, root: ROOT }).reason, "run_not_found");
});

// ----------------------------------------------------------- presentation

await test("the lane presents the summary, not the status line", () => {
  const { laneId, runId } = executingRun();
  completeRunForOperatorFollowUp(getExecutionRun(runId, ROOT), { root: ROOT });

  // BEFORE: the only thing to show is the placeholder that closed the run.
  const before = assistantMessageSource(laneShowing(runId));
  assert.equal(before.kind, "status");
  assert.match(before.text, /Operator sent a new instruction/);

  fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });

  // AFTER: the agent's account owns the bubble.
  const after = assistantMessageSource(laneShowing(runId));
  assert.equal(after.kind, "report");
  assert.equal(after.text, SUMMARY);
  assert.equal(after.report.type, "completion");
});

await test("the status line is still there when no summary was filed", () => {
  // POSITIVE CONTROL for the presentation test: the "before" state above must
  // be a real fallback and not an artefact of an empty run.
  const { runId } = executingRun();
  transitionExecutionRun(runId, "COMPLETE", {
    origin: "agent", root: ROOT, reason: "done",
    completion_report: { summary: "Closed without an account." },
  });
  assert.match(statusSummaryMessage(getExecutionRun(runId, ROOT)), /Closed without an account/);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
