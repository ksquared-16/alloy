#!/usr/bin/env node
/**
 * THE LAST OPERATOR-VISIBLE ITEM FOR A RUN IS ITS COMPLETION SUMMARY.
 *
 * THE FAILURE THIS LOCKS OUT. `vac run-status <run> complete --summary "…"`
 * transitions the run to its terminal state FIRST and files the summary
 * SECOND, so the canonical summary always arrives at an already-terminal run.
 * The post-terminal guard in submitAgentReport refused any report whose type
 * differed from the one already stored — which meant that any turn that had
 * filed a mid-turn `progress` report had its real completion summary REFUSED
 * with `run_already_terminal`. The stale progress line stood as the run's final
 * message, `vac run-status` exited 5, and the detailed summary only ever
 * reached the operator if something re-filed it later: the reported
 * "summary arrived late, after other output".
 *
 * The rule the guard exists for is unchanged and is tested here too: nothing
 * non-terminal may be appended beneath a finalized summary.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-summary-last-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  createQueuedRun,
  transitionExecutionRun,
  getExecutionRun,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { submitAgentReport } = await import("../lib/vacilando/execution-run-report.mjs");
const { fileTerminalSummaryOutput } = await import("../lib/vacilando/run-summary-output.mjs");
const { createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { assistantMessageSource, finalizedRunReport } =
  await import("../apps/vacilando/public/gateway-view.mjs");

const SUMMARY = [
  "Cursor transport fixed and certified.",
  "",
  "Outcome: PASS. Validation: 5 new readiness tests, full cursor suite green.",
  "Commits: 1. Remaining operator action: none.",
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

/** A run that has done ordinary work: it reported progress partway through. */
function runThatReportedProgress() {
  const lane = createDurableLane({ name: "Summary Last", root: ROOT });
  const laneId = lane.lane?.lane_id || lane.lane_id;
  const created = createQueuedRun({
    laneId,
    instruction: "do the work",
    root: ROOT,
    worktreePath: ROOT,
  });
  const runId = created.run.run_id;
  transitionExecutionRun(runId, "EXECUTING", { root: ROOT, origin: "agent" });
  const progress = submitAgentReport(runId, {
    type: "progress",
    message: "halfway through the work",
    laneId,
    cwd: ROOT,
    root: ROOT,
    origin: "agent",
  });
  assert.equal(progress.ok, true, "a mid-turn progress report is ordinary");
  return { laneId, runId };
}

await test("a completion summary lands even though the turn already reported progress", async () => {
  const { laneId, runId } = runThatReportedProgress();
  // Exactly what vac-run-status does: transition, THEN file the summary.
  transitionExecutionRun(runId, "COMPLETE", { root: ROOT, origin: "agent", summary: "done" });
  const out = fileTerminalSummaryOutput(runId, "COMPLETE", {
    summary: SUMMARY,
    laneId,
    cwd: ROOT,
    root: ROOT,
  });
  assert.equal(out.presented, true, `summary was not presented: ${out.reason}`);
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.agent_report.type, "completion");
  assert.equal(run.agent_report.message, SUMMARY, "the operator reads the full summary, not a stale progress line");
  assert.equal(run.agent_report.finalized, true, "the canonical summary is marked final");
});

await test("a failed run still produces its final report", async () => {
  const { laneId, runId } = runThatReportedProgress();
  transitionExecutionRun(runId, "FAILED", { root: ROOT, origin: "agent", reason: "blocked" });
  const out = fileTerminalSummaryOutput(runId, "FAILED", {
    summary: "BLOCKED — the shared stack was unavailable. No commits.",
    laneId,
    cwd: ROOT,
    root: ROOT,
  });
  assert.equal(out.presented, true, `failure summary was not presented: ${out.reason}`);
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.agent_report.type, "failure");
  assert.equal(run.agent_report.finalized, true);
});

await test("delayed provider output cannot append beneath the finalized summary", async () => {
  const { laneId, runId } = runThatReportedProgress();
  transitionExecutionRun(runId, "COMPLETE", { root: ROOT, origin: "agent", summary: "done" });
  fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });

  // The late worker report / straggling provider chatter this rule exists for.
  const late = submitAgentReport(runId, {
    type: "progress",
    message: "…still tidying up",
    laneId,
    cwd: ROOT,
    root: ROOT,
    origin: "agent",
  });
  assert.equal(late.ok, false, "a progress report must not land under a finalized summary");
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.agent_report.message, SUMMARY, "the summary is still the last item");
});

await test("the summary is not emitted before the run is terminal", async () => {
  const { laneId, runId } = runThatReportedProgress();
  const early = fileTerminalSummaryOutput(runId, "EXECUTING", {
    summary: SUMMARY,
    laneId,
    cwd: ROOT,
    root: ROOT,
  });
  assert.equal(early.presented, false);
  assert.equal(early.reason, "state_not_presented");
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.agent_report.type, "progress", "an unfinished run keeps its progress line");
  assert.equal(run.agent_report.finalized, false, "an in-flight report is never final");
});

await test("the view pins the finalized summary over live progress and pane text", async () => {
  const { laneId, runId } = runThatReportedProgress();
  transitionExecutionRun(runId, "COMPLETE", { root: ROOT, origin: "agent", summary: "done" });
  fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });
  const run = getExecutionRun(runId, ROOT);

  const lane = {
    lane_id: laneId,
    execution_run: run,
    // Everything that used to be able to take the bubble back after completion.
    provider_activity: { live_progress: { summary: "still working…", spinner: "⠋" }, activity: "working" },
  };
  assert.ok(finalizedRunReport(lane), "the finalized report is recognised");
  const shown = assistantMessageSource(lane, {
    output: { text: "leftover pane chrome and a half-scrolled previous turn" },
    outputText: "leftover pane chrome",
  });
  assert.equal(shown.text, SUMMARY, "the summary outranks live progress and pane text");
  assert.equal(shown.terminal, true);
  assert.equal(shown.finalized, true);
});

await test("an open run is not hidden behind the previous run's summary", async () => {
  const { laneId, runId } = runThatReportedProgress();
  transitionExecutionRun(runId, "COMPLETE", { root: ROOT, origin: "agent", summary: "done" });
  fileTerminalSummaryOutput(runId, "COMPLETE", { summary: SUMMARY, laneId, cwd: ROOT, root: ROOT });
  const finished = getExecutionRun(runId, ROOT);

  const next = createQueuedRun({ laneId, instruction: "next turn", root: ROOT, worktreePath: ROOT });
  transitionExecutionRun(next.run.run_id, "EXECUTING", { root: ROOT, origin: "agent" });
  const open = getExecutionRun(next.run.run_id, ROOT);

  const lane = { lane_id: laneId, execution_run: open, previous_run: finished };
  assert.equal(finalizedRunReport(lane), null, "a new turn is not suppressed by the last turn's summary");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
