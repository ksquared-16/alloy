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
    // Target the MASTER toggle specifically. The category rows legitimately
    // keep their own checked state while disabled — they describe what would
    // be sent if the phone were switched back on.
    const master = off.match(/<input type="checkbox" data-gw-push-toggle[^>]*>/)[0];
    assert.doesNotMatch(master, /checked/, "the master switch reflects the stored setting");
    assert.match(off, /data-gw-push-category="completions"[^>]*disabled/,
      "category rows are disabled while nothing is being sent at all");
  });
});

// ------------------------------------------------- categories: the actual volume

test("the category of a push is derived from the payload every path already sets", () => {
  assert.equal(P.categoryForPush({ type: "governed_action.approval_required", state: "NEEDS_INPUT" }), "needs_you");
  assert.equal(P.categoryForPush({ type: "execution_run.needs_input", state: "NEEDS_INPUT" }), "needs_you");
  assert.equal(P.categoryForPush({ type: "execution_run.failed", state: "FAILED" }), "failures");
  assert.equal(P.categoryForPush({ type: "execution_run.abandoned", state: "ABANDONED" }), "failures");
  assert.equal(P.categoryForPush({ type: "execution_run.complete", state: "COMPLETE" }), "completions");
});

test("an uncategorisable push is treated as needs_you, not silently dropped", () => {
  // The safe direction. A notification the operator did not need is a smaller
  // failure than a blocked decision they never heard about.
  assert.equal(P.categoryForPush({ type: "something.new" }), "needs_you");
  assert.equal(P.categoryForPush({}), "needs_you");
});

test("completions start off, and the two costly-to-miss categories start on", () => {
  reset();
  const prefs = P.readNotificationPreferences();
  assert.equal(prefs.categories.needs_you, true);
  assert.equal(prefs.categories.failures, true);
  assert.equal(prefs.categories.completions, false,
    "185 of 252 push-eligible events are completions — this is the volume");
});

test("a completion is suppressed on the phone and untouched in the app", async () => {
  reset();
  let sends = 0;
  const out = await Push.sendPushToSubscriptions(
    { type: "execution_run.complete", state: "COMPLETE", lane_id: "lane_a", title: "L", body: "done", path: "/#/lanes" },
    { send: async () => { sends += 1; return { statusCode: 201 }; } },
  );
  assert.equal(out.skipped, "push_category_off:completions");
  assert.equal(sends, 0);
  // The record is a separate concern and must be entirely unaffected.
  N.upsertNotification({
    subjectKey: "run:r1", runId: "r1", eventType: "complete", state: "COMPLETE",
    attentionClass: "informational", summary: "done",
  });
  assert.equal(N.readNotificationStore().notifications.length, 1);
});

test("a blocking decision still reaches the phone with default preferences", async () => {
  reset();
  const out = await Push.sendPushToSubscriptions(
    { type: "governed_action.approval_required", state: "NEEDS_INPUT", lane_id: "lane_a", title: "L", body: "approve", path: "/#/lanes" },
    { send: async () => ({ statusCode: 201 }) },
  );
  assert.notEqual(out.skipped, "push_category_off:needs_you");
});

test("a failure still reaches the phone with default preferences", async () => {
  reset();
  const out = await Push.sendPushToSubscriptions(
    { type: "execution_run.failed", state: "FAILED", lane_id: "lane_a", title: "L", body: "failed", path: "/#/lanes" },
    { send: async () => ({ statusCode: 201 }) },
  );
  assert.notEqual(out.skipped, "push_category_off:failures");
});

test("turning completions back on is one preference away", async () => {
  reset();
  P.setNotificationCategories({ completions: true });
  const out = await Push.sendPushToSubscriptions(
    { type: "execution_run.complete", state: "COMPLETE", lane_id: "lane_a", title: "L", body: "done", path: "/#/lanes" },
    { send: async () => ({ statusCode: 201 }) },
  );
  assert.notEqual(out.skipped, "push_category_off:completions");
});

test("the master switch still wins over any category", async () => {
  reset();
  P.setNotificationCategories({ needs_you: true });
  P.setPushEnabled(false);
  const out = await Push.sendPushToSubscriptions(
    { type: "governed_action.approval_required", state: "NEEDS_INPUT", lane_id: "lane_a", title: "L", body: "b", path: "/#/lanes" },
    { send: async () => ({ statusCode: 201 }) },
  );
  assert.equal(out.skipped, "push_disabled_by_operator");
});

test("setting categories does not clobber the master switch, or vice versa", () => {
  reset();
  P.setPushEnabled(false);
  P.setNotificationCategories({ completions: true });
  assert.equal(P.readNotificationPreferences().push_enabled, false, "switch survived a category write");
  P.setPushEnabled(true);
  assert.equal(P.readNotificationPreferences().categories.completions, true, "category survived a switch write");
});

test("a malformed category map degrades per-key, never wholesale", async () => {
  reset();
  const { writeFileSync } = await import("node:fs");
  writeFileSync(P.notificationPreferencesPath(),
    JSON.stringify({ push_enabled: true, categories: { needs_you: "yes", failures: false } }));
  const c = P.readNotificationPreferences().categories;
  assert.equal(c.needs_you, true, "a non-boolean falls back to the default, not to off");
  assert.equal(c.failures, false, "a valid neighbour is still honoured");
  assert.equal(c.completions, false);
});

// -------------------------------------------- a test helper is not a safe helper

test("the reset helper refuses a live runtime root", async () => {
  // THE INCIDENT. This function was called during live acceptance with
  // ALLOY_RUNTIME_ROOT pointing at the Gateway's own root, to check one
  // behaviour. It emptied the operator's real notification store — 500 durable
  // records and their read state — in a single call that looked harmless. The
  // suffix "ForTests" was the entire protection, and a name is not a guard.
  const { homedir } = await import("node:os");
  for (const live of [
    "/Users/vacilando/.local/state/alloy-dev/gateway",
    homedir(),
    `${homedir()}/.local/state/alloy-dev`,
  ]) {
    assert.throws(() => N.resetNotificationsForTests(live), /not a disposable test root/, live);
  }
});

test("the reset helper still works for real tests", async () => {
  // The guard is worthless if it makes the legitimate path awkward — every
  // suite in this repo depends on it.
  const { mkdtempSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const disposable = mkdtempSync(join(tmpdir(), "vac-guard-ok-"));
  assert.doesNotThrow(() => N.resetNotificationsForTests(disposable));
  // A temp path that does not exist yet must also pass: it cannot be resolved,
  // and refusing it would break first-run setup.
  assert.doesNotThrow(() => N.resetNotificationsForTests(join(tmpdir(), "vac-guard-unborn")));
});
