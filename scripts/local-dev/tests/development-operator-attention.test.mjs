#!/usr/bin/env node
/**
 * TAB ATTENTION AND NOTIFICATION DELIVERY.
 *
 * The Director should be able to tell, without opening Vacilando, whether
 * anything is addressed to them. These controls pin what counts, what must
 * never count, and that one durable event is counted once however many
 * projections it appears in.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const PUBLIC = join(HERE, "..", "apps", "vacilando", "public");
const M = await import(join(PUBLIC, "vacilando-ui-model.mjs"));

const lane = (id, over = {}) => ({ lane_id: id, label: id, ...over });
const workingRun = { state: "EXECUTING", updated_at: new Date().toISOString() };

// canonicalLaneWorkState is the runtime owner; these tests drive operatorState
// through its documented input shape rather than re-deriving lane state.
const stateFor = (key, group = null, live = false) => ({ key, group, live });

await test("A1 — the title carries the count, and returns to normal at zero", () => {
  assert.equal(M.attentionTitle(0), "Vacilando");
  assert.equal(M.attentionTitle(3), "(3) Vacilando");
  assert.equal(M.attentionTitle(2, "Vacilando — Development Gateway"), "(2) Vacilando — Development Gateway");
  assert.equal(M.attentionTitle(0, "Vacilando — Development Gateway"), "Vacilando — Development Gateway");
  // Defensive: a bad count must not produce "(NaN) Vacilando" in a tab.
  assert.equal(M.attentionTitle(undefined), "Vacilando");
  assert.equal(M.attentionTitle(-4), "Vacilando");
});

await test("A2 — only the four addressed-to-a-person states count", () => {
  const S = M.OPERATOR_STATE;
  for (const s of [S.NEEDS_YOU, S.FAILED, S.ATTENTION, S.COMPLETED_UNREAD]) {
    assert.equal(M.isAttentionState(s), true, `${s} must count`);
  }
  // Routine mechanics: the system getting on with it is not an interruption.
  for (const s of [S.WORKING, S.FINALIZING, S.READY]) {
    assert.equal(M.isAttentionState(s), false, `${s} must never count`);
  }
});

await test("A3 — a lane in each counting state contributes exactly one, categorised", () => {
  const lanes = [
    lane("needs", { execution_run: { state: "NEEDS_INPUT" } }),
    lane("stuck"),
    lane("attn"),
    lane("unread"),
    lane("busy"),
    lane("idle"),
  ];
  const states = {
    needs: stateFor("needs_input", "needs_input"),
    stuck: stateFor("failed"),
    attn: stateFor("provider_active"),
    unread: stateFor("completed_unread"),
    busy: stateFor("executing", "active", true),
    idle: stateFor("idle"),
  };
  const att = M.attentionItems({ lanes, needsYou: { items: [] }, laneState: (l) => states[l.lane_id] });
  assert.equal(att.count, 4, "busy and idle must not be counted");
  assert.equal(att.byCategory[M.ATTENTION_CATEGORY.NEEDS_ANSWER], 1);
  assert.equal(att.byCategory[M.ATTENTION_CATEGORY.STUCK], 1);
  assert.equal(att.byCategory[M.ATTENTION_CATEGORY.ATTENTION], 1);
  assert.equal(att.byCategory[M.ATTENTION_CATEGORY.COMPLETED_UNREAD], 1);
});

await test("A4 — one durable event in two projections counts once", () => {
  // THE DEFECT THIS PREVENTS. A governed action awaiting the operator is an
  // item in Needs You AND the reason its lane reads NEEDS_YOU. Counting both
  // tells the Director two things need them when one does.
  const lanes = [lane("L1", { execution_run: { state: "NEEDS_INPUT" } })];
  const needsYou = { items: [{ lane_id: "L1", lane_label: "L1", kind: "governed_action" }] };
  const att = M.attentionItems({
    lanes, needsYou, laneState: () => stateFor("needs_input", "needs_input"),
  });
  assert.equal(att.count, 1, "the lane and its Needs You item are one obligation");
  assert.deepEqual(att.items.map((i) => i.key), ["lane:L1"]);

  // Positive control: two DIFFERENT lanes are two obligations.
  const two = M.attentionItems({
    lanes: [lane("L1"), lane("L2")],
    needsYou: { items: [{ lane_id: "L1", lane_label: "L1" }, { lane_id: "L2", lane_label: "L2" }] },
    laneState: () => stateFor("needs_input", "needs_input"),
  });
  assert.equal(two.count, 2);
});

await test("A5 — an unresolved request still counts, and cannot collide with a lane", () => {
  const att = M.attentionItems({
    lanes: [],
    needsYou: { items: [{ lane_id: null, lane_label: "Vacilando", request: "install toolkit" }] },
    laneState: () => null,
  });
  assert.equal(att.count, 1, "a request whose lane cannot be resolved is still an obligation");
  assert.match(att.items[0].key, /^request:/);
});

await test("A6 — the badge is a number, capped, and absent at zero", () => {
  assert.equal(M.attentionBadge(0), null);
  assert.equal(M.attentionBadge(1), "1");
  assert.equal(M.attentionBadge(9), "9");
  assert.equal(M.attentionBadge(10), "9+");
});

// ── Delivery: the client must not be a second producer ──────────────────────

await test("A7 — the page never prompts for notification permission", () => {
  // An automatic prompt is not merely rude: a dismissed prompt is SPENT, and
  // script cannot re-ask, so the deliberate opt-in stops working forever.
  const app = readFileSync(join(PUBLIC, "app.js"), "utf8");
  assert.equal(/requestPermission\s*\(/.test(app), false, "app.js must not request permission");
  assert.equal(/new Notification\s*\(/.test(app), false, "app.js must not construct notifications");

  // The opt-in still exists, in the surface where the Director presses it.
  const gw = readFileSync(join(PUBLIC, "gateway.js"), "utf8");
  assert.match(gw, /enableGatewayNotifications/);
  assert.match(gw, /await Notification\.requestPermission\(\)/,
    "the explicit opt-in must still be able to ask");
});

await test("A8 — the service worker dedupes on the durable subject, not the lane", () => {
  const sw = readFileSync(join(PUBLIC, "sw.js"), "utf8");
  assert.match(sw, /subject:\$\{data\.subject_key\}/,
    "a repeat of one durable event must replace itself");
  // The lane tag survives only as the fallback for a payload without identity.
  assert.match(sw, /lane:\$\{laneId\}/);
  // It stays push-only: a caching service worker would serve stale lane truth.
  assert.equal(/caches\.(open|match)/.test(sw), false);
});

await test("A9 — the durable subject key reaches the payload", () => {
  const src = readFileSync(join(HERE, "..", "lib", "vacilando", "lane-push.mjs"), "utf8");
  assert.match(src, /subject_key: subject_key \|\| null/, "the builder must emit it");
  assert.match(src, /subject_key: noted\.record\.subject_key/, "run outcomes must supply it");
  assert.match(src, /subject_key: record\.subject_key/, "approvals must supply it");
});
