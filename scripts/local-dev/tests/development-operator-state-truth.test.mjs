#!/usr/bin/env node
/**
 * A LANE STATUS MUST DESCRIBE AUTHORITATIVE EXECUTION TRUTH.
 *
 * Two operator-facing defects, both reported from real use, both caused by a
 * lane's headline being derived from something that is not the lane's work.
 *
 * 1. READY WHILE THE RUN WAS STILL FINISHING. `canonicalLaneWorkState` answered
 *    "Ready" as soon as the provider went quiet, even with the Execution Run
 *    still open. Between the agent's last token and a durable terminal state
 *    sit validation, checkpointing, the run report and the completion summary.
 *    Ready is the word that tells the Director the lane is safe to instruct, so
 *    saying it there produced exactly that: a second prompt into a lane still
 *    writing its own result.
 *
 * 2. WORKING WITH NO RUN AT ALL. A busy PANE is a fact about a process;
 *    "Working" is a claim about this lane's authorized work. Surfaces showed
 *    Working repeatedly with no work ever started, because observed pane
 *    activity was promoted to the lane headline. The contradiction already had
 *    a name in the codebase — activityContradictsRun() calls it
 *    `working_without_run` — it simply was not the thing being displayed.
 *
 * The invariant both share: a lane may not claim Working or Ready unless
 * canonical execution state supports the claim.
 *
 * Hermetic: pure projection over lane shapes. No gateway, no store, no browser.
 */
import assert from "node:assert/strict";
import test from "node:test";

const V = await import("../apps/vacilando/public/gateway-view.mjs");
const M = await import("../apps/vacilando/public/vacilando-ui-model.mjs");

const identity = {
  lane_id: "lane_test",
  name: "Test",
  binding: { provider: "claude", worktree_name: "wt-test", slot: 6 },
};
const lane = (execution_run, activity) => ({
  ...identity,
  ...(execution_run ? { execution_run } : {}),
  ...(activity ? { provider_activity: { activity } } : {}),
});
const stateOf = (l) => M.operatorState(V.canonicalLaneWorkState(l), l);

// ── 1 · Ready must mean the run is over ─────────────────────────────────────
test("an open run with a quiet provider is Finalizing, never Ready", () => {
  const st = V.canonicalLaneWorkState(lane({ state: "EXECUTING" }, "ready"));
  assert.equal(st.key, "finalizing");
  assert.notEqual(st.label, "Ready");
  assert.notEqual(st.label, "Working");
});

test("Finalizing reaches the operator projection as its own state", () => {
  assert.equal(stateOf(lane({ state: "EXECUTING" }, "ready")), M.OPERATOR_STATE.FINALIZING);
  assert.equal(M.OPERATOR_STATE_LABEL[M.OPERATOR_STATE.FINALIZING], "Finalizing");
});

test("Finalizing is not swallowed by the generic live/active rule", () => {
  // `finalizing` is group "active" and NOT live. Before this state existed,
  // group "active" alone would have answered Working and `live:false` alone
  // would have answered Ready — both wrong, in opposite directions.
  const st = V.canonicalLaneWorkState(lane({ state: "EXECUTING" }, "ready"));
  assert.equal(st.group, "active");
  assert.equal(st.live, false);
  assert.equal(stateOf(lane({ state: "EXECUTING" }, "ready")), M.OPERATOR_STATE.FINALIZING);
});

// ── 2 · Working requires a run that owns the work ───────────────────────────
test("a busy pane with no run is Provider active, never Working", () => {
  const st = V.canonicalLaneWorkState(lane(null, "working"));
  assert.equal(st.key, "provider_active");
  assert.notEqual(st.label, "Working");
  assert.equal(st.source, "agent_observed_without_run");
});

test("a busy pane with no run does not read Ready either", () => {
  // The lane is demonstrably not idle. Saying Ready would be the mirror-image
  // lie of saying Working.
  const st = stateOf(lane(null, "working"));
  assert.notEqual(st, M.OPERATOR_STATE.READY);
  assert.equal(st, M.OPERATOR_STATE.ATTENTION);
});

test("a busy pane WITH an executing run is genuinely Working", () => {
  // The positive control: this is the case Working exists for, and it must not
  // be lost while fixing the case it did not.
  const st = V.canonicalLaneWorkState(lane({ state: "EXECUTING" }, "working"));
  assert.equal(st.label, "Working");
  assert.equal(st.live, true);
  assert.equal(stateOf(lane({ state: "EXECUTING" }, "working")), M.OPERATOR_STATE.WORKING);
  // `source` is only stamped by the observed-activity branch; an EXECUTING run
  // is answered earlier, by the run itself. Asserting a source here would be
  // asserting which branch ran, not what the operator is told.
});

test("the phantom-Working shape is exactly what activityContradictsRun names", async () => {
  // Same lane, two owners, one answer: the projection must not display
  // something the contradiction detector already classifies as a disagreement.
  const A = await import("../lib/vacilando/lane-provider-activity.mjs");
  const l = lane(null, "working");
  assert.equal(A.activityContradictsRun(l)?.kind, "working_without_run");
  assert.notEqual(V.canonicalLaneWorkState(l).label, "Working");
});

// ── 3 · The states that were already right stay right ───────────────────────
test("a genuinely idle lane is still Ready", () => {
  assert.equal(stateOf(lane(null, "ready")), M.OPERATOR_STATE.READY);
});

test("needs-input still outranks everything", () => {
  assert.equal(stateOf(lane({ state: "NEEDS_INPUT" }, "ready")), M.OPERATOR_STATE.NEEDS_YOU);
});

test("a failed run is still Failed", () => {
  assert.equal(stateOf(lane({ state: "FAILED" }, "ready")), M.OPERATOR_STATE.FAILED);
});

test("every operator state has a label and a tone", () => {
  for (const s of Object.values(M.OPERATOR_STATE)) {
    assert.ok(M.OPERATOR_STATE_LABEL[s], `${s} has no label`);
    assert.ok(s in M.OPERATOR_STATE_TONE, `${s} has no tone`);
  }
});

// ── 4 · A completed run must account for itself ─────────────────────────────
//
// Measured on this host across 104 terminal runs: `completion_report.report_id`
// is present for exactly the 82 that also carry a durable agent_report.message
// and absent for exactly the 22 that do not — 82 both, 22 neither, zero mixed.
// Eight of the 22 are state COMPLETE: the run claims success and no account of
// it exists anywhere, because the system closed it (Send superseding the turn,
// the stale reaper, an unanswerable input gate) before the agent could file.
const doneLane = (opts = {}) => ({
  ...identity,
  previous_run: {
    state: "COMPLETE",
    ...(opts.accounted === false ? {} : { completion_report: { report_id: "rep_1" } }),
  },
  ...(opts.unseen ? { unseen_notifications: opts.unseen } : {}),
});

test("a completed run with no filed account is Attention, never Ready", () => {
  const st = V.canonicalLaneWorkState(doneLane({ accounted: false }));
  assert.equal(st.key, "completion_unreported");
  assert.notEqual(st.label, "Ready");
  assert.notEqual(st.label, "Idle");
  assert.equal(st.source, "terminal_without_account");
  assert.equal(stateOf(doneLane({ accounted: false })), M.OPERATOR_STATE.ATTENTION);
});

test("an unreported completion is not repaired by inventing a summary", () => {
  // The state reports the absence. It must not claim an account exists.
  const st = V.canonicalLaneWorkState(doneLane({ accounted: false }));
  assert.match(st.headline, /no summary/i);
});

test("a completed run with unopened output is New, not Ready", () => {
  const st = V.canonicalLaneWorkState(doneLane({ unseen: 2 }));
  assert.equal(st.key, "completed_unread");
  assert.notEqual(st.label, "Ready");
  assert.equal(stateOf(doneLane({ unseen: 2 })), M.OPERATOR_STATE.COMPLETED_UNREAD);
  assert.equal(M.OPERATOR_STATE_LABEL[M.OPERATOR_STATE.COMPLETED_UNREAD], "New");
});

test("unread completion is attention WITHOUT an answer obligation", () => {
  // The whole point of keeping it separate from NEEDS_YOU: it is visible, and
  // nobody is being asked anything.
  assert.notEqual(stateOf(doneLane({ unseen: 2 })), M.OPERATOR_STATE.NEEDS_YOU);
});

test("opening the output returns the lane to Ready", () => {
  // Unread derives from the durable unseen count, so clearing it is what
  // clears the state — no separate client flag to drift.
  const st = V.canonicalLaneWorkState(doneLane({ unseen: 0 }));
  assert.ok(["ready", "idle"].includes(st.key), `expected ready/idle, got ${st.key}`);
  assert.notEqual(st.key, "completed_unread");
});

test("a real question still outranks unread output", () => {
  const lane = { ...doneLane({ unseen: 3 }), execution_run: { state: "NEEDS_INPUT" } };
  assert.equal(stateOf(lane), M.OPERATOR_STATE.NEEDS_YOU);
});
