#!/usr/bin/env node
/**
 * Stale / orphaned Execution Run reconciliation.
 * Isolated runtime only. Does not attach to live Claude, tmux, or Git.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeRunForLane,
  attachLaneRuns,
  createQueuedRun,
  getExecutionRun,
  inspectLaneRun,
  isLegalRunTransition,
  listExecutionRunsForLane,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import { deliverManagedLaneInstruction } from "../lib/vacilando/execution-run-send.mjs";
import {
  classifyExecutionRunStale,
  closeStaleExecutionRun,
  collectStaleRunFacts,
  reconcileStaleExecutionRuns,
  STALE_SETTLE_MS,
} from "../lib/vacilando/execution-stale.mjs";
import { reconcileGovernor } from "../lib/vacilando/execution-reconcile.mjs";
import { ensureResourceRequest, patchResourceRequest, readResourceRequestStore } from "../lib/vacilando/execution-resource.mjs";
import { laneRuntimeStorePath, recordDeliveredInstruction } from "../lib/vacilando/lane-runtime.mjs";
import { resetLaneSendStateForTests } from "../lib/vacilando/lanes.mjs";
import { stopAllOutputWatches } from "../lib/vacilando/lane-notify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = mkdtempSync(join(tmpdir(), "vac-stale-"));
const WT = mkdtempSync(join(tmpdir(), "vac-stale-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const SOAK = "Gateway two-lane soak only. Do not modify files, run commands, or change the worktree. Reply with exactly: VACILANDO_DURABLE_TWO_LANE_SOAK";
const PRODUCT = "Finish the remaining Records/Roster work and validate it.";
const LANE = "alloy-identity";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetLaneSendStateForTests();
  stopAllOutputWatches();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  } finally {
    stopAllOutputWatches();
  }
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function deliveredSend() {
  return async (laneId, instruction) => ({
    ok: true,
    schema_version: "vacilando.lane.send.v1",
    lane_id: laneId,
    status: "delivered",
    error: null,
    delivered_at: new Date().toISOString(),
    instruction_size: String(instruction).length,
    audit_id: "evt_test",
    worktree_path: WT,
  });
}

function quietGet() {
  return async () => ({ ok: true, text: "", fingerprint: "test-fp", captured_at: new Date().toISOString() });
}

function seedSend(instruction, deliveredMs, activityMs = null) {
  recordDeliveredInstruction(LANE, {
    instruction,
    status: "delivered",
    delivered_at: iso(deliveredMs),
  }, ROOT);
  if (activityMs == null) return;
  const path = laneRuntimeStorePath(ROOT);
  const store = JSON.parse(readFileSync(path, "utf8"));
  const rec = store.lanes[LANE];
  rec.output_fingerprint_at_send = "fp-base";
  rec.activity_fingerprint = "fp-after";
  rec.activity_at = iso(activityMs);
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

function seedExecuting({ instruction, startMs, origin = "operator" }) {
  const created = createQueuedRun({
    laneId: LANE,
    instruction,
    worktreePath: WT,
    nowMs: startMs,
    origin,
    root: ROOT,
  });
  const exec = transitionExecutionRun(created.run.run_id, "EXECUTING", {
    reason: "instruction_delivered",
    origin: "operator",
    nowMs: startMs,
    root: ROOT,
    worktreePath: WT,
  });
  return exec.run;
}

await test("1. genuinely active run still blocks new send", async () => {
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: now });
  reportRunState(run.run_id, "executing", {
    origin: "agent",
    root: ROOT,
    nowMs: now + 5_000,
    summary: "Working Records/Roster",
  });
  seedSend(PRODUCT, now, now + 60_000);
  const second = await deliverManagedLaneInstruction(LANE, "another job", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now + 90_000,
  });
  assert.equal(second.ok, false);
  assert.equal(second.error, "current_run_active");
  assert.equal(activeRunForLane(LANE, ROOT).run_id, run.run_id);
  assert.equal(activeRunForLane(LANE, ROOT).state, "EXECUTING");
});

await test("2. historical pre-reporting run can become stale", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  seedSend(PRODUCT, start, start + 9_000);
  const facts = collectStaleRunFacts(run, { root: ROOT, nowMs: now });
  const cls = classifyExecutionRunStale(run, facts);
  assert.equal(cls.class, "stale");
  assert.equal(cls.reason, "orphaned_pre_protocol_run");
});

await test("3. stale run does not become FAILED by default", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: SOAK, startMs: start });
  seedSend(SOAK, start, start + 9_000);
  const out = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(out.count, 1);
  const closed = listExecutionRunsForLane(LANE, ROOT)[0];
  assert.equal(closed.run_id, run.run_id);
  assert.equal(closed.state, "ABANDONED");
  assert.notEqual(closed.state, "FAILED");
  assert.match(closed.completion_report.summary, /Abandoned/);
  assert.equal(closed.completion_report.summary.includes("fail"), false);
});

await test("4. stale run closes canonically via governor", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: SOAK, startMs: start });
  seedSend(SOAK, start, start + 9_000);
  const passSummary = await reconcileGovernor({ root: ROOT, nowMs: now, depth: "cheap" });
  assert.ok(passSummary.repaired >= 1);
  assert.equal(passSummary.actions.includes("stale_execution_run"), true);
  const closed = listExecutionRunsForLane(LANE, ROOT).find((r) => r.run_id === run.run_id);
  assert.equal(closed.state, "ABANDONED");
  assert.equal(closed.transitions.at(-1).to_state, "ABANDONED");
  assert.equal(closed.transitions.at(-1).origin, "governor");
  assert.equal(isLegalRunTransition("EXECUTING", "ABANDONED"), true);
});

await test("5. audit and history are preserved", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: SOAK, startMs: start });
  const before = listExecutionRunsForLane(LANE, ROOT)[0];
  const n = before.transitions.length;
  seedSend(SOAK, start, start + 9_000);
  reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  const after = listExecutionRunsForLane(LANE, ROOT)[0];
  assert.equal(after.run_id, run.run_id);
  assert.equal(after.instruction, SOAK);
  assert.equal(after.created_at, before.created_at);
  assert.equal(after.transitions[0].to_state, "QUEUED");
  assert.equal(after.transitions[1].to_state, "EXECUTING");
  assert.equal(after.transitions.length, n + 1);
  assert.equal(after.transitions.at(-1).to_state, "ABANDONED");
  const inspect = inspectLaneRun(LANE, ROOT);
  assert.equal(inspect.execution_run, null);
  assert.equal(inspect.previous_run.run_id, run.run_id);
  assert.equal(inspect.previous_run.state, "ABANDONED");
});

await test("6. provider session is not touched by stale classify", async () => {
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-stale.mjs"), "utf8");
  assert.equal(src.includes("capture-pane"), false);
  assert.equal(src.includes("kill-session"), false);
  assert.equal(src.includes("kill-pane"), false);
  assert.equal(src.includes("tmux "), false);
});

await test("7. worktree/branch/HEAD are not mutated by reconcile", async () => {
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-stale.mjs"), "utf8");
  assert.equal(/\bgit\b/.test(src), false);
  assert.equal(src.includes("worktree"), false);
  assert.equal(src.includes("checkout"), false);
});

await test("8. no resource request leaked after abandon", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: SOAK, startMs: start });
  seedSend(SOAK, start, start + 9_000);
  reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  const open = (readResourceRequestStore(ROOT).requests || []).filter((r) =>
    r.run_id === run.run_id && ["REQUESTED", "QUEUED", "GRANTED"].includes(r.state)
  );
  assert.equal(open.length, 0);
});

await test("9. certification run cannot block the lane forever", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  seedExecuting({ instruction: SOAK, startMs: start, origin: "operator" });
  seedSend(SOAK, start, start + 9_000);
  const created = listExecutionRunsForLane(LANE, ROOT)[0];
  assert.equal(created.origin, "certification");
  const second = await deliverManagedLaneInstruction(LANE, PRODUCT, {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now,
  });
  assert.equal(second.ok, true);
  assert.equal(second.stale_run_closed, true);
  assert.equal(second.execution_run.state, "EXECUTING");
  assert.equal(second.execution_run.instruction, PRODUCT);
  assert.equal(activeRunForLane(LANE, ROOT).instruction, PRODUCT);
  const soak = listExecutionRunsForLane(LANE, ROOT).find((r) => r.run_id === created.run_id);
  assert.equal(soak.state, "ABANDONED");
});

await test("10. TUI symbols are not classification authority", async () => {
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-stale.mjs"), "utf8");
  assert.equal(src.includes("❯"), false);
  assert.equal(src.includes("⏺"), false);
  assert.equal(src.toLowerCase().includes("prompt character"), false);
});

await test("11. recent genuine activity prevents stale classification", async () => {
  const now = Date.now();
  const start = now - 20 * 60 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  seedSend(PRODUCT, start, now - 5 * 60 * 1000);
  const cls = classifyExecutionRunStale(run, collectStaleRunFacts(run, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "recent_output_activity");
  const out = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(out.count, 0);
  assert.equal(activeRunForLane(LANE, ROOT).state, "EXECUTING");
});

await test("12. in-flight continuation prevents stale classification", async () => {
  const start = Date.now() - 3 * 60 * 60 * 1000;
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  seedSend(PRODUCT, start, start + 9_000);
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: LANE,
    resourceKey: "validate",
    origin: "agent",
    nowMs: start + 60_000,
    root: ROOT,
  });
  patchResourceRequest(req.request.request_id, {
    state: "GRANTED",
    continuation: { delivery_state: "DELIVERING", continuation_id: "econ_test" },
  }, { root: ROOT });
  const cls = classifyExecutionRunStale(run, collectStaleRunFacts(run, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "active");
  assert.ok(cls.reason === "in_flight_continuation" || cls.reason === "open_resource");
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE }).count, 0);
});

await test("13. active validation prevents stale classification", async () => {
  const start = Date.now() - 3 * 60 * 60 * 1000;
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  reportRunState(run.run_id, "validating", {
    origin: "agent",
    root: ROOT,
    nowMs: start + 30_000,
    reason: "typecheck",
  });
  seedSend(PRODUCT, start, start + 9_000);
  const current = activeRunForLane(LANE, ROOT);
  const cls = classifyExecutionRunStale(current, collectStaleRunFacts(current, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "protective_state_validating");
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE }).count, 0);
});

await test("14. Identity-style stale soak allows new work after reconciliation", async () => {
  const start = Date.parse("2026-08-18T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000 + 9 * 3600 * 1000;
  const run = seedExecuting({ instruction: SOAK, startMs: start });
  seedSend(SOAK, start, start + 9_000);
  const facts = collectStaleRunFacts(run, { root: ROOT, nowMs: now });
  assert.equal(facts.activity_is_delivery_echo, true);
  const cls = classifyExecutionRunStale(run, facts);
  assert.equal(cls.class, "stale");
  assert.equal(cls.reason, "stale_certification_run");
  const rec = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(rec.count, 1);
  assert.equal(activeRunForLane(LANE, ROOT), null);
  const attached = attachLaneRuns([{ lane_id: LANE }], ROOT, { includeInstruction: true })[0];
  assert.equal(attached.execution_run, null);
  assert.equal(attached.previous_run.state, "ABANDONED");
  const next = await deliverManagedLaneInstruction(LANE, PRODUCT, {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now + 1_000,
  });
  assert.equal(next.ok, true);
  assert.equal(next.execution_run.state, "EXECUTING");
  assert.equal(listExecutionRunsForLane(LANE, ROOT).length, 2);
});

await test("agent cannot report ABANDONED; operator close refuses live work", async () => {
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: now });
  reportRunState(run.run_id, "executing", { origin: "agent", root: ROOT, nowMs: now + 1000, summary: "live" });
  const reported = reportRunState(run.run_id, "abandoned", { origin: "agent", root: ROOT });
  assert.equal(reported.ok, false);
  const closed = closeStaleExecutionRun(run.run_id, { root: ROOT, nowMs: now + 2000 });
  assert.equal(closed.ok, false);
  assert.equal(closed.error, "run_still_active");
  assert.equal(activeRunForLane(LANE, ROOT).state, "EXECUTING");
});

await test("ambiguous managed-silent run can be operator-closed without FAILED", async () => {
  const start = Date.now() - 4 * 60 * 60 * 1000;
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  reportRunState(run.run_id, "validating", {
    origin: "agent",
    root: ROOT,
    nowMs: start + 30_000,
    summary: "Started Records work",
  });
  reportRunState(run.run_id, "executing", {
    origin: "agent",
    root: ROOT,
    nowMs: start + 90_000,
    summary: "Continuing Records work",
  });
  seedSend(PRODUCT, start, start + 9_000);
  const current = activeRunForLane(LANE, ROOT);
  const cls = classifyExecutionRunStale(current, collectStaleRunFacts(current, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "ambiguous");
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE }).count, 0);
  const closed = closeStaleExecutionRun(current.run_id, { root: ROOT, nowMs: now, origin: "operator" });
  assert.equal(closed.ok, true);
  assert.equal(closed.run.state, "ABANDONED");
  assert.notEqual(closed.run.state, "FAILED");
});

await test("still settling soak is not abandoned", async () => {
  const now = Date.now();
  const run = seedExecuting({ instruction: SOAK, startMs: now - 30_000 });
  seedSend(SOAK, now - 30_000, now - 21_000);
  const cls = classifyExecutionRunStale(run, collectStaleRunFacts(run, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "still_settling");
  assert.ok(STALE_SETTLE_MS > 30_000);
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE }).count, 0);
});

await test("idle governed resume does not block a new send forever", async () => {
  const start = Date.now() - 4 * 60 * 60 * 1000;
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  transitionExecutionRun(run.run_id, "WAITING_RESOURCE", {
    origin: "agent",
    root: ROOT,
    nowMs: start + 60_000,
    resource_wait: { resource_key: "director_governed_action" },
  });
  transitionExecutionRun(run.run_id, "EXECUTING", {
    origin: "system",
    root: ROOT,
    nowMs: start + 2 * 60 * 1000,
    reason: "governed_action_complete",
    progress: "database.read_census complete — resuming worker",
  });
  seedSend(PRODUCT, start, start + 9_000);
  const current = getExecutionRun(run.run_id, ROOT);
  const cls = classifyExecutionRunStale(current, collectStaleRunFacts(current, { root: ROOT, nowMs: now }));
  assert.ok(["ambiguous", "stale"].includes(cls.class), cls.reason);
  const second = await deliverManagedLaneInstruction(LANE, "Next Identity instruction", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.stale_run_closed, true);
  assert.equal(second.execution_run.instruction, "Next Identity instruction");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "ABANDONED");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
