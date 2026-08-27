#!/usr/bin/env node
/**
 * Execution Run durability: ABANDONED semantics, liveness, and recovery.
 *
 * State-machine tests over durable JSON. No browser, no tmux, no live Claude,
 * no wall-clock dependence — every clock is injected via nowMs.
 *
 * Covers the Phase 7 contract:
 *   1. active long-running run is not abandoned solely due to silence
 *   2. genuinely dead worker can become abandoned
 *   3. abandoned run with verified ownership can recover
 *   4. abandoned run cannot be hijacked by another lane/worktree
 *   5. recovered run can complete
 *   6. audit history preserves abandonment + recovery
 *   7. Gateway restart does not falsely terminalize a healthy lane
 *   8. browser disconnect does not equal abandonment
 *   9. duplicate recovery attempts are idempotent
 *  10. terminal COMPLETE remains terminal
 */
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  createQueuedRun,
  getExecutionRun,
  isLegalRunTransition,
  listExecutionRunsForLane,
  publicExecutionRun,
  recoverExecutionRun,
  reportRunState,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  classifyExecutionRunStale,
  collectStaleRunFacts,
  reconcileStaleExecutionRuns,
  STALE_SETTLE_MS,
  WORKER_HEARTBEAT_RECENT_MS,
} from "../lib/vacilando/execution-stale.mjs";
import { createDurableLane } from "../lib/vacilando/development-lane.mjs";
import { readLaneRuntimeStore, laneRuntimeStorePath, recordDeliveredInstruction } from "../lib/vacilando/lane-runtime.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-abandon-"));
const WT = mkdtempSync(join(tmpdir(), "vac-abandon-wt-"));
const OTHER_WT = mkdtempSync(join(tmpdir(), "vac-abandon-other-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const T0 = Date.parse("2026-08-21T12:00:00.000Z");
const MIN = 60 * 1000;
const INSTRUCTION = "Finish the Records/Roster work and validate it.";

let LANE = null;
let OTHER_LANE = null;

function ensureLanes() {
  if (LANE) return;
  const a = createDurableLane({
    name: "abandon-primary",
    binding: { worktree_path: WT },
    root: ROOT,
    nowMs: T0,
  });
  assert.equal(a.ok, true, `primary lane: ${a.error || ""}`);
  LANE = a.lane.lane_id;
  const b = createDurableLane({
    name: "abandon-other",
    binding: { worktree_path: OTHER_WT },
    root: ROOT,
    nowMs: T0,
  });
  assert.equal(b.ok, true, `other lane: ${b.error || ""}`);
  OTHER_LANE = b.lane.lane_id;
}

let pass = 0;
let fail = 0;
async function test(name, fn) {
  ensureLanes();
  resetExecutionRunsForTests(ROOT);
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/** Deliver an instruction and mark it EXECUTING, exactly as a real send does. */
function seedExecuting({ laneId = null, startMs = T0, instruction = INSTRUCTION, worktree = WT } = {}) {
  const lane = laneId || LANE;
  const created = createQueuedRun({
    laneId: lane,
    instruction,
    worktreePath: worktree,
    nowMs: startMs,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(created.ok, true, `seed queued: ${created.error || ""}`);
  const exec = transitionExecutionRun(created.run.run_id, "EXECUTING", {
    reason: "instruction_delivered",
    origin: "operator",
    nowMs: startMs,
    root: ROOT,
    worktreePath: worktree,
  });
  assert.equal(exec.ok, true);
  return exec.run;
}

/**
 * Reproduce the real send bookkeeping: `activity_at` is written ONCE, seconds
 * after delivery, and is therefore also a delivery echo. This is the shape that
 * made every run look dead.
 */
function seedRealisticSend(laneId, deliveredMs) {
  recordDeliveredInstruction(laneId, {
    instruction: INSTRUCTION,
    status: "delivered",
    delivered_at: new Date(deliveredMs).toISOString(),
  }, ROOT);
  const path = laneRuntimeStorePath(ROOT);
  const store = readLaneRuntimeStore(ROOT);
  const rec = store.lanes[laneId];
  rec.output_fingerprint_at_send = "fp-base";
  rec.activity_fingerprint = "fp-echo";
  rec.activity_at = new Date(deliveredMs + 4_000).toISOString();
  rec.notification_emitted_at = new Date(deliveredMs + 4_000).toISOString();
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
}

function classifyAt(run, nowMs) {
  const facts = collectStaleRunFacts(run, { root: ROOT, nowMs });
  return classifyExecutionRunStale(run, facts);
}

function abandonViaGovernor(run, nowMs) {
  const out = reconcileStaleExecutionRuns({ root: ROOT, nowMs, laneId: run.lane_id });
  assert.equal(out.count, 1, "expected the governor to abandon exactly one run");
  return getExecutionRun(run.run_id, ROOT);
}

// ---------------------------------------------------------------------------

await test("1. active long-running run is not abandoned solely due to silence", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  // The worker reports once, five minutes in. This is a same-state report on an
  // already-EXECUTING run — the exact call that used to be discarded as a noop.
  const rep = reportRunState(run.run_id, "executing", {
    origin: "agent",
    root: ROOT,
    nowMs: T0 + 5 * MIN,
    summary: "Reading the execution modules",
  });
  assert.equal(rep.ok, true);
  assert.equal(rep.noop, true, "same-state report is not a transition");
  assert.equal(rep.heartbeat, true, "...but it IS recorded as liveness");

  const after = getExecutionRun(run.run_id, ROOT);
  assert.ok(after.last_worker_report_at, "heartbeat timestamp persisted");
  assert.equal(after.worker_report_count, 1);

  // Thirty minutes of total silence: far past the settle window, no further
  // reports, no output activity beyond the delivery echo.
  const now = T0 + 35 * MIN;
  assert.ok(now - T0 > STALE_SETTLE_MS, "we are past the settle window");
  const cls = classifyAt(after, now);
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "worker_heartbeat");
  assert.equal(cls.evidence.genuine_recent_activity, false, "output activity was only a delivery echo");

  const swept = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(swept.count, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
});

await test("2. genuinely dead worker can become abandoned", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  // No heartbeat ever, no agent session, no worktree activity (bare temp dir has
  // no .git), well past settle. That is positive evidence of a dead worker.
  const now = T0 + 24 * 60 * MIN;
  const cls = classifyAt(run, now);
  assert.equal(cls.class, "stale");
  assert.equal(cls.reason, "orphaned_pre_protocol_run");
  assert.equal(cls.evidence.worker_report_count, 0);
  assert.equal(cls.evidence.session_alive, false);
  assert.equal(cls.evidence.worktree_activity_recent, false);

  const closed = abandonViaGovernor(run, now);
  assert.equal(closed.state, "ABANDONED");
  assert.notEqual(closed.state, "FAILED");
});

await test("2b. silence alone is ambiguous, never auto-abandoned, once a worker reported", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  reportRunState(run.run_id, "executing", { origin: "agent", root: ROOT, nowMs: T0 + MIN, summary: "working" });
  // Long past the heartbeat window: no longer protected, but a run that HAS
  // reported is ambiguous, not stale. The operator decides, not the governor.
  const now = T0 + MIN + WORKER_HEARTBEAT_RECENT_MS + 10 * MIN;
  const cls = classifyAt(getExecutionRun(run.run_id, ROOT), now);
  assert.equal(cls.class, "ambiguous");
  // Either ambiguous branch is correct here; the contract is the CLASS — a run
  // that has reported is never auto-terminalized on silence alone.
  assert.ok(
    ["managed_reports_without_recent_activity", "executing_without_live_signals"].includes(cls.reason),
    `unexpected ambiguous reason: ${cls.reason}`,
  );
  const swept = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now, laneId: LANE });
  assert.equal(swept.count, 0, "ambiguous runs are never auto-terminalized");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
});

await test("3. abandoned run with verified ownership can recover", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  const closed = abandonViaGovernor(run, T0 + 24 * 60 * MIN);
  assert.equal(closed.state, "ABANDONED");

  const rec = recoverExecutionRun(run.run_id, {
    laneId: LANE,
    cwd: WT,
    origin: "agent",
    root: ROOT,
    nowMs: T0 + 25 * 60 * MIN,
  });
  assert.equal(rec.ok, true, rec.error || "");
  assert.equal(rec.recovered, true);
  assert.equal(rec.ownership_proof, "worktree_cwd");
  assert.equal(rec.run.state, "RECOVERING");
  assert.equal(rec.run.completed_at, null, "recovery clears the terminal stamp");
  assert.equal(rec.run.recovery_state.abandoned_reason, "orphaned_pre_protocol_run");
  // Recovery restores the lane's current run.
  assert.equal(isLegalRunTransition("ABANDONED", "RECOVERING"), true);
  assert.equal(isLegalRunTransition("ABANDONED", "EXECUTING"), false, "no arbitrary resurrection");
});

await test("4. abandoned run cannot be hijacked by another lane or worktree", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(run, T0 + 24 * 60 * MIN);
  const at = T0 + 25 * 60 * MIN;

  const foreignCwd = recoverExecutionRun(run.run_id, { laneId: LANE, cwd: OTHER_WT, root: ROOT, nowMs: at });
  assert.equal(foreignCwd.ok, false);
  assert.equal(foreignCwd.error, "worktree_mismatch");

  const foreignLane = recoverExecutionRun(run.run_id, { laneId: OTHER_LANE, cwd: WT, root: ROOT, nowMs: at });
  assert.equal(foreignLane.ok, false);
  assert.equal(foreignLane.error, "lane_mismatch");

  const unproven = recoverExecutionRun(run.run_id, { laneId: LANE, cwd: null, origin: "agent", root: ROOT, nowMs: at });
  assert.equal(unproven.ok, false);
  assert.equal(unproven.error, "ownership_unproven");

  assert.equal(getExecutionRun(run.run_id, ROOT).state, "ABANDONED", "run stays abandoned after failed hijacks");
});

await test("4b. recovery is refused while the lane already has an active run", async () => {
  const first = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(first, T0 + 24 * 60 * MIN);
  // Operator moved on and sent new work on the same lane.
  const second = seedExecuting({ startMs: T0 + 25 * 60 * MIN });
  const rec = recoverExecutionRun(first.run_id, { laneId: LANE, cwd: WT, root: ROOT, nowMs: T0 + 26 * 60 * MIN });
  assert.equal(rec.ok, false);
  assert.equal(rec.error, "lane_has_active_run");
  assert.equal(rec.active_run_id, second.run_id);
});

await test("5. recovered run can complete", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(run, T0 + 24 * 60 * MIN);

  // The worker simply reports again from its own worktree. It must not be told
  // "illegal_transition" — that is the operator-visible defect being repaired.
  const back = reportRunState(run.run_id, "executing", {
    origin: "agent",
    cwd: WT,
    expectedLaneId: LANE,
    root: ROOT,
    nowMs: T0 + 25 * 60 * MIN,
    summary: "still here, resuming",
  });
  assert.equal(back.ok, true, back.error || "");
  assert.notEqual(back.error, "illegal_transition");
  assert.equal(back.recovered, "worktree_cwd");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");

  const val = reportRunState(run.run_id, "validating", {
    origin: "agent", cwd: WT, root: ROOT, nowMs: T0 + 26 * 60 * MIN,
  });
  assert.equal(val.ok, true, val.error || "");
  const done = reportRunState(run.run_id, "complete", {
    origin: "agent", cwd: WT, root: ROOT, nowMs: T0 + 27 * 60 * MIN, summary: "done",
  });
  assert.equal(done.ok, true, done.error || "");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");
});

await test("5b. recovery can close directly to COMPLETE when the work did finish", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(run, T0 + 24 * 60 * MIN);
  const done = reportRunState(run.run_id, "complete", {
    origin: "agent", cwd: WT, expectedLaneId: LANE, root: ROOT,
    nowMs: T0 + 25 * 60 * MIN, summary: "sprint finished before the false abandon",
  });
  assert.equal(done.ok, true, done.error || "");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");
});

await test("6. audit history preserves abandonment and recovery", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(run, T0 + 24 * 60 * MIN);
  recoverExecutionRun(run.run_id, { laneId: LANE, cwd: WT, root: ROOT, nowMs: T0 + 25 * 60 * MIN });
  reportRunState(run.run_id, "executing", { origin: "agent", cwd: WT, root: ROOT, nowMs: T0 + 26 * 60 * MIN });

  const after = getExecutionRun(run.run_id, ROOT);
  const chain = after.transitions.map((t) => `${t.from_state}->${t.to_state}`);
  assert.deepEqual(chain, [
    "null->QUEUED",
    "QUEUED->EXECUTING",
    "EXECUTING->ABANDONED",
    "ABANDONED->RECOVERING",
    "RECOVERING->EXECUTING",
  ]);
  // History is appended to, never rewritten.
  assert.equal(after.created_at, publicExecutionRun(run).created_at);
  assert.equal(after.instruction, INSTRUCTION);
  const abandon = after.transitions.find((t) => t.to_state === "ABANDONED");
  assert.equal(abandon.origin, "governor");
  assert.equal(abandon.reason, "orphaned_pre_protocol_run");
  assert.equal(after.recovery_state.abandoned_reason, "orphaned_pre_protocol_run");
  assert.equal(after.recovery_state.ownership_proof, "worktree_cwd");
  assert.equal(after.recovered_count, 1);
});

await test("7. Gateway restart does not falsely terminalize a healthy lane", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  reportRunState(run.run_id, "executing", { origin: "agent", root: ROOT, nowMs: T0 + 2 * MIN, summary: "working" });

  // A Gateway restart re-reads durable JSON and sweeps. Heartbeats are durable,
  // so nothing about a restart is evidence the worker died.
  const now = T0 + 10 * MIN;
  for (let i = 0; i < 3; i += 1) {
    const swept = reconcileStaleExecutionRuns({ root: ROOT, nowMs: now + i * MIN });
    assert.equal(swept.count, 0);
  }
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
  assert.equal(classifyAt(getExecutionRun(run.run_id, ROOT), now).class, "active");
});

await test("8. browser disconnect does not equal abandonment", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  reportRunState(run.run_id, "executing", { origin: "agent", root: ROOT, nowMs: T0 + MIN, summary: "working" });
  // No UI poll, no output capture, no notification for half an hour: the browser
  // is closed. Classification reads durable facts only, so nothing changes.
  const before = getExecutionRun(run.run_id, ROOT);
  const cls = classifyAt(before, T0 + 30 * MIN);
  assert.equal(cls.class, "active");
  assert.equal(cls.reason, "worker_heartbeat");
  const store = readLaneRuntimeStore(ROOT);
  assert.equal(store.lanes[LANE].activity_at, new Date(T0 + 4_000).toISOString(),
    "output bookkeeping is untouched by classification");
});

await test("9. duplicate recovery attempts are idempotent", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(run, T0 + 24 * 60 * MIN);
  const at = T0 + 25 * 60 * MIN;
  const first = recoverExecutionRun(run.run_id, { laneId: LANE, cwd: WT, root: ROOT, nowMs: at });
  assert.equal(first.recovered, true);
  const second = recoverExecutionRun(run.run_id, { laneId: LANE, cwd: WT, root: ROOT, nowMs: at + MIN });
  assert.equal(second.ok, true);
  assert.equal(second.already_recovering, true);
  assert.equal(second.noop, true);
  const after = getExecutionRun(run.run_id, ROOT);
  assert.equal(after.recovered_count, 1, "a duplicate attempt is not a second recovery");
  assert.equal(after.transitions.filter((t) => t.to_state === "RECOVERING").length, 1);
});

await test("10. terminal COMPLETE remains terminal", async () => {
  const run = seedExecuting({ startMs: T0 });
  reportRunState(run.run_id, "complete", { origin: "agent", cwd: WT, root: ROOT, nowMs: T0 + MIN, summary: "done" });
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");

  assert.equal(isLegalRunTransition("COMPLETE", "RECOVERING"), false);
  assert.equal(isLegalRunTransition("COMPLETE", "EXECUTING"), false);
  assert.equal(isLegalRunTransition("FAILED", "RECOVERING"), false);

  const rec = recoverExecutionRun(run.run_id, { laneId: LANE, cwd: WT, root: ROOT, nowMs: T0 + 2 * MIN });
  assert.equal(rec.ok, false);
  assert.equal(rec.error, "run_irreversible");

  const reopen = transitionExecutionRun(run.run_id, "EXECUTING", { root: ROOT, nowMs: T0 + 3 * MIN });
  assert.equal(reopen.ok, false);
  assert.equal(reopen.error, "illegal_transition");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "COMPLETE");

  // A COMPLETE run must also never be swept.
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: T0 + 48 * 60 * MIN, laneId: LANE }).count, 0);
});

await test("11. an abandoned run left alone stays abandoned (no auto-resurrection)", async () => {
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  abandonViaGovernor(run, T0 + 24 * 60 * MIN);
  for (let i = 1; i <= 3; i += 1) {
    reconcileStaleExecutionRuns({ root: ROOT, nowMs: T0 + (24 * 60 + i) * MIN });
  }
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "ABANDONED");
  assert.equal(listExecutionRunsForLane(LANE, ROOT)[0].recovered_count, 0);
});

await test("2c. a worker that reported and then truly died is abandoned, but only after a long silence", async () => {
  const { ABANDON_AFTER_HEARTBEAT_MS } = await import("../lib/vacilando/execution-stale.mjs");
  const run = seedExecuting({ startMs: T0 });
  seedRealisticSend(LANE, T0);
  reportRunState(run.run_id, "executing", { origin: "agent", root: ROOT, nowMs: T0 + MIN, summary: "working" });

  // Just under the window: still ambiguous, never auto-abandoned.
  const early = T0 + MIN + ABANDON_AFTER_HEARTBEAT_MS - MIN;
  assert.equal(classifyAt(getExecutionRun(run.run_id, ROOT), early).class, "ambiguous");
  assert.equal(reconcileStaleExecutionRuns({ root: ROOT, nowMs: early, laneId: LANE }).count, 0);

  // Past it, with no session and no worktree movement, the lane must not stay
  // blocked behind a worker that really is gone.
  const late = T0 + MIN + ABANDON_AFTER_HEARTBEAT_MS + MIN;
  const cls = classifyAt(getExecutionRun(run.run_id, ROOT), late);
  assert.equal(cls.class, "stale");
  assert.equal(cls.reason, "worker_gone_after_reporting");
  const closed = abandonViaGovernor(getExecutionRun(run.run_id, ROOT), late);
  assert.equal(closed.state, "ABANDONED");
  // ...and it is still recoverable, because it was never a failure.
  assert.equal(recoverExecutionRun(run.run_id, { laneId: LANE, cwd: WT, root: ROOT, nowMs: late + MIN }).recovered, true);
});

await test("12. abandonment notifies the operator instead of dying silently", async () => {
  const { OUTCOME_PUSH_STATES, outcomePushPayload } = await import("../lib/vacilando/lane-push.mjs");
  // The outcome the operator did not ask for is the one they most need told.
  assert.equal(OUTCOME_PUSH_STATES.includes("ABANDONED"), true);
  const payload = outcomePushPayload({
    lane_id: LANE,
    title: "abandon-primary",
    state: "ABANDONED",
    reason: "orphaned_pre_protocol_run",
  });
  assert.equal(payload.state, "ABANDONED");
  assert.equal(payload.type, "execution_run.abandoned");
  assert.match(payload.body, /closed as no longer live/);
  assert.match(payload.body, /orphaned_pre_protocol_run/);
  assert.match(payload.body, /continue it/i);
  assert.equal(payload.path, `/#/lanes/${encodeURIComponent(LANE)}`);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
