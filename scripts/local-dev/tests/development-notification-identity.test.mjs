#!/usr/bin/env node
/**
 * What a notification says it is about, and whether it was worth sending.
 *
 * TWO OPERATOR REPORTS, ONE EMIT PATH.
 *
 * "The notifications on my phone show the lane id instead of the lane name."
 * The governed emit site passed `laneId` and no `laneName`, and
 * `upsertNotification` falls back to the id — so every governed record stored
 * `lane_2cea84351d90` where a name belongs, and the push title, which reads
 * `record.lane_name || record.lane_id`, put that id on the lock screen.
 * Measured on this host: 22 of 74 live records carried an id, every one of them
 * from that path. The run-outcome path already resolved the durable lane.
 *
 * "Sometimes notifications come through but there's nothing to do and nothing
 * completed." Two causes, both here:
 *
 *   · The push guard was `created || record.seen_at === null`. `seen_at` is
 *     null for every UNREAD record, so each routine progress event on an unread
 *     approval pushed again — "Worker resumed", which asks nothing and reports
 *     nothing finished. Observed: 10 such records, all with delivery attempted.
 *
 *   · `existing.event_type = eventType` let a routine event rename the record
 *     it was only meant to settle, so an approval became "Worker resumed" in
 *     the operator's own list.
 *
 * Routine progress must still RESOLVE a record — that is what stops a finished
 * approval sitting in Needs You forever — so the fix is narrower than
 * suppression: it may change the class, and it may not change the identity or
 * raise a push.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-ident-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const N = await import("../lib/vacilando/lane-notifications.mjs");
const P = await import("../lib/vacilando/lane-push.mjs");

const reset = () => N.resetNotificationsForTests(ROOT);
/** The guard the governed emit site applies before announcing anything. */
const wouldPush = (r) => Boolean(r?.record && (r.created || r.becameActionable));

const approval = (extra = {}) => ({
  subjectKey: "governed:g1", requestId: "g1", laneId: "lane_2cea84351d90",
  eventType: "governed_action_approval_required", attentionClass: "actionable",
  summary: "approve the push", root: ROOT, ...extra,
});
const routine = (extra = {}) => ({
  subjectKey: "governed:g1", requestId: "g1", laneId: "lane_2cea84351d90",
  eventType: "governed_action_worker_resumed", attentionClass: "informational",
  createIfMissing: false, summary: "Worker resumed", root: ROOT, ...extra,
});

// ------------------------------------------------------------------- identity

test("a governed record stores the lane's NAME when one is supplied", () => {
  reset();
  const out = N.upsertNotification(approval({ laneName: "Trust Runtime" }));
  assert.equal(out.record.lane_name, "Trust Runtime");
});

test("a record that learns its name later adopts it", () => {
  // The governed path historically supplied none, so records already in the
  // store carry ids. An update that knows the name should fix them in place
  // rather than leave them an id until they age out.
  reset();
  const first = N.upsertNotification(approval());
  assert.equal(first.record.lane_name, "lane_2cea84351d90", "reproduces the reported state");
  const second = N.upsertNotification(approval({ laneName: "Trust Runtime" }));
  assert.equal(second.record.lane_name, "Trust Runtime");
});

test("routine progress may not rename the record it settles", () => {
  reset();
  N.upsertNotification(approval({ laneName: "Trust Runtime" }));
  const out = N.upsertNotification(routine({ laneName: "Trust Runtime" }));
  assert.equal(out.record.event_type, "governed_action_approval_required");
  assert.equal(out.record.summary, "approve the push",
    "the operator's item still describes the decision, not the worker");
});

test("routine progress DOES still resolve the record", () => {
  // The narrower fix must not reintroduce the stale Needs You item: a finished
  // approval has to stop demanding attention.
  reset();
  N.upsertNotification(approval({ laneName: "Trust Runtime" }));
  assert.equal(N.actionableNotificationCount(ROOT), 1);
  N.upsertNotification(routine({ laneName: "Trust Runtime" }));
  assert.equal(N.readNotificationStore(ROOT).notifications[0].attention_class, "informational");
  assert.equal(N.actionableNotificationCount(ROOT), 0, "it no longer asks for the operator");
});

// -------------------------------------------------------------- worth sending

test("opening a demand is worth a push", () => {
  reset();
  assert.equal(wouldPush(N.upsertNotification(approval({ laneName: "Trust Runtime" }))), true);
});

test("routine progress on an UNREAD demand is not", () => {
  // The reported symptom. `seen_at === null` is true of every unread record,
  // so the old guard pushed on every routine event until someone read it.
  reset();
  N.upsertNotification(approval({ laneName: "Trust Runtime" }));
  const out = N.upsertNotification(routine({ laneName: "Trust Runtime" }));
  assert.equal(out.record.seen_at, null, "still unread — the old guard's trigger");
  assert.equal(wouldPush(out), false);
});

test("routine progress with no record at all opens nothing and sends nothing", () => {
  reset();
  const out = N.upsertNotification(routine());
  assert.equal(out.skipped, "routine_progress");
  assert.equal(wouldPush(out), false);
  assert.equal(N.readNotificationStore(ROOT).notifications.length, 0);
});

test("becoming actionable AGAIN is worth a push", () => {
  // A failure after an approval is a new demand, not noise.
  reset();
  N.upsertNotification(approval({ laneName: "Trust Runtime" }));
  N.upsertNotification(routine({ laneName: "Trust Runtime" }));
  const failed = N.upsertNotification(approval({
    eventType: "governed_action_failed", attentionClass: "actionable",
    summary: "merge failed", laneName: "Trust Runtime",
  }));
  assert.equal(failed.becameActionable, true);
  assert.equal(wouldPush(failed), true);
});

// ------------------------------------------------------------- the push title

test("a push title is never a lane id", () => {
  // Belt and braces for records written before the emit path learned the name:
  // the title resolves the durable lane, and failing that says something a
  // person can read rather than shipping the id to a lock screen.
  for (const title of ["lane_2cea84351d90", undefined, ""]) {
    const payload = P.outcomePushPayload({ lane_id: "lane_2cea84351d90", title, state: "COMPLETE", root: ROOT });
    assert.doesNotMatch(payload.title, /^lane_[a-f0-9]{12}$/, `title was ${payload.title}`);
    assert.ok(payload.title.length > 0);
  }
});

test("a real name passes through untouched", () => {
  const payload = P.outcomePushPayload({ lane_id: "lane_2cea84351d90", title: "Trust Runtime", state: "COMPLETE", root: ROOT });
  assert.equal(payload.title, "Trust Runtime");
});
