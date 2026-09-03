#!/usr/bin/env node
/**
 * A CLOSED LANE MUST HOLD NO RUNTIME DEMAND.
 *
 * Closing released a lane's running resources but left its QUEUED work
 * untouched. Four retired certification lanes each kept a QUEUED run that could
 * never legitimately execute — and queued demand on a closed lane is worse than
 * untidy: admission counts it, it competes with live lanes, and nothing will
 * ever resolve it because the lane it belongs to is gone.
 *
 * The two properties worth locking down are opposites, and both matter:
 * queued work MUST be terminalised, and running work must NOT be. A cleanup
 * path that terminates live execution is a far worse bug than the leak it fixes.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reconcileClosedLaneDemand } from "../lib/vacilando/lane-worktree-lifecycle.mjs";
import { createQueuedRun, listExecutionRunsForLane, reportRunState } from "../lib/vacilando/execution-run.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-cld-"));
  try { fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

const LANE = "lane_aaaaaaaaaaaa";
const OTHER = "lane_bbbbbbbbbbbb";
function queuedRun(root, lane = LANE) {
  const out = createQueuedRun({ laneId: lane, instruction: "work", origin: "operator", root });
  assert.equal(out.ok, true, `fixture failed to create a run: ${out.error}`);
  return out.run;
}
const statesOf = (root, lane = LANE) =>
  (listExecutionRunsForLane(lane, root) || []).map((r) => r.state);

test("1. a queued run on a closed lane is terminalised", (root) => {
  // The exact live leak: four certification lanes, each with one QUEUED run.
  queuedRun(root);
  assert.deepEqual(statesOf(root), ["QUEUED"]);
  const out = reconcileClosedLaneDemand(LANE, { root });
  assert.equal(out.runs_abandoned.length, 1);
  assert.deepEqual(statesOf(root), ["ABANDONED"]);
});

test("2. running work is NEVER terminalised by cleanup", (root) => {
  // The property that matters most. Closing already refuses on unsafe in-flight
  // state, so anything still running here is either genuinely live or a
  // lifecycle problem of its own — killing it from a cleanup path would be a
  // worse bug than the leak.
  const run = queuedRun(root);
  reportRunState(run.run_id, "executing", { origin: "operator", root, reason: "delivered" });
  const out = reconcileClosedLaneDemand(LANE, { root });
  assert.equal(out.runs_abandoned.length, 0);
  assert.deepEqual(out.skipped_in_flight.map((s) => s.state), ["EXECUTING"]);
  assert.deepEqual(statesOf(root), ["EXECUTING"], "live work survives cleanup untouched");
});

test("3. in-flight work is REPORTED, not silently skipped", (root) => {
  const run = queuedRun(root);
  reportRunState(run.run_id, "executing", { origin: "operator", root });
  const out = reconcileClosedLaneDemand(LANE, { root });
  assert.equal(out.skipped_in_flight[0].run_id, run.run_id,
    "a lane that closed over live work must be visible, not mopped up quietly");
});

test("4. reconciling twice produces no second terminal event", (root) => {
  // Part 8: idempotent. Re-running must not duplicate anything.
  queuedRun(root);
  const first = reconcileClosedLaneDemand(LANE, { root });
  const second = reconcileClosedLaneDemand(LANE, { root });
  assert.equal(first.runs_abandoned.length, 1);
  assert.equal(second.runs_abandoned.length, 0, "already terminal is left alone");
  assert.deepEqual(statesOf(root), ["ABANDONED"]);
});

test("5. an already-clean lane is a safe no-op", (root) => {
  const out = reconcileClosedLaneDemand(LANE, { root });
  assert.deepEqual(out.runs_abandoned, []);
  assert.deepEqual(out.admissions_cancelled, []);
  assert.deepEqual(out.skipped_in_flight, []);
});

test("6. demand is never resurrected — a closed lane has nothing admissible", (root) => {
  queuedRun(root);
  reconcileClosedLaneDemand(LANE, { root });
  const open = (listExecutionRunsForLane(LANE, root) || [])
    .filter((r) => !["COMPLETE", "FAILED", "ABANDONED", "CANCELLED"].includes(r.state));
  assert.deepEqual(open, [], "no nonterminal run may remain to be admitted");
});

test("7. only the closed lane is touched", (root) => {
  queuedRun(root, LANE);
  queuedRun(root, OTHER);
  reconcileClosedLaneDemand(LANE, { root });
  assert.deepEqual(statesOf(root, LANE), ["ABANDONED"]);
  assert.deepEqual(statesOf(root, OTHER), ["QUEUED"], "another lane's queue position is untouched");
});

test("8. an unreadable store fails safe rather than failing the close", (root) => {
  const out = reconcileClosedLaneDemand("lane_cccccccccccc", { root });
  assert.deepEqual(out.runs_abandoned, []);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
