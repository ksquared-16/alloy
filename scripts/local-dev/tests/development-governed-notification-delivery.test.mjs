#!/usr/bin/env node
/**
 * A BUSY PANE IS NOT A DEAD LETTER.
 *
 * THE DEFECT. A lane files a governed action during its turn. The action is
 * decided, and Vacilando immediately tries to tell the lane by pasting into its
 * bound tmux pane — the same pane still executing the turn that filed it. So
 * `assessPanePromptReadiness` answers `busy`, delivery is refused
 * `provider_prompt_not_ready`, the refusal is written to `resume_delivery`, and
 * NOTHING EVER TRIES AGAIN. An executing lane structurally blocks delivery of
 * the outcome of the action it just requested.
 *
 * MEASURED on the live host: 37 of 62 failed governed actions carry
 * `resume_delivery.error = "provider_prompt_not_ready"`. Thirty-seven times a
 * lane asked for something and never found out what happened.
 *
 * WORTH STATING, because the symptom invites the wrong diagnosis: prompt
 * readiness never terminally failed an action. Across the whole store ZERO
 * records have `failure_code: provider_prompt_not_ready`. Every one of those 37
 * failed on its own merits first — repository_not_allowlisted,
 * query_hash_mismatch, execution_failed — and readiness only stopped the lane
 * being told. From inside the lane the messenger's failure is indistinguishable
 * from the action's, which is exactly why it read as one.
 *
 * These tests reproduce the original sequence deterministically: executing lane
 * -> governed action -> own pane busy -> deferred, not failed -> lane yields ->
 * pane ready -> delivered exactly once.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const D = await import("../lib/vacilando/governed-notification-delivery.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  D.resetRedeliveryStateForTests();
  D.resetDeliveryStoreForTests();
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** The refusal `sendLaneInstruction` returns for a pane mid-turn. */
const BUSY = { ok: false, error: "provider_prompt_not_ready", prompt_readiness: { state: "busy" } };
const READY = { ok: true, lane_id: "lane_x" };

/** A store of governed-action records, in the shape the real one holds. */
function fakeStore(records) {
  const byId = new Map(records.map((r) => [r.request_id, r]));
  const saves = [];
  const api = {
    get: (id) => byId.get(id) || null,
    list: () => [...byId.values()],
    save: (rec) => { byId.set(rec.request_id, rec); saves.push(rec.request_id); },
  };
  D.setDeliveryStoreForTests(api);
  return { byId, saves };
}
function record(id, over = {}) {
  return {
    request_id: id, lane_id: "lane_x", run_id: "erun_x",
    action_key: "repository.push", status: "failed", failure_code: "repository_not_allowlisted",
    ...over,
  };
}
const openLane = () => ({ lane: { lane_id: "lane_x", status: "ACTIVE" } });
const text = async () => "Governed action outcome.";

// ── the original failure, step by step ───────────────────────────────────────

await test("THE ORIGINAL FAILURE: busy own pane defers, it does NOT fail", () => {
  const rec = record("gar_1");
  // 1-4. lane executing, action created, its own pane not prompt-ready, delivery
  // encounters that state.
  const out = D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_failed" });
  // 5. the action does NOT become failed-for-delivery.
  assert.equal(out.state, D.DELIVERY_STATES.PENDING);
  assert.equal(out.reason, "busy");
  assert.equal(out.attempts, 1);
  assert.ok(out.first_deferred_at, "the deferral is dated so it can expire");
  assert.equal(out.delivered_at, null);
  // The governed action's own verdict is untouched — it failed for its own
  // reason, and the notification is a separate concern.
  assert.equal(rec.status, "failed");
  assert.equal(rec.failure_code, "repository_not_allowlisted");
});

await test("...then the lane yields, the pane is ready, and it is delivered", async () => {
  const rec = record("gar_1");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_failed" });
  fakeStore([rec]);
  // 6-8. lane yields; pane becomes prompt-ready; notification is delivered.
  const sent = [];
  const out = await D.redeliverGovernedNotification("gar_1", {
    send: (laneId, body, opts) => { sent.push({ laneId, body, opts }); return READY; },
    getLane: openLane, buildText: text,
  });
  assert.equal(out.ok, true);
  assert.equal(out.state, D.DELIVERY_STATES.DELIVERED);
  assert.equal(sent.length, 1, "exactly one delivery");
  assert.equal(sent[0].laneId, "lane_x");
  assert.equal(sent[0].opts.source, "governed_action_failed", "the SAME notification, not a new one");
  assert.equal(rec.notification_delivery.state, D.DELIVERY_STATES.DELIVERED);
  assert.ok(rec.notification_delivery.delivered_at);
});

await test("busy for several checks stays pending, and the attempt count grows", async () => {
  const rec = record("gar_2");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_resume" });
  fakeStore([rec]);
  for (let i = 0; i < 4; i++) {
    const out = await D.redeliverGovernedNotification("gar_2", {
      send: () => BUSY, getLane: openLane, buildText: text,
    });
    assert.equal(out.state, D.DELIVERY_STATES.PENDING, `attempt ${i + 2} must stay pending`);
  }
  assert.equal(rec.notification_delivery.attempts, 5);
  assert.equal(rec.notification_delivery.first_deferred_at,
    rec.notification_delivery.first_deferred_at, "the deferral keeps its original date");
});

// ── exactly once ─────────────────────────────────────────────────────────────

await test("EXACTLY ONCE: a delivered notification is never sent again", async () => {
  const rec = record("gar_3");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_resume" });
  fakeStore([rec]);
  const sent = [];
  const send = () => { sent.push(1); return READY; };
  await D.redeliverGovernedNotification("gar_3", { send, getLane: openLane, buildText: text });
  const second = await D.redeliverGovernedNotification("gar_3", { send, getLane: openLane, buildText: text });
  assert.equal(sent.length, 1, "one governed action, one notification");
  assert.equal(second.skipped, true);
  assert.equal(second.error, "not_pending");
});

await test("EXACTLY ONCE: two concurrent drains do not both send", async () => {
  // The run-terminal hook and the conductor tick can fire in the same instant.
  const rec = record("gar_4");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_resume" });
  fakeStore([rec]);
  const sent = [];
  const send = async () => { await new Promise((r) => setTimeout(r, 5)); sent.push(1); return READY; };
  const [a, b] = await Promise.all([
    D.redeliverGovernedNotification("gar_4", { send, getLane: openLane, buildText: text }),
    D.redeliverGovernedNotification("gar_4", { send, getLane: openLane, buildText: text }),
  ]);
  assert.equal(sent.length, 1, "the in-flight claim must stop the second send");
  assert.equal([a, b].filter((r) => r.skipped).length, 1);
  assert.equal(D.inFlightRedeliveries().length, 0, "the claim is always released");
});

await test("two actions requested in one turn are each delivered once", async () => {
  const a = record("gar_5a");
  const b = record("gar_5b", { action_key: "database.read_census", failure_code: "query_hash_mismatch" });
  D.recordDeliveryAttempt(a, BUSY, { kind: "governed_action_failed" });
  D.recordDeliveryAttempt(b, BUSY, { kind: "governed_action_failed" });
  fakeStore([a, b]);
  const sent = [];
  const out = await D.drainGovernedNotifications({
    laneId: "lane_x",
    send: (laneId, body, opts) => { sent.push(opts.source); return READY; },
    getLane: openLane, buildText: text,
  });
  assert.equal(out.considered, 2);
  assert.equal(out.delivered, 2);
  assert.equal(sent.length, 2, "two actions, two notifications — no more, no fewer");
  const again = await D.drainGovernedNotifications({
    laneId: "lane_x", send: () => { throw new Error("must not send"); },
    getLane: openLane, buildText: text,
  });
  assert.equal(again.considered, 0, "nothing is owed twice");
});

// ── permanent failure stays permanent ────────────────────────────────────────

await test("PERMANENT: an invalid or vanished target is not retried", () => {
  for (const error of ["lane_not_found", "invalid_lane_id", "missing_target", "target_mismatch",
    "pane_unavailable", "instruction_too_large", "cursor_delivery_unavailable", "delivery_failed"]) {
    const rec = record(`gar_p_${error}`);
    const out = D.recordDeliveryAttempt(rec, { ok: false, error }, { kind: "governed_action_failed" });
    assert.equal(out.state, D.DELIVERY_STATES.UNDELIVERABLE, error);
    assert.equal(out.reason, error);
  }
});

await test("PERMANENT: an unrecognised error fails closed rather than retrying forever", () => {
  const rec = record("gar_6");
  const out = D.recordDeliveryAttempt(rec, { ok: false, error: "something_new" }, { kind: "governed_action_resume" });
  assert.equal(out.state, D.DELIVERY_STATES.UNDELIVERABLE,
    "a stuck queue is worse than a reported dead end");
});

await test("PERMANENT: a pane that cannot be READ is not a busy pane", () => {
  // `capture_unavailable` means the screen could not be captured at all. A
  // vanished pane must not hold a deferral open for an hour.
  const rec = record("gar_7");
  const out = D.recordDeliveryAttempt(rec,
    { ok: false, error: "provider_prompt_not_ready", prompt_readiness: { state: "capture_unavailable" } },
    { kind: "governed_action_resume" });
  assert.equal(out.state, D.DELIVERY_STATES.UNDELIVERABLE);
  assert.equal(out.reason, "capture_unavailable");
});

await test("a lane that CLOSES while waiting stops waiting", async () => {
  const rec = record("gar_8");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_failed" });
  fakeStore([rec]);
  const out = await D.redeliverGovernedNotification("gar_8", {
    send: () => { throw new Error("must not send to a closed lane"); },
    getLane: () => ({ lane: { lane_id: "lane_x", status: "CLOSED" } }),
    buildText: text,
  });
  assert.equal(out.terminal, true);
  assert.equal(out.error, "lane_closed");
  assert.equal(rec.notification_delivery.state, D.DELIVERY_STATES.UNDELIVERABLE);
});

await test("a lane that no longer exists stops waiting", async () => {
  const rec = record("gar_9");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_failed" });
  fakeStore([rec]);
  const out = await D.redeliverGovernedNotification("gar_9", {
    send: () => { throw new Error("must not send"); },
    getLane: () => null, buildText: text,
  });
  assert.equal(out.error, "lane_not_found");
  assert.equal(rec.notification_delivery.state, D.DELIVERY_STATES.UNDELIVERABLE);
});

// ── bounded ──────────────────────────────────────────────────────────────────

await test("BOUNDED: redelivery gives up after a fixed number of attempts", () => {
  const rec = record("gar_10");
  let out;
  for (let i = 0; i < D.MAX_REDELIVERY_ATTEMPTS; i++) {
    out = D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_resume" });
  }
  assert.equal(out.state, D.DELIVERY_STATES.UNDELIVERABLE, "no infinite retries");
  assert.equal(out.reason, "max_attempts");
  assert.equal(out.attempts, D.MAX_REDELIVERY_ATTEMPTS);
});

await test("BOUNDED: redelivery gives up after a fixed window", () => {
  const t0 = Date.parse("2026-09-02T12:00:00.000Z");
  const rec = record("gar_11");
  D.recordDeliveryAttempt(rec, BUSY, { kind: "governed_action_resume", nowMs: t0 });
  const later = D.recordDeliveryAttempt(rec, BUSY, {
    kind: "governed_action_resume", nowMs: t0 + D.MAX_REDELIVERY_AGE_MS + 1,
  });
  assert.equal(later.state, D.DELIVERY_STATES.UNDELIVERABLE);
  assert.equal(later.reason, "window_expired");
});

// ── neighbouring conditions ──────────────────────────────────────────────────

await test("a DIFFERENT lane that is already prompt-ready delivers immediately", () => {
  const rec = record("gar_12", { lane_id: "lane_other" });
  const out = D.recordDeliveryAttempt(rec, READY, { kind: "governed_action_resume" });
  assert.equal(out.state, D.DELIVERY_STATES.DELIVERED);
  assert.equal(out.attempts, 1, "no deferral for a lane that was never busy");
  assert.ok(out.delivered_at);
  assert.equal(out.first_deferred_at, null);
});

await test("provider UNAVAILABLE is not the same as a pane merely busy", () => {
  const busy = D.classifyDeliveryOutcome(BUSY);
  const gone = D.classifyDeliveryOutcome({ ok: false, error: "pane_unavailable" });
  assert.equal(busy.temporary, true);
  assert.equal(gone.temporary, false);
  // A blocked pane (login/permission modal) is still recoverable — an operator
  // clears it — so it defers, bounded, rather than being discarded.
  const blocked = D.classifyDeliveryOutcome({
    ok: false, error: "provider_prompt_not_ready", prompt_readiness: { state: "blocked" },
  });
  assert.equal(blocked.temporary, true);
  assert.equal(blocked.reason, "blocked");
});

await test("an action already delivered is not reopened by a later busy signal", async () => {
  const rec = record("gar_13");
  D.recordDeliveryAttempt(rec, READY, { kind: "governed_action_resume" });
  fakeStore([rec]);
  const out = await D.redeliverGovernedNotification("gar_13", {
    send: () => { throw new Error("must not send"); }, getLane: openLane, buildText: text,
  });
  assert.equal(out.skipped, true);
  assert.equal(out.state, D.DELIVERY_STATES.DELIVERED);
});

await test("the pending list is ordered oldest-deferral-first", async () => {
  const t0 = Date.parse("2026-09-02T12:00:00.000Z");
  const a = record("gar_new"); const b = record("gar_old");
  D.recordDeliveryAttempt(a, BUSY, { kind: "governed_action_resume", nowMs: t0 + 60_000 });
  D.recordDeliveryAttempt(b, BUSY, { kind: "governed_action_resume", nowMs: t0 });
  fakeStore([a, b]);
  const due = await D.pendingNotificationDeliveries({});
  assert.deepEqual(due.map((r) => r.request_id), ["gar_old", "gar_new"]);
});

await test("the deferral is WIRED — both resume paths record it", () => {
  // Recording the outcome is what turns a discarded refusal into an owed
  // notification. If either path stops calling it, the defect returns silently.
  const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
  assert.match(src, /kind: "governed_action_failed"/, "the failure path must record its attempt");
  assert.match(src, /kind: "governed_action_resume"/, "the success path must too");
  assert.match(src, /drainGovernedNotificationsForLane/);
});

await test("redelivery is driven by the YIELD, not by a new scheduler", () => {
  // The lane's run reaching a terminal state is the canonical "I have finished".
  const run = readFileSync(new URL("../lib/vacilando/execution-run.mjs", import.meta.url), "utf8");
  assert.match(run, /TERMINAL_RUN_STATES\.includes\(to\)[\s\S]{0,200}drainGovernedNotificationsForLane/,
    "a terminal transition must drain what the lane is owed");
  // And the safety net rides the tick the server already owns.
  const server = readFileSync(new URL("../lib/vacilando-server.mjs", import.meta.url), "utf8");
  assert.match(server, /runConductor[\s\S]{0,1200}drainGovernedNotificationsForLane/,
    "the conductor tick is the safety net");
  assert.ok(!/setInterval\([^)]*drainGovernedNotifications/.test(server),
    "no second scheduler may be introduced for this");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
