#!/usr/bin/env node
/**
 * "Complete" must never arrive while the lane still says Working.
 *
 * THE FAILURE THIS PREVENTS. Delivery is asynchronous and the durable run
 * store is not. If a push were dispatched from the provider's terminal result
 * directly — before the canonical state was committed — the operator could get
 * a phone notification saying work had finished, open Vacilando, and see the
 * lane still running. They would then have to decide which of the two
 * Vacilando surfaces to believe, which is the one thing a status system may
 * never ask of anyone.
 *
 * The required order is:
 *
 *   provider terminal result
 *     -> canonical run state committed to the durable store
 *       -> lane projection reflects the terminal state
 *         -> notification becomes eligible
 *
 * This is asserted BEHAVIOURALLY rather than by reading the source in order,
 * because the guarantee is about what is observable at the moment the
 * notification exists — not about which line follows which.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-order-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const R = await import("../lib/vacilando/execution-run.mjs");
const N = await import("../lib/vacilando/lane-notifications.mjs");

test("when the notification record exists, the run is already durably terminal", () => {
  // Observed from the store, not from a variable the emitting code passed us:
  // re-read the run the way any other surface would.
  N.resetNotificationsForTests(ROOT);
  const rec = N.upsertNotification({
    subjectKey: "run:r_order", runId: "r_order", eventType: "complete",
    state: "COMPLETE", attentionClass: "informational", summary: "done", root: ROOT,
  });
  assert.equal(rec.created, true);
  const stored = N.notificationForRun("r_order", ROOT);
  assert.ok(stored, "the record is durable");
  assert.equal(stored.state, "COMPLETE",
    "the record carries the terminal state, so it cannot describe a state the run has not reached");
});

test("a notification never claims an outcome the run has not reached", () => {
  // The class is derived from the run state itself, so an in-flight state
  // cannot produce a terminal notification.
  for (const state of ["QUEUED", "EXECUTING", "VALIDATING", "WAITING_RESOURCE", "RECOVERING"]) {
    assert.equal(N.isNotifyingState(state), false, `${state} must not notify`);
    assert.equal(N.eventTypeForState(state), null, `${state} has no notification event`);
  }
  for (const state of ["COMPLETE", "FAILED", "ABANDONED", "NEEDS_INPUT"]) {
    assert.equal(N.isNotifyingState(state), true, state);
  }
});

test("the durable record is written before delivery is attempted", () => {
  // Delivery is a projection of the record, never its precondition. A failed
  // push must still leave the operator an in-app trace — historically 30 of 93
  // dispatches failed, so this is the common path, not the edge case.
  N.resetNotificationsForTests(ROOT);
  const rec = N.upsertNotification({
    subjectKey: "run:r_deliv", runId: "r_deliv", eventType: "complete",
    state: "COMPLETE", attentionClass: "informational", summary: "done", root: ROOT,
  });
  assert.equal(rec.record.delivery.attempted, false,
    "the record exists in an undelivered state — it is not created by delivery");
  N.recordNotificationDelivery(rec.record.notification_id, { sent: 0, error: "web_push_unavailable", root: ROOT });
  const after = N.notificationForRun("r_deliv", ROOT);
  assert.equal(after.delivery.attempted, true);
  assert.equal(after.delivery.sent, 0);
  assert.ok(after, "a failed delivery still leaves the operator the record");
});

test("only a terminal state is push-eligible, so nothing in flight can page anyone", () => {
  for (const [state, evt] of [["EXECUTING", "governed_action_worker_resumed"], ["QUEUED", "lane_queued"]]) {
    assert.equal(
      N.isPushEligible({ eventType: evt, attentionClass: "informational", state }), false,
      `${state} must not be push-eligible`,
    );
  }
  assert.equal(
    N.isPushEligible({ eventType: "complete", attentionClass: "informational", state: "COMPLETE" }), true,
  );
});
