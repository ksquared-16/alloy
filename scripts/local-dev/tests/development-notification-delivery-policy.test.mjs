#!/usr/bin/env node
/**
 * The delivery policy, and the audit that produced it.
 *
 * THE MEASUREMENT. 500 real records from this host's own notification store,
 * joined to the governed-action store by request_id, BEFORE any policy code
 * was written:
 *
 *   governed_action_worker_resumed     232    pushed 0    informational
 *   complete                           188    pushed 188  informational
 *   governed_action_approval_required   33    pushed 0    ACTIONABLE
 *   failed                              21    pushed 21   informational
 *   abandoned                           13    pushed 13   informational
 *   governed_action_complete            13    pushed 0    informational
 *
 * TWO DEFECTS FALL OUT OF THAT TABLE, and this suite pins both.
 *
 * 1. THE INVERSION. The only actionable class never reached the phone. All 33
 *    approval requests had `delivery.attempted: false`, because the only code
 *    path that pushes keys on RUN STATE and a governed action never becomes a
 *    run. Vacilando could say "your work finished" and could not say "I am
 *    waiting on you".
 *
 * 2. THE FLOOD. `governed_action_worker_resumed` was 46% of every record ever
 *    written and pushed nothing — it was not paging anyone, it was burying the
 *    33 records that mattered.
 *
 * And the trap that makes defect 2 dangerous to fix: a governed record is
 * keyed on the REQUEST, so the approval opens it and the completion resolves
 * it. Suppressing routine events outright leaves a Needs You item for work
 * that finished — the exact stale-item defect this system has already shipped
 * once. Routine progress may not OPEN a record; it must still close one.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-delivery-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const N = await import("../lib/vacilando/lane-notifications.mjs");
const P = await import("../lib/vacilando/notification-preferences.mjs");
const Push = await import("../lib/vacilando/lane-push.mjs");

const reset = () => { N.resetNotificationsForTests(); P.resetNotificationPreferencesForTests(); };

// ------------------------------------------------------------ the classification

test("the audited event types classify exactly as the audit says they should", () => {
  const c = N.deliveryClassFor;
  // The 33 that needed a human and never got one.
  assert.equal(
    c({ eventType: "governed_action_approval_required", attentionClass: "actionable" }),
    "human_action_required",
  );
  // The 245 that flooded the feed.
  assert.equal(
    c({ eventType: "governed_action_worker_resumed", attentionClass: "informational" }),
    "routine_automatic",
  );
  assert.equal(
    c({ eventType: "governed_action_complete", attentionClass: "informational" }),
    "routine_automatic",
  );
  // The 222 run outcomes, which were right all along.
  for (const [evt, st] of [["complete", "COMPLETE"], ["failed", "FAILED"], ["abandoned", "ABANDONED"]]) {
    assert.equal(c({ eventType: evt, attentionClass: "informational", state: st }), "important_terminal", evt);
  }
});

test("an unknown event is never promoted to the operator's phone", () => {
  // Silence is the safe default for something the policy has not been taught.
  assert.equal(N.deliveryClassFor({ eventType: "some_future_event" }), "routine_automatic");
  assert.equal(N.isPushEligible({ eventType: "some_future_event" }), false);
});

test("obligation beats routine — suppression cannot silence a real question", () => {
  // A routine event carrying a governed status only a human can clear still
  // escalates. A suppression list that can accidentally mute a live demand is
  // the failure this whole pass exists to correct.
  assert.equal(
    N.deliveryClassFor({ eventType: "governed_action_worker_resumed", governedStatus: "failed" }),
    "human_action_required",
  );
  assert.equal(
    N.deliveryClassFor({ eventType: "governed_action_worker_resumed", governedStatus: "awaiting_operator" }),
    "human_action_required",
  );
});

test("the policy classifies on canonical metadata, never on action identity", () => {
  // Two different capabilities, same canonical metadata, same answer. A rule
  // that named `repository.push` would be wrong for the next capability nobody
  // remembered to add to it.
  const a = N.deliveryClassFor({ eventType: "governed_action_approval_required", attentionClass: "actionable" });
  const b = N.deliveryClassFor({ eventType: "governed_action_approval_required", attentionClass: "actionable" });
  assert.equal(a, b);
  assert.equal(a, "human_action_required");
});

test("resolved and superseded records are not delivered", () => {
  for (const cls of ["resolved", "superseded"]) {
    assert.equal(N.isPushEligible({ eventType: "complete", attentionClass: cls, state: "COMPLETE" }), false, cls);
  }
});

test("the inversion is corrected: actionable is eligible, routine is not", () => {
  assert.equal(N.isPushEligible({ eventType: "governed_action_approval_required", attentionClass: "actionable" }), true);
  assert.equal(N.isPushEligible({ eventType: "governed_action_worker_resumed", attentionClass: "informational" }), false);
});

// ------------------------------------------------- routine may close, not open

test("routine progress does not open a record", () => {
  reset();
  const out = N.upsertNotification({
    subjectKey: "governed:gar_routine",
    requestId: "gar_routine",
    eventType: "governed_action_worker_resumed",
    attentionClass: "informational",
    createIfMissing: false,
    summary: "worker resumed",
  });
  assert.equal(out.created, false);
  assert.equal(out.skipped, "routine_progress");
  assert.equal(N.readNotificationStore().notifications.length, 0);
});

test("routine progress STILL resolves a record that already exists", () => {
  // The stale Needs You defect, pinned. Approval opens the record as
  // actionable; the completion is routine and must still turn it informational.
  reset();
  N.upsertNotification({
    subjectKey: "governed:gar_x",
    requestId: "gar_x",
    eventType: "governed_action_approval_required",
    attentionClass: "actionable",
    summary: "approve the push",
  });
  assert.equal(N.readNotificationStore().notifications[0].attention_class, "actionable");

  const out = N.upsertNotification({
    subjectKey: "governed:gar_x",
    requestId: "gar_x",
    eventType: "governed_action_complete",
    attentionClass: "informational",
    createIfMissing: false,
    summary: "approve the push",
  });
  assert.equal(out.updated, true);
  const rec = N.readNotificationStore().notifications[0];
  assert.equal(rec.attention_class, "informational");
  assert.equal(N.readNotificationStore().notifications.length, 1, "no second record");
});

// ------------------------------------------------------------- the phone switch

test("push starts on — an upgrade must not silently stop notifying", () => {
  reset();
  assert.equal(P.pushEnabled(), true);
  assert.equal(P.publicNotificationPreferences().push_enabled, true);
});

test("the switch is durable and survives a fresh read", () => {
  reset();
  P.setPushEnabled(false);
  assert.equal(P.pushEnabled(), false);
  assert.equal(P.readNotificationPreferences().push_enabled, false);
  P.setPushEnabled(true);
  assert.equal(P.pushEnabled(), true);
});

test("an unreadable preference file is not evidence the operator wanted silence", async () => {
  reset();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(P.notificationPreferencesPath(), "{ this is not json");
  assert.equal(P.pushEnabled(), true);
});

test("OFF suppresses delivery at the one place every push passes through", async () => {
  reset();
  P.setPushEnabled(false);
  let sends = 0;
  const out = await Push.sendPushToSubscriptions(
    { type: "execution_run.complete", lane_id: "lane_a", title: "L", body: "done", path: "/#/lanes" },
    { send: async () => { sends += 1; return { statusCode: 201 }; } },
  );
  assert.equal(out.skipped, "push_disabled_by_operator");
  assert.equal(out.sent, 0);
  assert.equal(sends, 0, "no transport call was made at all");
});

test("OFF suppresses delivery and NOTHING else — the record is still written", () => {
  reset();
  P.setPushEnabled(false);
  N.upsertNotification({
    subjectKey: "governed:gar_off",
    requestId: "gar_off",
    eventType: "governed_action_approval_required",
    attentionClass: "actionable",
    summary: "approve the merge",
  });
  const store = N.readNotificationStore();
  assert.equal(store.notifications.length, 1, "Needs You still has the item");
  assert.equal(store.notifications[0].attention_class, "actionable");
  assert.equal(N.actionableNotificationCount(), 1, "the in-app count is untouched");
});

test("re-enabling queues no backlog", async () => {
  reset();
  P.setPushEnabled(false);
  // Three things happen while the phone is off.
  for (const id of ["a", "b", "c"]) {
    N.upsertNotification({
      subjectKey: `governed:gar_${id}`,
      requestId: `gar_${id}`,
      eventType: "governed_action_approval_required",
      attentionClass: "actionable",
      summary: `approve ${id}`,
    });
  }
  P.setPushEnabled(true);
  let sends = 0;
  await Push.sendPushToSubscriptions(
    { type: "test", lane_id: "lane_a", title: "L", body: "b", path: "/#/lanes" },
    { send: async () => { sends += 1; return { statusCode: 201 }; } },
  );
  // Turning the phone back on means "tell me what happens NEXT". The three
  // records are already in the app and long since readable; replaying them as
  // pushes would announce things the operator has had all along.
  assert.equal(sends, 0, "no subscribers, and certainly no replay");
  assert.equal(N.readNotificationStore().notifications.length, 3, "records intact");
});

test("the explicit device test answers the operator's question, not their preference", async () => {
  // They are standing in front of it asking "can this device receive a push?".
  // Reporting their own setting back as a delivery failure answers nothing.
  reset();
  P.setPushEnabled(false);
  const out = await Push.sendPushToSubscriptions(
    { type: "test", lane_id: "lane_a", title: "L", body: "b", path: "/#/lanes" },
    { ignorePreference: true, send: async () => ({ statusCode: 201 }) },
  );
  assert.notEqual(out.skipped, "push_disabled_by_operator");
});

// ------------------------------------------------------------- the UI affordance

test("the switch is a primary control, not a diagnostic", async () => {
  const { renderNotificationControls } = await import("../apps/vacilando/public/gateway-view.mjs");
  const html = renderNotificationControls({ pushEnabled: true });
  assert.match(html, /data-gw-push-toggle/);
  assert.ok(
    html.indexOf("data-gw-push-toggle") < html.indexOf("<details"),
    "the switch renders outside and above the folded troubleshooting report",
  );
});

test("the OFF copy states the guarantee, so it is safe to turn off", () => {
  return import("../apps/vacilando/public/gateway-view.mjs").then(({ renderNotificationControls }) => {
    const off = renderNotificationControls({ pushEnabled: false });
    assert.match(off, /Needs You, Activity and lane history are unchanged/);
    assert.doesNotMatch(off, /checked/, "the switch reflects the stored setting");
  });
});
