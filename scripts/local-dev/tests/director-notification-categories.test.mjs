/**
 * What reaches the Director, and what must not.
 *
 * The old stream notified on approval requests, and approvals were constant,
 * so the signal that mattered — a lane genuinely stuck, a state that cannot
 * self-reconcile — arrived in the same pile as "a PR was opened". These tests
 * hold the line that routine success is silent.
 */
import test from "node:test";
import assert from "node:assert/strict";

const N = await import("../lib/vacilando/lane-notifications.mjs");

test("the four categories are the whole vocabulary", () => {
  assert.deepEqual([...N.DIRECTOR_CATEGORIES].sort(),
    ["attention", "completed", "needs_answer", "stuck"]);
});

test("run states map to the operator's obligation, not to what happened", () => {
  assert.equal(N.directorCategoryForRunState("NEEDS_INPUT"), "needs_answer");
  assert.equal(N.directorCategoryForRunState("COMPLETE"), "completed");
  // A failure wanted to continue and could not: somebody must unblock it.
  assert.equal(N.directorCategoryForRunState("FAILED"), "stuck");
  // An abandoned run asks nothing, but did not settle by itself either.
  assert.equal(N.directorCategoryForRunState("ABANDONED"), "attention");
  // Working is not a notification.
  for (const s of ["EXECUTING", "VALIDATING", "QUEUED", "WAITING_RESOURCE", "RECOVERING"]) {
    assert.equal(N.directorCategoryForRunState(s), null, `${s} must not page anyone`);
  }
});

test("routine governed progress pages nobody", () => {
  for (const s of ["requested", "executing", "approved", "complete"]) {
    assert.equal(N.directorCategoryForGovernedStatus(s), null, `${s} must be silent`);
  }
});

test("but a governed action that stops still reaches the Director", () => {
  // awaiting_operator survives precisely BECAUSE it is now rare: under the
  // attention model it means no policy covered this, or gates went unmeasured.
  assert.equal(N.directorCategoryForGovernedStatus("awaiting_operator"), "needs_answer");
  assert.equal(N.directorCategoryForGovernedStatus("failed"), "stuck");
});

test("every routine success event is suppressed", () => {
  for (const e of ["pull_request_opened", "push_completed", "authorization_satisfied",
    "governed_action_started", "governed_action_approved", "toolkit_install_started",
    "lane_queued", "lane_admitted", "server_restarted", "reconciliation_completed",
    "provider_seat_released", "capacity_decision_succeeded"]) {
    assert.equal(N.isRoutineProgress(e), true, `${e} must not notify`);
  }
});

test("suppression covers success only — nothing that failed or waits", () => {
  // The danger of a suppression list is that it grows to cover a real signal.
  for (const e of ["needs_input", "failed", "abandoned", "complete", "awaiting_operator"]) {
    assert.equal(N.isRoutineProgress(e), false, `${e} must never be suppressed`);
  }
});

test("related symptoms collapse onto one finding", () => {
  // Payments false VALIDATING -> seat held -> Surfaces waits is ONE problem.
  // Keyed per run it pages three times and hides the causal link, which is the
  // only part that helps anybody.
  const a = N.collapseKeyFor({ issueKey: "provider_seat_stale_payments", runId: "erun_a" });
  const b = N.collapseKeyFor({ issueKey: "provider_seat_stale_payments", runId: "erun_b" });
  assert.equal(a, b, "one issue is one notification");
  // Without an issue the old per-run behaviour is preserved exactly.
  assert.equal(N.collapseKeyFor({ runId: "erun_a" }), "run:erun_a");
  assert.notEqual(N.collapseKeyFor({ runId: "erun_a" }), N.collapseKeyFor({ runId: "erun_b" }));
  assert.equal(N.collapseKeyFor({}), null);
});
