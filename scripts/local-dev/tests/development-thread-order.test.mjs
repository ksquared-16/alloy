#!/usr/bin/env node
/**
 * The Lane is a chronological conversation, and the newest thing said is at
 * the bottom.
 *
 * THE REPORTED SYMPTOM. The current provider output was appearing at the TOP
 * of the thread, above the operator's own message. That reverses chronology and
 * puts the answer before the question.
 *
 * TWO DEFECTS PRODUCED IT, and neither was the renderer — `renderThread` has
 * always emitted entries in array order.
 *
 * 1. `entries.sort((a, b) => (a.at_ms || 0) - (b.at_ms || 0))` maps every
 *    unknown timestamp to ZERO. A governed outcome recorded without a time
 *    therefore sorted above the first message, so the conversation opened with
 *    its own ending.
 *
 * 2. The provider entry is stamped `run.updated_at`, while a freshly delivered
 *    instruction carries a LATER `delivered_at`. Pure chronology then sorted
 *    the in-progress answer above the question that had just prompted it.
 *
 * The current provider output is the live edge of the conversation. It belongs
 * against the interaction boundary — immediately above the composer — which is
 * a stronger claim than "wherever its timestamp falls", so it is pinned last.
 */
import assert from "node:assert/strict";
import test from "node:test";

const M = await import("../apps/vacilando/public/vacilando-ui-model.mjs");
const K = await import("../apps/vacilando/public/vacilando-ui-kit.mjs");

const T0 = Date.UTC(2026, 0, 1, 10, 0, 0);
const iso = (m) => new Date(T0 + m * 60_000).toISOString();
const roles = (thread) => thread.entries.map((e) => e.role);
const bodyOf = (thread, role) => thread.entries.filter((e) => e.role === role).map((e) => e.body);

/** The §10 acceptance thread, built from data the lane genuinely carries. */
function realisticThread() {
  return M.buildLaneThread({
    lane_id: "l",
    last_activity_ms: T0 + 40 * 60_000,
    previous_run: {
      run_id: "r_prev", instruction: "USER 1", created_at: iso(0), started_at: iso(0),
      completed_at: iso(10), agent_report: { message: "PROVIDER 1" },
    },
    execution_run: {
      run_id: "r_now", state: "EXECUTING", instruction: "USER 2",
      created_at: iso(20), updated_at: iso(40),
    },
    last_governed_outcome: { at: iso(30), title: "SYSTEM EVENT", ok: true },
    recent_system_activity: [],
  }, {
    assistant: { kind: "working", text: "CURRENT PROVIDER OUTPUT" },
    lastInstruction: { instruction: "USER 2", status: "delivered", delivered_at: iso(20) },
    nowMs: T0 + 41 * 60_000,
    providerLabel: "Claude",
  });
}

test("a realistic thread renders in chronological order", () => {
  assert.deepEqual(roles(realisticThread()), ["user", "provider", "user", "system", "provider"]);
});

test("the current provider output is the LAST entry", () => {
  const th = realisticThread();
  const last = th.entries[th.entries.length - 1];
  assert.equal(last.role, "provider");
  assert.equal(last.body, "CURRENT PROVIDER OUTPUT");
  assert.equal(last.current, true);
});

test("the previous exchange is kept, not discarded by the current one", () => {
  // `previous_run` used to be consulted only as a fallback, so a lane with both
  // runs showed a single turn however much had actually happened.
  const th = realisticThread();
  assert.deepEqual(bodyOf(th, "user"), ["USER 1", "USER 2"]);
  assert.deepEqual(bodyOf(th, "provider"), ["PROVIDER 1", "CURRENT PROVIDER OUTPUT"]);
});

test("an entry with no timestamp does not leap to the top", () => {
  const th = M.buildLaneThread({
    lane_id: "l", last_activity_ms: T0 + 5 * 60_000,
    execution_run: { run_id: "r", state: "EXECUTING", instruction: "do it", created_at: iso(0), updated_at: iso(5) },
    last_governed_outcome: { at: null, title: "outcome with no time", ok: true },
    recent_system_activity: [],
  }, {
    assistant: { kind: "final", text: "reply" },
    lastInstruction: { instruction: "do it", status: "delivered", delivered_at: iso(0) },
    nowMs: T0 + 6 * 60_000, providerLabel: "Claude",
  });
  assert.equal(th.entries[0].role, "user", "the operator still opens their own conversation");
  assert.equal(th.entries[th.entries.length - 1].body, "reply");
});

test("a newer instruction does not push the live answer above it", () => {
  // The provider is stamped run.updated_at; the instruction carries a later
  // delivered_at. Chronology alone put the answer above the question.
  const th = M.buildLaneThread({
    lane_id: "l", last_activity_ms: T0 + 2 * 60_000,
    execution_run: { run_id: "r", state: "EXECUTING", instruction: "newest ask", created_at: iso(0), updated_at: iso(2) },
    recent_system_activity: [],
  }, {
    assistant: { kind: "working", text: "still working" },
    lastInstruction: { instruction: "newest ask", status: "delivered", delivered_at: iso(9) },
    nowMs: T0 + 10 * 60_000, providerLabel: "Claude",
  });
  assert.deepEqual(roles(th), ["user", "provider"]);
});

test("historical provider messages are never pinned", () => {
  // Only the live edge is pinned. Pinning a historical reply would reorder
  // finished history, which §5 forbids.
  const th = realisticThread();
  const pinned = th.entries.filter((e) => e.current);
  assert.equal(pinned.length, 1);
  assert.equal(pinned[0].body, "CURRENT PROVIDER OUTPUT");
});

// ------------------------------------------------------------------ rendering

test("the DOM order matches the model order, current output last", () => {
  const html = K.renderThread(realisticThread(), {
    renderProviderBody: (e) => `<div class="vmsg-body">${e.body}</div>`,
  });
  const order = [...html.matchAll(/data-v-role="(\w+)"/g)].map((m) => m[1]);
  assert.deepEqual(order, ["user", "provider", "user", "system", "provider"]);
  assert.ok(
    html.lastIndexOf("CURRENT PROVIDER OUTPUT") > html.lastIndexOf("USER 2"),
    "the live output renders below the newest instruction",
  );
});

test("the current output owns Copy and the four-line preview", () => {
  const long = Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n");
  const th = M.buildLaneThread({
    lane_id: "l", last_activity_ms: T0,
    execution_run: { run_id: "r", state: "EXECUTING", instruction: "ask", created_at: iso(0), updated_at: iso(1) },
    recent_system_activity: [],
  }, {
    assistant: { kind: "final", text: long, finalized: true },
    lastInstruction: { instruction: "ask", status: "delivered", delivered_at: iso(0) },
    nowMs: T0 + 60_000, providerLabel: "Claude",
  });
  const html = K.renderThread(th, { renderProviderBody: (e) => `<div class="vmsg-body">${e.body}</div>` });
  const rows = html.split("<li").filter((r) => r.includes('data-v-role="provider"'));
  assert.equal(rows.length, 1);
  assert.match(rows[0], /is-clampable/, "a long provider message clamps");
  assert.match(rows[0], /data-v-msg-copy/, "and carries its own Copy");
});

test("the provider says which of its two states it is in", () => {
  const build = (assistant) => K.renderThread(M.buildLaneThread({
    lane_id: "l", last_activity_ms: T0,
    execution_run: { run_id: "r", state: "EXECUTING", instruction: "ask", created_at: iso(0), updated_at: iso(1) },
    recent_system_activity: [],
  }, {
    assistant, lastInstruction: { instruction: "ask", status: "delivered", delivered_at: iso(0) },
    nowMs: T0 + 60_000, providerLabel: "Claude",
  }), { renderProviderBody: (e) => `<div>${e.body}</div>` });

  assert.match(build({ kind: "working", text: "x" }), /vmsg-state is-working">Working</);
  assert.match(build({ kind: "final", text: "x", finalized: true }), /vmsg-state is-complete">Complete</);
});

test("there is exactly one rendering of the provider's output", () => {
  // The defect this whole pass exists to prevent: a second copy pinned above
  // the conversation.
  const html = K.renderThread(realisticThread(), {
    renderProviderBody: (e) => `<div class="vmsg-body">${e.body}</div>`,
  });
  // Counted per ROW, not per substring: Copy legitimately repeats the body in
  // its own data-v-copy-text attribute, which is the same message, not a second
  // rendering of it. What must never happen is a second ROW carrying it.
  const rows = html.split("<li").filter((r) => r.includes("CURRENT PROVIDER OUTPUT"));
  assert.equal(rows.length, 1, "the current output is rendered by exactly one message row");
  assert.match(rows[0], /data-v-role="provider"/);
});

test("the same system event twice is one line", () => {
  // Observed live: "Claude context refreshed automatically." recorded twice at
  // an identical timestamp by a feed with more than one observer. Two identical
  // lines read as two things happening, and nothing in the conversation tells
  // the operator they are one thing counted twice.
  const th = M.buildLaneThread({
    lane_id: "l", last_activity_ms: T0,
    execution_run: { run_id: "r", state: "EXECUTING", instruction: "ask", created_at: iso(0), updated_at: iso(1) },
    recent_system_activity: [
      { summary: "Claude context refreshed automatically.", at: iso(5) },
      { summary: "Claude context refreshed automatically.", at: iso(5) },
      { summary: "Claude session refresh failed", at: iso(2) },
    ],
  }, {
    assistant: { kind: "working", text: "out" },
    lastInstruction: { instruction: "ask", status: "delivered", delivered_at: iso(0) },
    nowMs: T0 + 10 * 60_000, providerLabel: "Claude",
  });
  const system = th.entries.filter((e) => e.role === "system");
  assert.equal(system.length, 2);
  // A genuinely repeated event at a DIFFERENT time is still two events.
  const twice = M.buildLaneThread({
    lane_id: "l", last_activity_ms: T0,
    execution_run: { run_id: "r", state: "EXECUTING", instruction: "ask", created_at: iso(0), updated_at: iso(1) },
    recent_system_activity: [
      { summary: "server restarted", at: iso(3) },
      { summary: "server restarted", at: iso(7) },
    ],
  }, {
    assistant: { kind: "working", text: "out" },
    lastInstruction: { instruction: "ask", status: "delivered", delivered_at: iso(0) },
    nowMs: T0 + 10 * 60_000, providerLabel: "Claude",
  });
  assert.equal(twice.entries.filter((e) => e.role === "system").length, 2,
    "the same thing happening twice is not a duplicate");
});
