#!/usr/bin/env node
/**
 * One operator prompt, one notification — and the ordering that surrounds it.
 *
 * THREE MEASURED DEFECTS THIS SUITE PINS DOWN.
 *
 * 1. Deduplication was keyed on `${run_id}:${state}`, a per-TRANSITION key. A
 *    prompt that reached NEEDS_INPUT and later COMPLETE paged the operator
 *    twice for one question; 8 runs on this host did exactly that.
 * 2. The dedupe marker was written only when `sent > 0`, so every failed
 *    delivery left no memory and re-fired on the next transition — and the
 *    failure path was the common one (30 of 93 dispatches).
 * 3. Lane recency included `observed_at`, which discovery stamps on every poll.
 *    Two polls three seconds apart, with nothing happening, changed it on 8 of
 *    8 live lanes, so background polling silently reshuffled the list.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const ROOT = mkdtempSync(join(tmpdir(), "vac-notif-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const N = await import("../lib/vacilando/lane-notifications.mjs");
const {
  applyAppBadge,
  laneActivityMs,
  laneUnseenCount,
  renderUnseenIndicator,
  renderLaneList,
  sortLanesForIndex,
  groupLanesByFolder,
} = await import("../apps/vacilando/public/gateway-view.mjs");

const run = (id, state, extra = {}) => ({ run_id: id, lane_id: "lane_a", state, ...extra });
const reset = () => N.resetNotificationsForTests();

// ------------------------------------------------- one prompt, one notification

test("a prompt notifies once, on its first qualifying condition", () => {
  reset();
  const a = N.recordRunNotification(run("erun_1", "NEEDS_INPUT", { state_reason: "Which port?" }), { laneName: "Surfaces" });
  assert.equal(a.created, true);
  assert.equal(a.record.event_type, "needs_input");
  assert.equal(a.record.summary, "Which port?");
  assert.equal(N.unseenNotificationCount(), 1);
});

test("NEEDS_INPUT then COMPLETE is ONE notification, not two", () => {
  // The exact live sequence of erun_0a749119d8f48a77.
  reset();
  assert.equal(N.recordRunNotification(run("erun_2", "NEEDS_INPUT")).created, true);
  const later = N.recordRunNotification(run("erun_2", "COMPLETE"));
  assert.equal(later.created, false);
  assert.equal(later.duplicate, true);
  assert.equal(N.unseenNotificationCount(), 1);
  // The record keeps the condition it first reported, not the last one seen.
  assert.equal(N.notificationForRun("erun_2").state, "NEEDS_INPUT");
});

test("replayed and repeated qualifying events never duplicate", () => {
  reset();
  for (let i = 0; i < 6; i += 1) N.recordRunNotification(run("erun_3", "COMPLETE"));
  assert.equal(N.unseenNotificationCount(), 1);
  assert.equal(N.listNotifications().length, 1);
});

test("in-flight states are not operator-relevant and notify nothing", () => {
  reset();
  for (const st of ["QUEUED", "EXECUTING", "VALIDATING", "WAITING_RESOURCE", "RECOVERING"]) {
    const out = N.recordRunNotification(run(`erun_${st}`, st));
    assert.equal(out.created, false, `${st} must not notify`);
    assert.equal(out.skipped, "not_operator_relevant");
  }
  assert.equal(N.unseenNotificationCount(), 0);
});

test("a prompt that never reaches a qualifying condition never notifies", () => {
  reset();
  N.recordRunNotification(run("erun_quiet", "EXECUTING"));
  assert.equal(N.notificationForRun("erun_quiet"), null);
});

test("two different prompts in one lane each notify once", () => {
  reset();
  N.recordRunNotification(run("erun_a", "NEEDS_INPUT"), { laneName: "Surfaces" });
  N.recordRunNotification(run("erun_b", "COMPLETE"), { laneName: "Surfaces" });
  assert.equal(N.unseenNotificationCount(), 2);
  assert.deepEqual(N.unseenCountByLane(), { lane_a: 2 });
});

test("each qualifying state maps to its own event type", () => {
  reset();
  const seen = {};
  for (const st of N.NOTIFY_STATES) {
    const out = N.recordRunNotification(run(`erun_${st}`, st));
    seen[st] = out.record.event_type;
  }
  assert.deepEqual(seen, {
    NEEDS_INPUT: "needs_input", COMPLETE: "complete", FAILED: "failed", ABANDONED: "abandoned",
  });
});

// ------------------------------------------------------------ content + target

test("a notification names the lane and links to it, never a raw id", () => {
  reset();
  const out = N.recordRunNotification(
    run("erun_n", "NEEDS_INPUT", { agent_report: { message: "## Heading\nWhich ingress should I use?" } }),
    { laneName: "Communications" },
  );
  const rec = N.publicNotification(out.record);
  assert.equal(rec.lane_name, "Communications");
  assert.equal(rec.summary, "Which ingress should I use?", "the agent's own words, not a template");
  assert.equal(rec.path, "/#/lanes/lane_a");
  assert.ok(rec.created_at);
  assert.equal(rec.seen, false);
});

test("a notification body is plain text, never raw markdown", () => {
  // Observed in a real delivery from this very change: the body read
  // "**The attached logo never arrived.** The run record carries…" — a system
  // notification renders no markdown, so the syntax has to be stripped, not
  // just the leading bullet and heading markers.
  reset();
  const out = N.recordRunNotification(run("erun_md", "COMPLETE", {
    agent_report: { message: "**Bold** lead with `code`, *emphasis* and [a link](https://example.com)" },
  }));
  assert.equal(out.record.summary, "Bold lead with code, emphasis and a link");
  assert.equal(/[*`\[\]]/.test(out.record.summary), false, "no markdown syntax survives");
});

test("the agent's own report outranks the generic state reason", () => {
  reset();
  const out = N.recordRunNotification(run("erun_p", "COMPLETE", {
    state_reason: "done",
    agent_report: { message: "- Promoted PR #501 to staging" },
  }));
  assert.equal(out.record.summary, "Promoted PR #501 to staging");
});

// ------------------------------------------------------------- delivery is not truth

test("a failed delivery keeps the record and does not license a second one", () => {
  reset();
  const out = N.recordRunNotification(run("erun_d", "COMPLETE"));
  N.recordNotificationDelivery(out.record.notification_id, { sent: 0, error: "web_push_unavailable" });
  const rec = N.notificationForRun("erun_d");
  assert.equal(rec.delivery.attempted, true);
  assert.equal(rec.delivery.sent, 0);
  assert.equal(rec.delivery.error, "web_push_unavailable");
  assert.equal(rec.seen_at, null, "still owed to the operator");
  assert.equal(N.unseenNotificationCount(), 1, "and still counted, so the badge shows it");
  assert.equal(N.recordRunNotification(run("erun_d", "COMPLETE")).created, false);
});

// -------------------------------------------------------------- seen / unseen

test("unseen count increments and decrements against the canonical store", () => {
  reset();
  N.recordRunNotification(run("erun_s1", "COMPLETE"), { laneName: "A" });
  N.recordRunNotification(run("erun_s2", "FAILED"), { laneName: "A" });
  assert.equal(N.unseenNotificationCount(), 2);
  const one = N.markNotificationSeen(N.notificationForRun("erun_s1").notification_id);
  assert.equal(one.unseen_count, 1);
  assert.equal(N.markAllNotificationsSeen().unseen_count, 0);
});

test("opening a lane marks that lane's notifications seen and no others", () => {
  reset();
  N.recordRunNotification({ run_id: "e1", lane_id: "lane_x", state: "COMPLETE" });
  N.recordRunNotification({ run_id: "e2", lane_id: "lane_y", state: "COMPLETE" });
  const out = N.markLaneNotificationsSeen("lane_x");
  assert.equal(out.marked.length, 1);
  assert.equal(out.unseen_count, 1);
  assert.deepEqual(N.unseenCountByLane(), { lane_y: 1 });
});

test("read state survives a reopen of the store", () => {
  reset();
  N.recordRunNotification(run("erun_r", "COMPLETE"));
  N.markLaneNotificationsSeen("lane_a");
  // Re-read from disk exactly as a restarted app would.
  assert.equal(N.readNotificationStore().notifications[0].seen_at !== null, true);
  assert.equal(N.unseenNotificationCount(), 0);
});

test("marking an unknown notification is a clean 404, not a crash", () => {
  reset();
  assert.equal(N.markNotificationSeen("ntf_nope").error, "notification_not_found");
});

// ------------------------------------------------------------------ app badge

test("the app badge equals the canonical unseen count", () => {
  const calls = [];
  const nav = { setAppBadge: (n) => calls.push(["set", n]), clearAppBadge: () => calls.push(["clear"]) };
  assert.deepEqual(applyAppBadge(3, nav), { supported: true, applied: true, value: 3 });
  assert.deepEqual(calls, [["set", 3]]);
});

test("the badge CLEARS at zero rather than setting zero", () => {
  // setAppBadge(0) shows a bare dot on some platforms instead of removing it.
  const calls = [];
  const nav = { setAppBadge: (n) => calls.push(["set", n]), clearAppBadge: () => calls.push(["clear"]) };
  const out = applyAppBadge(0, nav);
  assert.equal(out.cleared, true);
  assert.deepEqual(calls, [["clear"]]);
});

test("an unsupported badge API fails safely and reports it", () => {
  const out = applyAppBadge(4, {});
  assert.deepEqual(out, { supported: false, applied: false, value: 4, reason: "unsupported" });
});

test("a badge API that throws does not propagate", () => {
  const nav = { setAppBadge: () => { throw new Error("not allowed"); } };
  const out = applyAppBadge(2, nav);
  assert.equal(out.applied, false);
  assert.equal(out.reason, "threw");
});

test("no navigator at all is handled", () => {
  assert.equal(applyAppBadge(1, null).supported, false);
});

// ------------------------------------------------------- lane list indicators

test("a lane row shows its unseen count from canonical state", () => {
  const html = renderLaneList([{ lane_id: "lane_a", label: "Surfaces", unseen_notifications: 2 }], null, {});
  assert.ok(html.includes('data-gw-unseen="2"'));
  assert.ok(html.includes("has-unseen"));
});

test("a lane with nothing unseen shows no indicator", () => {
  assert.equal(renderUnseenIndicator({ lane_id: "x" }), "");
  assert.equal(laneUnseenCount({ unseen_notifications: 0 }), 0);
  const html = renderLaneList([{ lane_id: "lane_a", label: "Surfaces" }], null, {});
  assert.equal(html.includes("data-gw-unseen"), false);
});

test("the indicator carries an accessible label, not a bare number", () => {
  assert.ok(renderUnseenIndicator({ unseen_notifications: 1 }).includes("1 unread update"));
  assert.ok(renderUnseenIndicator({ unseen_notifications: 3 }).includes("3 unread updates"));
});

test("a collapsed folder still reports unread beneath it", () => {
  const lanes = [{ lane_id: "l1", label: "A", folder_id: "f1", unseen_notifications: 2 }];
  const groups = groupLanesByFolder(lanes, [{ folder_id: "f1", name: "Platform" }], { collapsed: new Set(["f1"]) });
  const g = groups.find((x) => x.folder_id === "f1");
  assert.equal(g.unseen, 2);
  const html = renderLaneList(lanes, null, {
    folders: [{ folder_id: "f1", name: "Platform" }],
    collapsedFolders: new Set(["f1"]),
  });
  assert.equal(html.includes('data-gw-unseen'), false, "the row is collapsed away");
  assert.ok(html.includes("2 unread"), "but the header still says so");
});

// ---------------------------------------------------------------- lane ordering

const t = (s) => new Date(`2026-08-23T${s}Z`).toISOString();

test("lanes order by most recent meaningful activity, newest first", () => {
  const lanes = [
    { lane_id: "old", label: "Old", execution_run: { state: "COMPLETE", updated_at: t("10:00:00") } },
    { lane_id: "new", label: "New", execution_run: { state: "COMPLETE", updated_at: t("12:00:00") } },
    { lane_id: "mid", label: "Mid", execution_run: { state: "COMPLETE", updated_at: t("11:00:00") } },
  ];
  assert.deepEqual(sortLanesForIndex(lanes).map((l) => l.lane_id), ["new", "mid", "old"]);
});

test("polling does NOT reorder lanes", () => {
  // observed_at is the discovery stamp: it changed on 8 of 8 live lanes between
  // two idle polls, which is precisely why it must not count as activity.
  const mk = (id, activity, observed) => ({
    lane_id: id, label: id,
    execution_run: { state: "COMPLETE", updated_at: activity },
    observed_at: observed,
  });
  const poll1 = [mk("a", t("10:00:00"), t("12:00:00")), mk("b", t("11:00:00"), t("12:00:00"))];
  const poll2 = [mk("a", t("10:00:00"), t("12:00:05")), mk("b", t("11:00:00"), t("12:00:04"))];
  assert.deepEqual(sortLanesForIndex(poll1).map((l) => l.lane_id), ["b", "a"]);
  assert.deepEqual(sortLanesForIndex(poll2).map((l) => l.lane_id), ["b", "a"], "order survives a poll");
  assert.equal(laneActivityMs(poll2[0]), Date.parse(t("10:00:00")), "observed_at is not activity");
});

test("a heartbeat-only lane has no activity at all", () => {
  assert.equal(laneActivityMs({ lane_id: "x", observed_at: t("12:00:00") }), 0);
});

test("each kind of meaningful activity moves a lane", () => {
  const base = { lane_id: "x", label: "x" };
  assert.equal(laneActivityMs({ ...base, last_instruction: { at: t("09:00:00") } }), Date.parse(t("09:00:00")));
  assert.equal(laneActivityMs({ ...base, last_activity_ms: Date.parse(t("09:30:00")) }), Date.parse(t("09:30:00")));
  assert.equal(
    laneActivityMs({ ...base, execution_run: { latest_progress: { at: t("10:15:00") } } }),
    Date.parse(t("10:15:00")),
  );
  assert.equal(
    laneActivityMs({ ...base, execution_run: { last_worker_report_at: t("10:45:00") } }),
    Date.parse(t("10:45:00")),
  );
});

test("branch behind/ahead state is not activity", () => {
  const behind = { lane_id: "x", label: "x", git: { behind: 400, ahead: 12, last_commit_at: t("23:00:00") } };
  assert.equal(laneActivityMs(behind), 0);
});

test("ties break deterministically and stably", () => {
  const same = t("10:00:00");
  const mk = (id, label) => ({ lane_id: id, label, execution_run: { state: "COMPLETE", updated_at: same } });
  const a = sortLanesForIndex([mk("z", "Zulu"), mk("a", "Alpha"), mk("m", "Mike")]);
  const b = sortLanesForIndex([mk("m", "Mike"), mk("z", "Zulu"), mk("a", "Alpha")]);
  assert.deepEqual(a.map((l) => l.lane_id), b.map((l) => l.lane_id), "input order cannot change output");
  assert.deepEqual(a.map((l) => l.lane_id), ["a", "m", "z"]);
});

test("attention still outranks recency", () => {
  // A lane that needs the operator does not fall below a newer idle lane.
  const needs = {
    lane_id: "needs", label: "Needs",
    execution_run: { state: "NEEDS_INPUT", updated_at: t("09:00:00"), state_reason: "?" },
  };
  const idle = { lane_id: "idle", label: "Idle", execution_run: { state: "COMPLETE", updated_at: t("18:00:00") } };
  assert.equal(sortLanesForIndex([idle, needs])[0].lane_id, "needs");
});
