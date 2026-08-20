#!/usr/bin/env node
/**
 * Outcome-driven Web Push: one push per COMPLETE / NEEDS_INPUT / FAILED
 * per run per device. Ordinary resource/continuation events emit none.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  createQueuedRun,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  assertSafePushPayload,
  hasPushedRunOutcome,
  outcomePushPayload,
  publicPushConfig,
  pushRunOutcome,
  savePushSubscription,
} from "../lib/vacilando/lane-push.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const WT = "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function root() {
  const r = mkdtempSync(join(tmpdir(), "vac-push-out-"));
  process.env.ALLOY_RUNTIME_ROOT = r;
  resetExecutionRunsForTests(r);
  return r;
}

function sub(r) {
  savePushSubscription({ endpoint: "https://push.example/live", keys: { p256dh: "p", auth: "s" } }, { root: r });
}

await test("COMPLETE / NEEDS_INPUT / FAILED each emit one safe push", async () => {
  const r = root();
  sub(r);
  const created = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: r });
  const id = created.run.run_id;
  transitionExecutionRun(id, "EXECUTING", { root: r });
  const sent = [];
  const send = async (_sub, payload) => { sent.push(payload); };

  const waiting = await pushRunOutcome(
    { run_id: id, lane_id: "alloy-identity", state: "WAITING_RESOURCE" },
    { label: "Communications", root: r, send },
  );
  assert.equal(waiting.skipped, "not_outcome");
  assert.equal(sent.length, 0);

  const need = await pushRunOutcome(
    { run_id: id, lane_id: "alloy-identity", state: "NEEDS_INPUT", state_reason: "Which ingress?" },
    { label: "Communications", root: r, send },
  );
  assert.equal(need.sent, 1);
  assert.equal(sent[0].state, "NEEDS_INPUT");
  assert.match(sent[0].body, /needs your input/);
  assert.match(sent[0].body, /Which ingress/);
  assert.equal(sent[0].path, "/#/lanes/alloy-identity");
  assert.equal(assertSafePushPayload(sent[0]), true);
  assert.equal(sent[0].instruction, undefined);
  assert.equal(sent[0].output, undefined);
  assert.equal(sent[0].token, undefined);

  const needAgain = await pushRunOutcome(
    { run_id: id, lane_id: "alloy-identity", state: "NEEDS_INPUT", state_reason: "Which ingress?" },
    { label: "Communications", root: r, send },
  );
  assert.equal(needAgain.skipped, "duplicate_outcome");
  assert.equal(sent.length, 1);

  transitionExecutionRun(id, "EXECUTING", { root: r, origin: "operator" });
  const complete = await pushRunOutcome(
    { run_id: id, lane_id: "alloy-identity", state: "COMPLETE" },
    { label: "Communications", root: r, send },
  );
  assert.equal(complete.sent, 1);
  assert.equal(sent[1].body, "Work complete and ready for review.");
  assert.equal(sent[1].title, "Communications");

  const failed = await pushRunOutcome(
    { run_id: `${id}-other`, lane_id: "alloy-identity", state: "FAILED" },
    { label: "Communications", root: r, send },
  );
  assert.equal(failed.sent, 1);
  assert.equal(sent[2].body, "could not continue.");
  assert.equal(hasPushedRunOutcome(id, "COMPLETE", r), true);
});

await test("ABANDONED and resource events do not push", async () => {
  const r = root();
  sub(r);
  const sent = [];
  const send = async (_sub, payload) => { sent.push(payload); };
  await pushRunOutcome({ run_id: "erun_x", lane_id: "alloy-identity", state: "ABANDONED" }, { root: r, send });
  await pushRunOutcome({ run_id: "erun_x", lane_id: "alloy-identity", state: "QUEUED" }, { root: r, send });
  await pushRunOutcome({ run_id: "erun_x", lane_id: "alloy-identity", state: "RECOVERING" }, { root: r, send });
  assert.equal(sent.length, 0);
  const payload = outcomePushPayload({ lane_id: "lane_336af3bdc474", title: "Communications", state: "COMPLETE" });
  assert.equal(payload.path, "/#/lanes/lane_336af3bdc474");
  assert.equal(payload.type, "execution_run.complete");
});

await test("public push config never exposes private credentials", () => {
  const r = root();
  const cfg = publicPushConfig(r);
  assert.equal(cfg.vapid_private_key, undefined);
  assert.equal("privateKey" in cfg, false);
  assert.equal(JSON.stringify(cfg).includes("privateKey"), false);
  const src = readFileSync(join(HERE, "../lib/vacilando/lane-push.mjs"), "utf8");
  assert.equal(src.includes("api-token"), false);
});

await test("COMPLETE transition writes notification-ready event and reaches dispatcher", async () => {
  const r = root();
  sub(r);
  const created = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: r });
  const id = created.run.run_id;
  transitionExecutionRun(id, "EXECUTING", { root: r });
  const sent = [];
  const complete = transitionExecutionRun(id, "COMPLETE", { root: r, origin: "certification" });
  await complete.push;
  const events = readFileSync(join(r, "vacilando/execution-runs/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  const outcome = events.find((e) => e.type === "execution_run.complete");
  assert.equal(outcome.run_id, id);
  assert.equal(outcome.lane_id, "alloy-identity");
  assert.ok(outcome.at);
  const dispatch = events.find((e) => e.type === "execution_run.push_dispatch");
  assert.equal(dispatch.run_id, id);
  assert.equal(dispatch.lane_id, "alloy-identity");
  assert.equal("endpoint" in dispatch, false);
  assert.equal(JSON.stringify(events).includes("privateKey"), false);
  void sent;
});

await test("NEEDS_INPUT and FAILED transitions emit events; Governor mechanics do not", async () => {
  const r = root();
  sub(r);
  const created = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: r });
  const id = created.run.run_id;
  transitionExecutionRun(id, "EXECUTING", { root: r });
  const waiting = transitionExecutionRun(id, "WAITING_RESOURCE", {
    root: r,
    origin: "governor",
    resource_wait: { resource_key: "cursor_slot", label: "Cursor slot" },
  });
  await waiting.push;
  const recovered = transitionExecutionRun(id, "EXECUTING", { root: r, origin: "governor" });
  await recovered.push;
  const need = transitionExecutionRun(id, "NEEDS_INPUT", { root: r, reason: "Which ingress?" });
  await need.push;
  const events = readFileSync(join(r, "vacilando/execution-runs/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(events.some((e) => e.type === "execution_run.needs_input"), true);
  assert.equal(events.some((e) => e.type === "execution_run.complete"), false);
  assert.equal(events.some((e) => e.type === "execution_run.failed"), false);
  const failRoot = root();
  sub(failRoot);
  const failedRun = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: failRoot });
  transitionExecutionRun(failedRun.run.run_id, "EXECUTING", { root: failRoot });
  await transitionExecutionRun(failedRun.run.run_id, "FAILED", { root: failRoot }).push;
  const failEvents = readFileSync(join(failRoot, "vacilando/execution-runs/events.jsonl"), "utf8").trim().split("\n").map(JSON.parse);
  assert.equal(failEvents.some((e) => e.type === "execution_run.failed"), true);
});

await test("failed first send does not record outcome; duplicate after success is skipped", async () => {
  const r = root();
  sub(r);
  const created = createQueuedRun({ laneId: "alloy-identity", instruction: "x", worktreePath: WT, root: r });
  const id = created.run.run_id;
  let blows = 0;
  const send = async () => {
    blows += 1;
    if (blows === 1) {
      const err = new Error("provider down");
      err.statusCode = 500;
      throw err;
    }
  };
  const first = await pushRunOutcome({ run_id: id, lane_id: "alloy-identity", state: "COMPLETE" }, { root: r, send });
  assert.equal(first.ok, false);
  assert.equal(first.sent, 0);
  assert.equal(hasPushedRunOutcome(id, "COMPLETE", r), false);
  const second = await pushRunOutcome({ run_id: id, lane_id: "alloy-identity", state: "COMPLETE" }, { root: r, send });
  assert.equal(second.sent, 1);
  assert.equal(hasPushedRunOutcome(id, "COMPLETE", r), true);
  const third = await pushRunOutcome({ run_id: id, lane_id: "alloy-identity", state: "COMPLETE" }, { root: r, send });
  assert.equal(third.skipped, "duplicate_outcome");
});

await test("404/410 push endpoints are pruned", async () => {
  const r = root();
  savePushSubscription({ endpoint: "https://push.example/live", keys: { p256dh: "p", auth: "s" } }, { root: r });
  savePushSubscription({ endpoint: "https://push.example/gone", keys: { p256dh: "p", auth: "s" } }, { root: r });
  const { sendPushToSubscriptions, outcomePushPayload } = await import("../lib/vacilando/lane-push.mjs");
  const out = await sendPushToSubscriptions(outcomePushPayload({ lane_id: "lane_955fe041d417", title: "Identity", state: "COMPLETE" }), {
    root: r,
    send: async (sub) => {
      if (sub.endpoint.endsWith("/gone")) {
        const err = new Error("gone");
        err.statusCode = 410;
        throw err;
      }
    },
  });
  assert.equal(out.sent, 1);
  assert.equal(out.pruned, 1);
  const store = JSON.parse(readFileSync(join(r, "vacilando/web-push.json"), "utf8"));
  assert.equal(store.subscriptions.length, 1);
  assert.equal(store.subscriptions[0].endpoint.endsWith("/live"), true);
  assert.equal("endpoint" in (store.dispatch || {}), false);
});

await test("missing VAPID private key fails visibly and does not rotate", async () => {
  const r = root();
  sub(r);
  const path = join(r, "vacilando/web-push.json");
  const store = JSON.parse(readFileSync(path, "utf8"));
  const publicKey = store.vapid.publicKey;
  store.vapid = { publicKey, subject: store.vapid.subject };
  writeFileSync(path, `${JSON.stringify(store, null, 2)}\n`);
  const { sendPushToSubscriptions, testPushPayload, publicPushHealth } = await import("../lib/vacilando/lane-push.mjs");
  const out = await sendPushToSubscriptions(testPushPayload({ lane_id: "alloy-identity" }), {
    root: r,
    send: async () => { throw new Error("should not send"); },
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "vapid_unavailable");
  const after = JSON.parse(readFileSync(path, "utf8"));
  assert.equal(after.vapid.publicKey, publicKey);
  assert.equal(after.vapid.privateKey, undefined);
  const health = publicPushHealth({ requestOrigin: "https://macbook-air-2.tail2aa1af.ts.net", root: r });
  assert.equal(health.vapid_available, false);
  assert.equal("privateKey" in health, false);
  assert.equal(JSON.stringify(health).includes(publicKey) === false || health.vapid_public_key === undefined, true);
});

await test("HTTP origin subscriptions are detected against the HTTPS Serve origin", async () => {
  const r = root();
  savePushSubscription({
    endpoint: "https://push.example/old-http",
    keys: { p256dh: "p", auth: "s" },
    origin: "http://127.0.0.1:3020",
  }, { root: r });
  savePushSubscription({
    endpoint: "https://fcm.googleapis.com/new-https",
    keys: { p256dh: "p", auth: "s" },
    origin: "https://macbook-air-2.tail2aa1af.ts.net",
  }, { root: r });
  const { publicPushHealth, sendTestPush, TEST_PUSH_TITLE, TEST_PUSH_BODY } = await import("../lib/vacilando/lane-push.mjs");
  const health = publicPushHealth({ requestOrigin: "https://macbook-air-2.tail2aa1af.ts.net", root: r });
  assert.equal(health.subscription_count, 2);
  assert.equal(health.current_origin_subscriptions, 1);
  assert.equal(health.stale_http_origin_subscriptions, 1);
  const sent = [];
  const test = await sendTestPush({
    endpoint: "https://fcm.googleapis.com/new-https",
    lane_id: "lane_955fe041d417",
    origin: "https://macbook-air-2.tail2aa1af.ts.net",
    root: r,
    send: async (_sub, payload) => { sent.push(payload); },
  });
  assert.equal(test.ok, true);
  assert.equal(test.sent, 1);
  assert.equal(sent[0].title, TEST_PUSH_TITLE);
  assert.equal(sent[0].body, TEST_PUSH_BODY);
  assert.equal(sent[0].type, "vacilando.test");
  assert.equal(sent[0].path, "/#/lanes/lane_955fe041d417");
  const mismatch = await sendTestPush({
    endpoint: "https://fcm.googleapis.com/new-https",
    origin: "http://127.0.0.1:3020",
    root: r,
    send: async () => { throw new Error("should not send"); },
  });
  assert.equal(mismatch.error, "origin_mismatch");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
