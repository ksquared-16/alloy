#!/usr/bin/env node
/**
 * VALIDATING MUST NOT BE A ONE-WAY TRAP.
 *
 * The transition table let a run enter VALIDATING and reach COMPLETE or FAILED,
 * but not ABANDONED. That is the identical trap already documented for
 * RECOVERING in the same table: the governor's only available conclusion for a
 * run it cannot attribute is to abandon it, and abandon was illegal from here.
 *
 * MEASURED. The Payments run sat in VALIDATING for three hours after a finished
 * turn, with no heavy process in its worktree and zero broker claims on the
 * host. The classifier had been corrected to stop protecting it. Idle-turn
 * completion correctly declined, because the pane summary did not corroborate
 * the transcript. So the only remaining conclusion was abandon — and the
 * operator's own Close stale run returned illegal_transition. The run could not
 * leave VALIDATING by ANY path.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createQueuedRun, reportRunState, transitionExecutionRun, activeRunForLane } from "../lib/vacilando/execution-run.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  const root = mkdtempSync(join(tmpdir(), "vac-vow-"));
  try { fn(root); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
  finally { rmSync(root, { recursive: true, force: true }); }
}

const LANE = "lane_aaaaaaaaaaaa";
function validatingRun(root) {
  const c = createQueuedRun({ laneId: LANE, instruction: "work", origin: "operator", root });
  assert.equal(c.ok, true, `fixture: ${c.error}`);
  reportRunState(c.run.run_id, "executing", { origin: "operator", root });
  reportRunState(c.run.run_id, "validating", { origin: "agent", root, reason: "typecheck" });
  assert.equal(activeRunForLane(LANE, root).state, "VALIDATING");
  return c.run;
}

test("1. the governor can abandon a VALIDATING run it cannot attribute", (root) => {
  // The exact Payments dead end.
  const run = validatingRun(root);
  const out = transitionExecutionRun(run.run_id, "ABANDONED", { origin: "governor", reason: "no claim, no live signals", root });
  assert.notEqual(out?.ok, false, `abandon must be legal from VALIDATING: ${out?.error}`);
  assert.equal(activeRunForLane(LANE, root), null, "the lane is no longer held by a nonterminal run");
});

test("2. VALIDATING can still reach its ordinary terminals", (root) => {
  for (const state of ["complete", "failed"]) {
    const run = validatingRun(root);
    const out = reportRunState(run.run_id, state, { origin: "agent", root, summary: "done" });
    assert.notEqual(out?.ok, false, `${state} must remain reachable from VALIDATING`);
  }
});

test("3. VALIDATING can still be resumed rather than only terminated", (root) => {
  // Widening the exit set must not remove the paths back to work.
  const run = validatingRun(root);
  const out = reportRunState(run.run_id, "executing", { origin: "agent", root });
  assert.notEqual(out?.ok, false, "a validation that resumes work must still be able to");
  assert.equal(activeRunForLane(LANE, root).state, "EXECUTING");
});

test("4. abandon stays a governor conclusion, not an agent one", (root) => {
  // Making the transition legal must not let a worker abandon its own run.
  const run = validatingRun(root);
  const out = reportRunState(run.run_id, "abandoned", { origin: "agent", root });
  assert.equal(out?.ok, false, "an agent may not report ABANDONED");
  assert.equal(activeRunForLane(LANE, root).state, "VALIDATING");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
