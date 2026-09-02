#!/usr/bin/env node
/**
 * ONE CANONICAL NOTIFICATION COUNT.
 *
 * WHAT WAS WRONG. Vacilando had TWO durable notification stores and THREE
 * independent counts.
 *
 *   vacilando/notifications.json         run notifications, with read state,
 *                                        deduped per run — but never UPDATED,
 *                                        so a run that went NEEDS_INPUT and
 *                                        then COMPLETE kept an actionable
 *                                        notification forever.
 *   vacilando/notifications/events.jsonl governed-action events, append-only,
 *                                        no read state, no dedupe. One decision
 *                                        emitted requested / approved /
 *                                        executing / complete as four unrelated
 *                                        records, and `governed_action_approval_required`
 *                                        was emitted from three separate sites.
 *
 * And the badge counted "records with no seen_at" — a count of unread HISTORY,
 * not of things needing attention.
 *
 * THE CONTRACT NOW. One store, one subject key per decision, one class
 * vocabulary (actionable / informational / resolved / superseded), and one
 * count rule: actionable, or informational and unread. Everything else is zero.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-notify-count-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const N = await import("../lib/vacilando/lane-notifications.mjs");
const {
  upsertNotification,
  canonicalNotificationCount,
  actionableNotificationCount,
  notificationCounts,
  unseenNotificationCount,
  unseenCountByLane,
  listNotifications,
  markNotificationSeen,
  recordRunNotification,
  classForRunState,
  classForGovernedStatus,
  countsForAttention,
  resetNotificationsForTests,
} = N;

let pass = 0;
let fail = 0;
function test(name, fn) {
  resetNotificationsForTests(ROOT);
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const opts = { root: ROOT };

function approval(id, { status = "awaiting_operator", lane = "lane_a" } = {}) {
  return upsertNotification({
    subjectKey: `governed:${id}`,
    requestId: id,
    laneId: lane,
    eventType: "governed_action_approval_required",
    state: status,
    attentionClass: classForGovernedStatus(status),
    summary: `Merge PR for ${id}`,
    ...opts,
  });
}

// --------------------------------------------------------------- badge counts

test("badge counts 0, 1 and 5", () => {
  assert.equal(canonicalNotificationCount(ROOT), 0, "an empty store must be zero");
  approval("gar_1");
  assert.equal(canonicalNotificationCount(ROOT), 1);
  for (const i of [2, 3, 4, 5]) approval(`gar_${i}`);
  assert.equal(canonicalNotificationCount(ROOT), 5);
});

test("resolving one item decrements immediately", () => {
  const a = approval("gar_1");
  approval("gar_2");
  assert.equal(canonicalNotificationCount(ROOT), 2);
  markNotificationSeen(a.record.notification_id, opts);
  assert.equal(canonicalNotificationCount(ROOT), 1, "seen items stop counting at once");
});

test("a duplicated governed request does not double-count", () => {
  // The same decision notified from three different sites, as the runtime does.
  approval("gar_dup");
  approval("gar_dup");
  approval("gar_dup");
  assert.equal(canonicalNotificationCount(ROOT), 1, "one decision is one notification");
  assert.equal(listNotifications({ root: ROOT }).length, 1);
});

test("a superseded request disappears from the actionable count", () => {
  approval("gar_sup");
  assert.equal(actionableNotificationCount(ROOT), 1);
  approval("gar_sup", { status: "superseded" });
  assert.equal(actionableNotificationCount(ROOT), 0);
  assert.equal(canonicalNotificationCount(ROOT), 0, "superseded never counts");
});

test("an auto-authorized merge in progress raises no approval badge", () => {
  // The whole point of mission-delegated authority: executing is informational.
  approval("gar_auto", { status: "executing" });
  assert.equal(actionableNotificationCount(ROOT), 0, "executing must not ask for a click");
  const counts = notificationCounts(ROOT);
  assert.equal(counts.actionable, 0);
  assert.equal(counts.informational, 1, "it is still visible, just not a demand");
});

test("a failed auto-authorized action becomes actionable again", () => {
  const a = approval("gar_fail", { status: "executing" });
  markNotificationSeen(a.record.notification_id, opts);
  assert.equal(canonicalNotificationCount(ROOT), 0, "an acknowledged informational item is quiet");
  approval("gar_fail", { status: "failed" });
  assert.equal(actionableNotificationCount(ROOT), 1, "a failure needs the operator again");
  const rec = listNotifications({ root: ROOT })[0];
  assert.equal(rec.seen, false, "becoming actionable again returns it to unread");
});

test("an acknowledged item does not resurface on an informational update", () => {
  const a = approval("gar_quiet");
  markNotificationSeen(a.record.notification_id, opts);
  approval("gar_quiet", { status: "executing" });
  approval("gar_quiet", { status: "complete" });
  assert.equal(canonicalNotificationCount(ROOT), 0, "only re-actionability un-reads an item");
});

// ------------------------------------------------------- run notifications

test("a run that completes stops asking for attention", () => {
  // The measured defect: NEEDS_INPUT then COMPLETE left an actionable record.
  const run = { run_id: "erun_1", lane_id: "lane_a", state: "NEEDS_INPUT", state_reason: "answer me" };
  recordRunNotification(run, { laneName: "Lane A", ...opts });
  assert.equal(actionableNotificationCount(ROOT), 1);
  recordRunNotification({ ...run, state: "COMPLETE" }, { laneName: "Lane A", ...opts });
  assert.equal(actionableNotificationCount(ROOT), 0, "the question was answered");
  assert.equal(listNotifications({ root: ROOT }).length, 1, "still one notification per prompt");
  assert.equal(canonicalNotificationCount(ROOT), 1, "unread completion is informational, still counted");
});

test("one prompt is still one notification, and the first page is the only page", () => {
  const run = { run_id: "erun_2", lane_id: "lane_a", state: "NEEDS_INPUT" };
  const first = recordRunNotification(run, opts);
  assert.equal(first.created, true);
  const second = recordRunNotification({ ...run, state: "COMPLETE" }, opts);
  assert.equal(second.created, false, "a transition must not page the operator twice");
  assert.equal(second.duplicate, true);
});

test("a completion notification cannot precede the canonical state", () => {
  // The class is derived from the run's own durable state, never from an
  // intermediate event, so an EXECUTING run has no completion notification.
  assert.equal(classForRunState("EXECUTING"), null);
  const out = recordRunNotification({ run_id: "erun_3", lane_id: "lane_a", state: "EXECUTING" }, opts);
  assert.equal(out.created, false);
  assert.equal(out.skipped, "not_operator_relevant");
  assert.equal(canonicalNotificationCount(ROOT), 0);
  // Governed actions hold the same rule: only a committed status classifies.
  assert.equal(classForGovernedStatus("executing"), "informational");
  assert.equal(classForGovernedStatus("complete"), "informational");
  assert.equal(classForGovernedStatus("awaiting_operator"), "actionable");
});

// ------------------------------------------------------------ one owner

test("every surface reads one number", () => {
  approval("gar_a", { lane: "lane_a" });
  approval("gar_b", { lane: "lane_b" });
  const run = { run_id: "erun_9", lane_id: "lane_a", state: "NEEDS_INPUT" };
  recordRunNotification(run, opts);
  const badge = canonicalNotificationCount(ROOT);
  assert.equal(unseenNotificationCount(ROOT), badge, "the retained name must delegate");
  const byLane = unseenCountByLane(ROOT);
  assert.equal(Object.values(byLane).reduce((a, b) => a + b, 0), badge, "per-lane must sum to the badge");
  const counts = notificationCounts(ROOT);
  assert.equal(counts.total, badge, "the breakdown must total the badge");
  assert.equal(counts.actionable + counts.informational, badge);
  const attention = listNotifications({ attentionOnly: true, root: ROOT });
  assert.equal(attention.length, badge, "the attention list must match the badge exactly");
});

test("the drawer may show history while the badge shows only attention", () => {
  const a = approval("gar_hist");
  markNotificationSeen(a.record.notification_id, opts);
  approval("gar_hist", { status: "complete" });
  assert.equal(canonicalNotificationCount(ROOT), 0, "nothing needs attention");
  assert.equal(listNotifications({ root: ROOT }).length, 1, "history is still readable");
});

test("the projection carries the class so no surface re-derives it", () => {
  approval("gar_proj");
  const rec = listNotifications({ root: ROOT })[0];
  assert.equal(rec.attention_class, "actionable");
  assert.equal(rec.counts_for_attention, true);
  assert.equal(rec.subject_key, "governed:gar_proj");
  assert.equal(rec.request_id, "gar_proj");
});

test("restart reconstructs the same count from durable truth", () => {
  approval("gar_r1");
  approval("gar_r2", { status: "executing" });
  const run = { run_id: "erun_r", lane_id: "lane_a", state: "NEEDS_INPUT" };
  recordRunNotification(run, opts);
  const before = canonicalNotificationCount(ROOT);
  // A reconnect re-reads the store from disk; nothing is held in memory.
  const after = canonicalNotificationCount(ROOT);
  assert.equal(after, before);
  assert.equal(before, 3);
});

test("an unknown class is refused rather than silently counted", () => {
  const out = upsertNotification({ subjectKey: "governed:x", eventType: "t", attentionClass: "urgent", ...opts });
  assert.equal(out.ok, false);
  assert.equal(out.error, "invalid_attention_class");
  assert.equal(canonicalNotificationCount(ROOT), 0);
  assert.equal(countsForAttention(null), false);
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
