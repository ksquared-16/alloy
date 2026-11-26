#!/usr/bin/env node
/**
 * Gateway V2 — server-side lane notification emit / Web Push store.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { outputFingerprint } from "../lib/vacilando/lanes.mjs";
import {
  maybeSetSendBaseline,
  noteOutputAfterInstruction,
  pendingNotificationWatches,
  recordDeliveredInstruction,
} from "../lib/vacilando/lane-runtime.mjs";
import {
  PUSH_MAX_SUBSCRIPTIONS,
  assertSafePushPayload,
  deletePushSubscription,
  prunePushSubscription,
  publicPushConfig,
  pushPayloadForLane,
  savePushSubscription,
  sendPushToSubscriptions,
} from "../lib/vacilando/lane-push.mjs";
import {
  NOTIFY_WATCH_INTERVAL_MS,
  activeNotifyWatchLaneIds,
  resetLaneNotifyWatchesForTests,
  startOutputWatch,
  stopAllOutputWatches,
} from "../lib/vacilando/lane-notify.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const lanesSrc = readFileSync(join(HERE, "../lib/vacilando/lanes.mjs"), "utf8");
const notifySrc = readFileSync(join(HERE, "../lib/vacilando/lane-notify.mjs"), "utf8");
const pushSrc = readFileSync(join(HERE, "../lib/vacilando/lane-push.mjs"), "utf8");
const gwSrc = readFileSync(join(HERE, "../apps/vacilando/public/gateway.js"), "utf8");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetLaneNotifyWatchesForTests();
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
  return mkdtempSync(join(tmpdir(), "vac-notify-"));
}

await test("one instruction → one qualifying new-output notification", () => {
  const r = root();
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date(1_700_000_000_000).toISOString(),
  }, r);
  const fp0 = outputFingerprint("before");
  maybeSetSendBaseline("alloy-identity", fp0, 1_700_000_000_000 + 1000, r);
  const first = noteOutputAfterInstruction("alloy-identity", outputFingerprint("after"), 1_700_000_000_000 + 5000, r);
  assert.equal(first.notify, true);
  assert.equal(first.reason, "activity_after_instruction");
  const again = noteOutputAfterInstruction("alloy-identity", outputFingerprint("later still"), 1_700_000_000_000 + 8000, r);
  assert.equal(again.notify, false);
  assert.equal(again.reason, "already_emitted");
});

await test("unchanged output → no notification", () => {
  const r = root();
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date(1_700_000_000_000).toISOString(),
  }, r);
  const fp = outputFingerprint("same");
  maybeSetSendBaseline("alloy-identity", fp, 1_700_000_000_000 + 1000, r);
  const out = noteOutputAfterInstruction("alloy-identity", fp, 1_700_000_000_000 + 4000, r);
  assert.equal(out.notify, false);
  assert.equal(out.reason, "unchanged");
});

await test("output before instruction → no notification", () => {
  const r = root();
  const out = noteOutputAfterInstruction("alloy-identity", outputFingerprint("early"), Date.now(), r);
  assert.equal(out.notify, false);
  assert.equal(out.reason, "no_instruction");
});

await test("repeated fingerprints for the same send do not spam", () => {
  const r = root();
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date(1_700_000_000_000).toISOString(),
  }, r);
  maybeSetSendBaseline("alloy-identity", "aaa", 1_700_000_000_000 + 1000, r);
  assert.equal(noteOutputAfterInstruction("alloy-identity", "bbb", 1_700_000_000_000 + 2000, r).notify, true);
  assert.equal(noteOutputAfterInstruction("alloy-identity", "ccc", 1_700_000_000_000 + 3000, r).notify, false);
  assert.equal(noteOutputAfterInstruction("alloy-identity", "bbb", 1_700_000_000_000 + 4000, r).notify, false);
});

await test("notification payload contains no instruction/output/token", () => {
  const payload = pushPayloadForLane({ lane_id: "alloy-identity", title: "Access Identity V2" });
  assert.equal(payload.type, "lane_unseen_after_instruction");
  assert.equal(payload.lane_id, "alloy-identity");
  assert.equal(payload.path, "/#/lanes/alloy-identity");
  assert.equal(payload.body, "New Claude output is available.");
  assert.equal("instruction" in payload, false);
  assert.equal("output" in payload, false);
  assert.equal("token" in payload, false);
  assert.equal(assertSafePushPayload(payload), true);
  assert.equal(assertSafePushPayload({ ...payload, token: "vac_secret" }), false);
  assert.equal(assertSafePushPayload({ ...payload, instruction: "secret work" }), false);
});

await test("authenticated subscription persistence is bounded and prunes dead endpoints", () => {
  const r = root();
  process.env.ALLOY_RUNTIME_ROOT = r;
  const cfg = publicPushConfig(r);
  assert.equal(cfg.ok, true);
  assert.ok(cfg.vapid_public_key);
  assert.equal(savePushSubscription({ endpoint: "http://insecure", keys: { p256dh: "a", auth: "b" } }, { root: r }).ok, false);
  assert.equal(savePushSubscription({
    endpoint: "https://push.example/1",
    keys: { p256dh: "a", auth: "b" },
    token: "vac_nope",
  }, { root: r }).error, "forbidden_field");
  for (let i = 0; i < PUSH_MAX_SUBSCRIPTIONS + 3; i++) {
    const out = savePushSubscription({
      endpoint: `https://push.example/${i}`,
      keys: { p256dh: "p", auth: "s" },
    }, { root: r, nowMs: 1_700_000_000_000 + i });
    assert.equal(out.ok, true);
  }
  const store = JSON.parse(readFileSync(join(r, "vacilando/web-push.json"), "utf8"));
  assert.ok(store.subscriptions.length <= PUSH_MAX_SUBSCRIPTIONS);
  assert.equal(store.vapid.privateKey.includes("BEGIN"), false);
  prunePushSubscription("https://push.example/10", r);
  const after = JSON.parse(readFileSync(join(r, "vacilando/web-push.json"), "utf8"));
  assert.equal(after.subscriptions.some((s) => s.endpoint.endsWith("/10")), false);
  deletePushSubscription("https://push.example/9", r);
});

await test("watch emits once then stops; no all-lane fan-out", async () => {
  const r = root();
  process.env.ALLOY_RUNTIME_ROOT = r;
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date().toISOString(),
  }, r);
  maybeSetSendBaseline("alloy-identity", "base", Date.now(), r);
  let captures = 0;
  const sent = [];
  startOutputWatch("alloy-identity", {
    intervalMs: 20,
    maxMs: 2000,
    getOutput: async () => {
      captures += 1;
      return { ok: true, fingerprint: captures === 1 ? "base" : "changed", lane_id: "alloy-identity" };
    },
    sendPush: async (payload) => { sent.push(payload); },
    resolveLabel: async () => "Access Identity V2",
    hasManagedRun: () => false,
  });
  await new Promise((res) => setTimeout(res, 80));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].lane_id, "alloy-identity");
  assert.equal(sent[0].instruction, undefined);
  assert.equal(activeNotifyWatchLaneIds().includes("alloy-identity"), false);
  stopAllOutputWatches();
  assert.equal(lanesSrc.includes("lane-notify"), false);
  assert.equal(lanesSrc.includes("lane-push"), false);
  assert.ok(NOTIFY_WATCH_INTERVAL_MS >= 5000);
  assert.equal(notifySrc.includes("listDevelopmentLanes"), false);
  const outPoll = gwSrc.slice(gwSrc.indexOf("function startOutputPoll"), gwSrc.indexOf("function startListPoll"));
  assert.equal(outPoll.includes("startOutputWatch"), false);
  assert.match(outPoll, /mode: "recent"/);
  assert.equal(outPoll.includes("latest_response"), false);
  assert.equal(outPoll.includes("mode=extended"), false);
});

await test("pending watches only include un-notified recent sends", () => {
  const r = root();
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date().toISOString(),
  }, r);
  assert.deepEqual(pendingNotificationWatches(Date.now(), r), ["alloy-identity"]);
  maybeSetSendBaseline("alloy-identity", "old", Date.now(), r);
  noteOutputAfterInstruction("alloy-identity", "newfp", Date.now() + 1000, r);
  assert.deepEqual(pendingNotificationWatches(Date.now(), r), []);
});

await test("sendPush prunes 410 endpoints and never includes secrets", async () => {
  const r = root();
  savePushSubscription({ endpoint: "https://push.example/live", keys: { p256dh: "p", auth: "s" } }, { root: r });
  savePushSubscription({ endpoint: "https://push.example/dead", keys: { p256dh: "p", auth: "s" } }, { root: r });
  const payload = pushPayloadForLane({ lane_id: "alloy-identity", title: "Access Identity V2" });
  const out = await sendPushToSubscriptions(payload, {
    root: r,
    send: async (sub) => {
      if (sub.endpoint.endsWith("/dead")) {
        const err = new Error("gone");
        err.statusCode = 410;
        throw err;
      }
    },
  });
  assert.equal(out.ok, true);
  assert.equal(out.sent, 1);
  assert.equal(out.pruned, 1);
  const store = JSON.parse(readFileSync(join(r, "vacilando/web-push.json"), "utf8"));
  assert.equal(store.subscriptions.length, 1);
  assert.equal(pushSrc.includes("api-token"), false);
});

await test("managed execution run suppresses output-watch push", async () => {
  const r = root();
  process.env.ALLOY_RUNTIME_ROOT = r;
  recordDeliveredInstruction("alloy-identity", {
    instruction: "go",
    status: "delivered",
    delivered_at: new Date().toISOString(),
  }, r);
  maybeSetSendBaseline("alloy-identity", "base", Date.now(), r);
  const sent = [];
  startOutputWatch("alloy-identity", {
    intervalMs: 20,
    maxMs: 2000,
    getOutput: async () => ({ ok: true, fingerprint: "changed", lane_id: "alloy-identity" }),
    sendPush: async (payload) => { sent.push(payload); },
    resolveLabel: async () => "Access Identity V2",
    hasManagedRun: () => true,
  });
  await new Promise((res) => setTimeout(res, 80));
  assert.equal(sent.length, 0);
  stopAllOutputWatches();
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
