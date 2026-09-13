#!/usr/bin/env node
/**
 * "NEEDS YOU" MEANS THE OPERATOR ACTUALLY HAS SOMETHING TO DO.
 *
 * It was derived from the RUN STATE: `NEEDS_INPUT` meant "Needs you". But
 * `releaseRunAfterGovernedFailure` puts a run into NEEDS_INPUT when a governed
 * action FAILS, which asks nobody anything.
 *
 * MEASURED on the promoted runtime: 34 runs have entered NEEDS_INPUT and 10 of
 * them entered because an action failed. Each rendered "Needs you" on a lane
 * where there was nothing to do, and the only way to find that out was to open
 * the lane. A badge that is sometimes wrong is a badge that gets checked every
 * time and trusted none of the time.
 *
 * These lock the ten operator scenarios as STATE, which is the layer the defect
 * lived in. They do not photograph a phone — see the report for that limit.
 */
import assert from "node:assert/strict";

import {
  LANE_OPERATOR_STATES, isPresentableSummary, isUnresolvedOperatorRequest,
  laneOperatorState, presentableSummary, unresolvedOperatorRequests,
} from "../lib/vacilando/lane-operator-state.mjs";
import { laneAttentionView } from "../lib/vacilando/lane-attention-view.mjs";
import { waitCollectionSummary } from "../lib/vacilando/execution-stale.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const LANE = "lane_x";
const asked = (id = "g1", over = {}) => ({ request_id: id, lane_id: LANE, status: "awaiting_operator", ...over });
const answered = (id = "g1", decision = "approved") => asked(id, { operator_approval: { decision, at: "2026-09-13T10:00:00.000Z" } });

/* ── 1-3: THE LIFECYCLE ──────────────────────────────────────────────────── */

test("S1. a pending approval is Needs You", () => {
  const v = laneOperatorState({ laneId: LANE, runState: "WAITING_RESOURCE", requests: [asked()] });
  assert.equal(v.state, "NEEDS_YOU");
  assert.equal(v.actionable, true);
  assert.equal(v.needs_you_count, 1);
  assert.deepEqual(v.pending_request_ids, ["g1"]);
});

test("S2. THE DEFECT: an accepted approval clears Needs You immediately", () => {
  // "Accepted" on the card while the header still said "Needs you" was the
  // single most-reported inconsistency. A decision already made is history.
  const v = laneOperatorState({ laneId: LANE, runState: "EXECUTING", requests: [answered()] });
  assert.equal(v.state, "WORKING");
  assert.equal(v.actionable, false);
  assert.equal(v.needs_you_count, 0);
});

test("S3. a DENIED decision also ends the obligation", () => {
  // Denial is an answer. The lane is not still asking.
  const v = laneOperatorState({ laneId: LANE, runState: "EXECUTING", requests: [answered("g1", "denied")] });
  assert.equal(v.actionable, false);
  assert.equal(v.needs_you_count, 0);
  assert.equal(isUnresolvedOperatorRequest(answered("g1", "denied")), false);
});

test("S4. Director executing is Working, never Working AND Needs You", () => {
  const v = laneOperatorState({ laneId: LANE, runState: "EXECUTING", requests: [answered()] });
  assert.equal(v.state, "WORKING");
  assert.equal(LANE_OPERATOR_STATES.WORKING.actionable, false);
});

/* ── 4-5: ONE WORKING, ONE COLOUR ────────────────────────────────────────── */

test("S5. Working has ONE tone whether or not a run is attached", () => {
  /*
   * "Working" rendered in an active colour with a run and an error colour
   * without one — two colours for one word, which teaches a reader that colour
   * means nothing.
   */
  const tracked = laneOperatorState({ laneId: LANE, runState: "EXECUTING", executionTracked: true });
  const untracked = laneOperatorState({ laneId: LANE, runState: "EXECUTING", executionTracked: false });
  assert.equal(tracked.state, untracked.state);
  assert.equal(tracked.tone, untracked.tone, "one word, one colour");
  assert.equal(tracked.tone, "active");
});

test("S6. untracked execution is secondary text, and not actionable", () => {
  // The operator cannot attach a run. It resolves itself when one opens.
  const v = laneOperatorState({ laneId: LANE, runState: "EXECUTING", executionTracked: false });
  assert.equal(v.secondary, "Execution tracking is connecting");
  assert.equal(v.actionable, false);
  assert.notEqual(v.tone, "blocking", "a transient tracking gap is not an error");
});

/* ── 6-7: HISTORY MAY NOT SPEAK FOR THE PRESENT ──────────────────────────── */

test("S7. 'Waiting on null' can never reach an operator surface", () => {
  for (const bad of [
    "The run waited on null past its human_indefinite bound.",
    "The run waited on undefined past its bound.",
    "The run waited on Waiting on Director — staging merge past its bound.",
  ]) {
    assert.equal(isPresentableSummary(bad), false, bad);
    assert.equal(presentableSummary(bad), null);
  }
  assert.equal(isPresentableSummary("Gate 2 certification complete"), true);
});

test("S8. the copy is fixed at its source, not filtered at the surface", () => {
  // One line produced both bad strings. A filter downstream would have left the
  // record itself wrong for anything that read it later.
  assert.match(waitCollectionSummary({ reason: null }), /^The run waited longer than allowed/);
  assert.doesNotMatch(waitCollectionSummary({ reason: null }), /null|undefined/);
  assert.match(waitCollectionSummary({ reason: "needs_operator_input" }), /an operator decision/);
  assert.doesNotMatch(waitCollectionSummary({ reason: "needs_operator_input" }), /needs_operator_input/);
});

test("S9. a completed lane does not carry stale wait prose as its summary", () => {
  const v = laneOperatorState({
    laneId: LANE, runState: "COMPLETE",
    summary: "The run waited on null past its bound and was collected.",
  });
  assert.equal(v.state, "READY");
  assert.equal(v.summary, null, "unpresentable history is dropped, and the label carries the meaning");
});

test("S10. a transcript failure does not make a finished lane look failed", () => {
  /*
   * A session/telemetry read failure is not a mission failure. Precedence: the
   * current run state outranks any historical transcript line.
   */
  const v = laneOperatorState({
    laneId: LANE, runState: "COMPLETE", requests: [answered()],
    summary: "FAILED session transcript",
  });
  assert.equal(v.state, "READY");
  assert.equal(v.tone, "neutral");
  assert.notEqual(v.state, "FAILED");
});

/* ── 8-10: COUNTS, RESIDUE, PRECEDENCE ───────────────────────────────────── */

test("S11. the badge counts unresolved decisions only", () => {
  const v = laneOperatorState({
    laneId: LANE, runState: "WAITING_RESOURCE",
    requests: [asked("g1"), answered("g2"), asked("g3"), { request_id: "g4", lane_id: LANE, status: "complete" }],
  });
  assert.equal(v.needs_you_count, 2, "two asked, one answered, one finished");
  assert.deepEqual(v.pending_request_ids, ["g1", "g3"]);
  assert.equal(v.secondary, "2 decisions waiting");
});

test("S12. zero unresolved decisions leaves no residue", () => {
  for (const run of ["EXECUTING", "COMPLETE", "WAITING_RESOURCE", "FAILED"]) {
    const v = laneOperatorState({ laneId: LANE, runState: run, requests: [answered("g1"), answered("g2", "denied")] });
    assert.equal(v.needs_you_count, 0, run);
    assert.equal(v.actionable, false, run);
    assert.notEqual(v.state, "NEEDS_YOU", run);
  }
});

test("S13. another lane's pending decision is not this lane's obligation", () => {
  const other = { request_id: "g9", lane_id: "lane_other", status: "awaiting_operator" };
  const v = laneOperatorState({ laneId: LANE, runState: "EXECUTING", requests: [other] });
  assert.equal(v.needs_you_count, 0);
  assert.equal(unresolvedOperatorRequests([other], LANE).length, 0);
  assert.equal(unresolvedOperatorRequests([other], "lane_other").length, 1);
});

test("S14. THE DEFECT: a failed action parks a run, and that is Blocked, not Needs You", () => {
  // 10 of the 34 NEEDS_INPUT entries measured got here this way.
  const v = laneOperatorState({ laneId: LANE, runState: "NEEDS_INPUT", runStateReason: "not_retirable_now", requests: [] });
  assert.equal(v.state, "BLOCKED");
  assert.equal(v.actionable, false);
  assert.equal(v.needs_you_count, 0);
  assert.equal(v.secondary, "not_retirable_now", "it still says what stopped");
});

test("S15. a request outranks the run state — precedence, in one place", () => {
  // The pending decision wins over EXECUTING, and nothing lower can overturn it.
  const v = laneOperatorState({
    laneId: LANE, runState: "EXECUTING", executionTracked: false,
    requests: [asked()], summary: "Ready · everything merged",
  });
  assert.equal(v.state, "NEEDS_YOU");
});

/* ── THE SURFACES AGREE ──────────────────────────────────────────────────── */

test("S16. the lane list and header read the same selector", () => {
  const parked = laneAttentionView({ laneId: LANE, runState: "NEEDS_INPUT", requests: [] });
  assert.equal(parked.label, "Blocked");
  assert.equal(parked.requires_director, false);
  assert.equal(parked.needs_you_count, 0);

  const pending = laneAttentionView({ laneId: LANE, runState: "WAITING_RESOURCE", requests: [asked()] });
  assert.equal(pending.label, "Needs you");
  assert.equal(pending.requires_director, true);
  assert.equal(pending.needs_you_count, 1);
  assert.equal(pending.operator_state, "NEEDS_YOU");

  const done = laneAttentionView({ laneId: LANE, runState: "EXECUTING", requests: [answered()] });
  assert.equal(done.label, "Working");
  assert.equal(done.requires_director, false);
  assert.equal(done.needs_you_count, 0);
});

test("S17. a stuck lane is still worth a look without being actionable", () => {
  // "Worth reading" and "cannot continue without you" stay separate facts.
  const v = laneAttentionView({ laneId: LANE, runState: "FAILED", requests: [] });
  assert.equal(v.operator_state, "FAILED");
  assert.equal(v.director_category, "stuck");
  assert.equal(v.requires_director, true, "stuck still reaches the Director");
  assert.equal(v.needs_you_count, 0, "but there is no decision outstanding");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
