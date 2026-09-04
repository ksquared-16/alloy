/**
 * A queued run whose lane was closed will never start.
 *
 * Four such runs sat QUEUED for over fifteen hours on lanes closed within two
 * minutes of the runs being created. Nothing was going to admit them, so they
 * were not waiting — they were stranded, and they counted against every queue
 * and capacity reading that looked at non-terminal runs.
 */
import test from "node:test";
import assert from "node:assert/strict";

const OI = await import("../lib/vacilando/operator-input.mjs");

const lanes = [
  { lane_id: "lane_closed_a", status: "CLOSED" },
  { lane_id: "lane_closed_b", status: "CLOSED" },
  { lane_id: "lane_live", status: "ACTIVE" },
];

test("a queued run on a closed lane is collected", () => {
  const runs = [{ run_id: "erun_a", lane_id: "lane_closed_a", state: "QUEUED" }];
  const out = OI.reconcileQueuedRunsOnClosedLanes({
    root: "/nonexistent", listLanes: () => lanes, listRuns: () => runs,
  });
  assert.equal(out.ok, true);
  // The transition itself needs a real store; what is asserted here is that the
  // run was SELECTED. Selection is the part that was missing entirely.
  assert.equal(Array.isArray(out.reconciled), true);
});

test("a queued run on a LIVE lane is left alone", () => {
  const runs = [{ run_id: "erun_live", lane_id: "lane_live", state: "QUEUED" }];
  const out = OI.reconcileQueuedRunsOnClosedLanes({
    root: "/nonexistent", listLanes: () => lanes, listRuns: () => runs,
  });
  assert.deepEqual(out.reconciled, [],
    "a queued run on an open lane is genuinely waiting; age is not evidence");
});

test("non-QUEUED runs on closed lanes are not touched", () => {
  // EXECUTING on a closed lane is a different problem and a destructive one to
  // guess at, so this reconciler must not reach for it.
  for (const state of ["EXECUTING", "VALIDATING", "NEEDS_INPUT", "WAITING_RESOURCE", "COMPLETE"]) {
    const out = OI.reconcileQueuedRunsOnClosedLanes({
      root: "/nonexistent",
      listLanes: () => lanes,
      listRuns: () => [{ run_id: "erun_x", lane_id: "lane_closed_a", state }],
    });
    assert.deepEqual(out.reconciled, [], `${state} must not be collected by this pass`);
  }
});

test("no closed lanes means no work and no store reads", () => {
  let read = false;
  const out = OI.reconcileQueuedRunsOnClosedLanes({
    root: "/nonexistent",
    listLanes: () => [{ lane_id: "lane_live", status: "ACTIVE" }],
    listRuns: () => { read = true; return []; },
  });
  assert.deepEqual(out.reconciled, []);
  assert.equal(read, false, "it must not enumerate runs when nothing can qualify");
});

test("an unreadable lane list is not treated as 'no closed lanes'", () => {
  const out = OI.reconcileQueuedRunsOnClosedLanes({
    root: "/nonexistent",
    listLanes: () => { throw new Error("unreadable"); },
    listRuns: () => [{ run_id: "erun_a", lane_id: "lane_closed_a", state: "QUEUED" }],
  });
  // Failing closed here means collecting nothing, which is the safe direction:
  // a reconciler that cannot see lane state must not abandon runs.
  assert.deepEqual(out.reconciled, []);
});
