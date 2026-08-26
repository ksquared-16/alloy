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
  canOperatorSupersedeRun,
  OPERATOR_SUPERSEDE_GRACE_MS,
  classifyExecutionRunStale,
  closeStaleExecutionRun,
  collectStaleRunFacts,
  maybeCompleteIdleTurnFromLastOutput,
  paneResultAgreesWithTranscript,
  reconcileStaleExecutionRuns,
  STALE_SETTLE_MS,
} from "../lib/vacilando/execution-stale.mjs";
import { reconcileGovernor } from "../lib/vacilando/execution-reconcile.mjs";
import { ensureResourceRequest, patchResourceRequest, readResourceRequestStore } from "../lib/vacilando/execution-resource.mjs";
import { laneRuntimeStorePath, recordDeliveredInstruction } from "../lib/vacilando/lane-runtime.mjs";
import { resetLaneSendStateForTests } from "../lib/vacilando/lanes.mjs";
import { stopAllOutputWatches } from "../lib/vacilando/lane-notify.mjs";
import {
  createAgentSession,
  markAgentSessionActive,
  activeAgentSessionForLane,
  resetAgentSessionsForTests,
} from "../lib/vacilando/agent-session.mjs";

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
  resetAgentSessionsForTests(ROOT);
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

await test("1. operator follow-up is a new turn even with a leftover heartbeat", async () => {
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
  assert.equal(second.ok, true, second.error);
  assert.equal(second.stale_run_closed, true);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");
  assert.equal(activeRunForLane(LANE, ROOT).instruction, "another job");
});

await test("1a. status-only NEEDS_INPUT is a leftover turn, not a composer question", async () => {
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: now - 60_000 });
  transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
    reason: "Director review of the Local Design Lab",
    origin: "agent",
    nowMs: now - 50_000,
    root: ROOT,
    completion_report: { summary: "Director review of the Local Design Lab" },
  });
  seedSend(PRODUCT, now - 60_000, now - 50_000);
  const second = await deliverManagedLaneInstruction(LANE, "keep going", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.stale_run_closed, true);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");
  assert.equal(activeRunForLane(LANE, ROOT).instruction, "keep going");
});

await test("1a. status-only NEEDS_INPUT is a leftover turn, not a composer question", async () => {
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: now - 60_000 });
  transitionExecutionRun(run.run_id, "NEEDS_INPUT", {
    reason: "Director review of the Local Design Lab",
    origin: "agent",
    nowMs: now - 50_000,
    root: ROOT,
    completion_report: { summary: "Director review of the Local Design Lab" },
  });
  seedSend(PRODUCT, now - 60_000, now - 50_000);
  const second = await deliverManagedLaneInstruction(LANE, "keep going", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now,
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.stale_run_closed, true);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");
  assert.equal(activeRunForLane(LANE, ROOT).instruction, "keep going");
});

await test("1b. a rotating session still blocks a new send", async () => {
  const now = Date.now();
  const run = seedExecuting({ instruction: PRODUCT, startMs: now - 60_000 });
  seedSend(PRODUCT, now - 60_000, now - 50_000);
  const created = createAgentSession({
    laneId: LANE,
    runId: run.run_id,
    root: ROOT,
    nowMs: now,
  });
  assert.equal(created.ok, true);
  assert.equal(created.session.state, "STARTING");
  const second = await deliverManagedLaneInstruction(LANE, "another job", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: deliveredSend(),
    getOutput: quietGet(),
    notifyIntervalMs: 60_000,
    nowMs: now,
  });
  assert.equal(second.ok, false);
  assert.equal(second.error, "current_run_active");
  assert.equal(activeRunForLane(LANE, ROOT).run_id, run.run_id);
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
  // The invariant is "reconcile never MUTATES the worktree", not "the word git
  // never appears". Liveness now reads git control-file mtimes (read-only stat),
  // so assert the invariant directly instead of banning substrings.
  const src = readFileSync(join(HERE, "../lib/vacilando/execution-stale.mjs"), "utf8");
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");

  // No subprocess: reconcile can never shell out to git.
  assert.equal(/child_process|execSync|spawnSync|\bspawn\(|\bexec\(/.test(code), false);

  // No mutating git verbs.
  for (const verb of ["checkout", "reset", "clean", "commit", "stash", "rebase", "merge"]) {
    assert.equal(new RegExp(`\\b${verb}\\b`).test(code), false, `mutating git verb: ${verb}`);
  }

  // No filesystem writes of any kind from the reconcile module.
  for (const w of ["writeFileSync", "appendFileSync", "renameSync", "rmSync", "unlinkSync", "mkdirSync"]) {
    assert.equal(code.includes(w), false, `filesystem mutation: ${w}`);
  }

  // Positive control: the guard is looking at real source, and the read-only
  // probe it is meant to permit is actually present.
  assert.equal(code.includes("statSync"), true);
  assert.equal(code.includes("classifyExecutionRunStale"), true);
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

await test("a long queue wait is not settle time", async () => {
  // The run was CREATED hours ago and only just began EXECUTING. Measuring
  // settle from creation would make it abandonable the moment it starts.
  const now = Date.now();
  const run = seedExecuting({ instruction: SOAK, startMs: now - 30_000 });
  run.created_at = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  seedSend(SOAK, now - 30_000, now - 21_000);
  const cls = classifyExecutionRunStale(run, collectStaleRunFacts(run, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "still_settling");
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE }).count, 0);
});

await test("settle is measured even when started_at predates the field", async () => {
  // A run restored from an older store has no started_at; the EXECUTING
  // transition is the fallback clock, never created_at.
  const now = Date.now();
  const run = seedExecuting({ instruction: SOAK, startMs: now - 30_000 });
  run.started_at = null;
  run.created_at = new Date(now - 6 * 60 * 60 * 1000).toISOString();
  const cls = classifyExecutionRunStale(run, collectStaleRunFacts(run, { root: ROOT, nowMs: now }));
  assert.equal(cls.class, "active");
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
  const closed = getExecutionRun(run.run_id, ROOT);
  assert.ok(["COMPLETE", "ABANDONED"].includes(closed.state), closed.state);
});

await test("idle ACTIVE session does not keep a finished turn Executing", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  seedSend(PRODUCT, start, start + 9_000);
  const created = createAgentSession({
    laneId: LANE,
    runId: run.run_id,
    root: ROOT,
    nowMs: start,
  });
  assert.equal(created.ok, true, created.error);
  markAgentSessionActive(created.session.agent_session_id, { root: ROOT });
  const facts = collectStaleRunFacts(run, { root: ROOT, nowMs: now });
  const cls = classifyExecutionRunStale(run, facts);
  assert.equal(cls.class, "stale");
  assert.equal(cls.reason, "turn_finished_session_remains");
  assert.equal(cls.evidence.session_alive, true);
  const out = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(out.count, 1);
  const closed = getExecutionRun(run.run_id, ROOT);
  assert.equal(closed.state, "COMPLETE");
  assert.notEqual(closed.state, "ABANDONED");
  assert.equal(activeAgentSessionForLane(LANE, ROOT).state, "ACTIVE");
});

await test("STARTING session still protects an in-flight run", async () => {
  const start = Date.parse("2026-08-17T22:39:46.822Z");
  const now = start + 24 * 3600 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  seedSend(PRODUCT, start, start + 9_000);
  const created = createAgentSession({
    laneId: LANE,
    runId: run.run_id,
    root: ROOT,
    nowMs: start,
  });
  assert.equal(created.ok, true, created.error);
  assert.equal(created.session.state, "STARTING");
  const facts = collectStaleRunFacts(run, { root: ROOT, nowMs: now });
  const cls = classifyExecutionRunStale(run, facts);
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "session_busy");
  const swept = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(swept.count, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
});

await test("an idle cooked turn files the last output as the completion summary", async () => {
  const start = Date.parse("2026-08-24T16:00:00.000Z");
  const now = start + 2 * 3600 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  const LAST = [
    "Slice 6 is closed on the engineering side.",
    "",
    "The typecheck boundary held. Safeguarding ownership is a Director decision.",
  ].join("\n");
  const out = await maybeCompleteIdleTurnFromLastOutput({
    lane_id: LANE,
    execution_run: getExecutionRun(run.run_id, ROOT),
    provider_activity: {
      activity: "ready",
      live_progress: { summary: LAST, idle_result: true },
    },
  }, {
    root: ROOT,
    nowMs: now,
    collectLatest: async () => ({
      available: true,
      text: LAST,
      timestamp: new Date(start + 3600 * 1000).toISOString(),
    }),
  });
  assert.equal(out.completed, true, out.error || out.skipped);
  const closed = getExecutionRun(run.run_id, ROOT);
  assert.equal(closed.state, "COMPLETE");
  assert.equal(closed.agent_report.message, LAST, "the last output is the completion message");
  assert.match(closed.completion_report.summary, /Slice 6 is closed/);
});

await test("a delivered cooked turn still files last output when the receipt token is not in the writeup", async () => {
  const start = Date.parse("2026-08-24T16:00:00.000Z");
  const now = start + 2 * 3600 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  const { patchRunFields } = await import("../lib/vacilando/execution-run.mjs");
  patchRunFields(run.run_id, {
    delivery: { acknowledged: true, receipt_token: "erun_secret_token", receipt_confirmed: false },
  }, { nowMs: start, root: ROOT });
  const LAST = "The last output summary for this finished turn. Safeguarding stays a Director decision.";
  const out = await maybeCompleteIdleTurnFromLastOutput({
    lane_id: LANE,
    execution_run: getExecutionRun(run.run_id, ROOT),
    provider_activity: {
      activity: "ready",
      live_progress: { summary: LAST, idle_result: true },
    },
  }, {
    root: ROOT,
    nowMs: now,
    collectLatest: async () => ({
      available: true,
      text: LAST,
      timestamp: new Date(start + 3600 * 1000).toISOString(),
    }),
  });
  assert.equal(out.completed, true, out.error || out.skipped);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");
  assert.equal(getExecutionRun(run.run_id, ROOT).agent_report.message, LAST);
});

await test("a quiet prompt without a finished-turn marker does not invent a completion", async () => {
  const start = Date.parse("2026-08-24T16:00:00.000Z");
  const now = start + 2 * 3600 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  const out = await maybeCompleteIdleTurnFromLastOutput({
    lane_id: LANE,
    execution_run: getExecutionRun(run.run_id, ROOT),
    provider_activity: { activity: "ready", live_progress: null },
  }, {
    root: ROOT,
    nowMs: now,
    collectLatest: async () => ({ available: true, text: "Full last output from the transcript that is long enough." }),
  });
  assert.equal(out.completed, false);
  assert.equal(out.skipped, "turn_not_finished");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
});

await test("leftover Cooked does not complete a new run from the previous transcript", async () => {
  const start = Date.parse("2026-08-25T19:45:00.000Z");
  const now = start + 5 * 60 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  const OLD = "Slice 6 is closed on the engineering side. The typecheck boundary held for safeguarding.";
  const out = await maybeCompleteIdleTurnFromLastOutput({
    lane_id: LANE,
    execution_run: getExecutionRun(run.run_id, ROOT),
    provider_activity: {
      activity: "ready",
      live_progress: { summary: OLD, idle_result: true },
    },
  }, {
    root: ROOT,
    nowMs: now,
    collectLatest: async () => ({
      available: true,
      text: OLD,
      timestamp: new Date(start - 3600 * 1000).toISOString(),
    }),
  });
  assert.equal(out.completed, false);
  assert.equal(out.skipped, "last_output_predates_run");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
});

await test("a leftover Cooked pane does not complete a run whose transcript is a new turn", async () => {
  const start = Date.parse("2026-08-25T19:45:00.000Z");
  const now = start + 5 * 60 * 1000;
  const run = seedExecuting({ instruction: PRODUCT, startMs: start });
  const PANE = "Slice 6 is closed on the engineering side. The typecheck boundary held for safeguarding.";
  const NEW = "Investigation complete. No canonical owner exists — writing the finding, then the model.";
  assert.equal(paneResultAgreesWithTranscript(PANE, NEW), false);
  const out = await maybeCompleteIdleTurnFromLastOutput({
    lane_id: LANE,
    execution_run: getExecutionRun(run.run_id, ROOT),
    provider_activity: {
      activity: "ready",
      live_progress: { summary: PANE, idle_result: true },
    },
  }, {
    root: ROOT,
    nowMs: now,
    collectLatest: async () => ({
      available: true,
      text: NEW,
      timestamp: new Date(start + 60 * 1000).toISOString(),
    }),
  });
  assert.equal(out.completed, false);
  assert.equal(out.skipped, "last_output_mismatch");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
});

await test("operator Send can supersede a parked RECOVERING run", async () => {
  // THE COMMUNICATIONS DEAD END. A recovered run waits for the agent to report
  // again. When the agent already answered BEFORE the recovery — or its reply
  // was consumed as a delivery echo — nothing further arrives, and the run parks
  // in RECOVERING. The stale governor calls that class "active" so it never
  // collects it, and Send was refused for anything that was not EXECUTING or
  // NEEDS_INPUT. The lane became unreachable: it sat there 46 minutes with an
  // idle pane and no way back in.
  const delivered = Date.now() - (OPERATOR_SUPERSEDE_GRACE_MS + 60_000);
  const recovering = { state: "RECOVERING", started_at: new Date(delivered).toISOString() };
  const idle = { session_state: "IDLE", now_ms: Date.now(), delivered_ms: delivered };
  assert.equal(canOperatorSupersedeRun(recovering, idle), true);

  // POSITIVE CONTROLS. This widens the STATE, never the conditions — every
  // existing guard must still refuse, or the fix is a hole rather than a door.
  for (const busy of ["STARTING", "RESTARTING", "VERIFYING", "HANDOFF"]) {
    assert.equal(canOperatorSupersedeRun(recovering, { ...idle, session_state: busy }), false, busy);
  }
  assert.equal(canOperatorSupersedeRun(recovering, { ...idle, open_resource: true }), false);
  assert.equal(canOperatorSupersedeRun(recovering, { ...idle, in_flight_continuation: true }), false);
  assert.equal(canOperatorSupersedeRun(recovering, { ...idle, delivered_ms: Date.now() - 1000 }), false,
    "the grace window still protects a delivery that is still landing");

  // And states that were never supersedable still are not.
  for (const state of ["QUEUED", "VALIDATING", "WAITING_RESOURCE", "COMPLETE"]) {
    assert.equal(canOperatorSupersedeRun({ ...recovering, state }, idle), false, state);
  }
  // EXECUTING and NEEDS_INPUT are unchanged.
  assert.equal(canOperatorSupersedeRun({ ...recovering, state: "EXECUTING" }, idle), true);
  assert.equal(canOperatorSupersedeRun({ state: "NEEDS_INPUT" }, idle), true);
  assert.equal(canOperatorSupersedeRun({ state: "NEEDS_INPUT", agent_report: { type: "needs_input" } }, idle), false,
    "a real blocking question is still an operator decision, not a stale turn");
});

await test("a parked RECOVERING run stops being protected forever", async () => {
  // WHAT THE OPERATOR SAW. The Communications lane card read "Recovering" and
  // never changed. RECOVERING was in PROTECTIVE_STATES unconditionally, and
  // `recovery_state` — a RECORD of a past recovery — was read as "a recovery is
  // in flight" and never cleared. So a recovered run that never reported again
  // could not be collected by anything, ever. It sat there 116 minutes with an
  // idle pane, past settle, no progress and no agent report.
  const longAgo = new Date(Date.now() - (STALE_SETTLE_MS + 60 * 60 * 1000)).toISOString();
  const parked = {
    run_id: "erun_parked", state: "RECOVERING", instruction: "Are you stuck?",
    started_at: longAgo, updated_at: longAgo,
    recovery_state: { recovered_at: longAgo, abandoned_reason: "completion_not_attributable" },
  };
  const idle = { now_ms: Date.now(), session_state: "IDLE", session_alive: true };
  const parkedClass = classifyExecutionRunStale(parked, idle);
  assert.notEqual(parkedClass.class, "active", "a two-hour-old recovery is not in flight");
  assert.notEqual(parkedClass.reason, "protective_state_recovering");

  // POSITIVE CONTROL 1: a recovery that JUST happened is still protected. If
  // this ever fails, the fix has become a licence to collect live recoveries.
  const fresh = { ...parked, recovery_state: { recovered_at: new Date(Date.now() - 60_000).toISOString() } };
  assert.equal(classifyExecutionRunStale(fresh, idle).class, "active");
  assert.equal(classifyExecutionRunStale(fresh, idle).reason, "protective_state_recovering");

  // POSITIVE CONTROL 2: with no timestamp to judge by, it stays protected —
  // unknown timing must never become permission to collect.
  const undated = { ...parked, recovery_state: { abandoned_reason: "x" }, updated_at: null };
  assert.equal(classifyExecutionRunStale(undated, idle).class, "active");

  // POSITIVE CONTROL 3: the other protective states are untouched. They wait on
  // a person or a governed decision, and time alone does not resolve either.
  for (const state of ["VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT"]) {
    const c = classifyExecutionRunStale({ ...parked, state }, idle);
    assert.equal(c.class, "active", state);
    assert.equal(c.reason, `protective_state_${state.toLowerCase()}`, state);
  }

  // POSITIVE CONTROL 4: a settled recovery with a BUSY session is still active —
  // falling through to the ordinary evaluation must not skip the live checks.
  assert.equal(classifyExecutionRunStale(parked, { ...idle, session_state: "STARTING" }).class, "active");
  assert.equal(classifyExecutionRunStale(parked, { ...idle, open_resource: true }).class, "active");
});

await test("recovery is not a one-way trap", async () => {
  // THE TRAP THE OPERATOR KEPT SEEING. The governor abandons a run it cannot
  // attribute. An operator recovery moves it to RECOVERING. The governor reaches
  // the same conclusion again — and abandon was ILLEGAL from RECOVERING, so the
  // transition was refused and the run could never leave. The lane card read
  // "Recovering" permanently. Communications sat there for two hours.
  const { isLegalRunTransition } = await import("../lib/vacilando/execution-run.mjs");
  assert.equal(isLegalRunTransition("RECOVERING", "ABANDONED"), true,
    "a recovered run the governor cannot attribute must have somewhere to go");

  // POSITIVE CONTROLS. ABANDONED must not become cheap, and the irreversible
  // states must stay irreversible.
  assert.equal(isLegalRunTransition("COMPLETE", "ABANDONED"), false);
  assert.equal(isLegalRunTransition("FAILED", "ABANDONED"), false);
  assert.equal(isLegalRunTransition("ABANDONED", "EXECUTING"), false,
    "RECOVERING is still the only exit from ABANDONED");
  assert.equal(isLegalRunTransition("ABANDONED", "RECOVERING"), true);
  // And the states a recovered run could already reach are unchanged.
  for (const to of ["EXECUTING", "VALIDATING", "WAITING_RESOURCE", "NEEDS_INPUT", "COMPLETE", "FAILED"]) {
    assert.equal(isLegalRunTransition("RECOVERING", to), true, to);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
