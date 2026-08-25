#!/usr/bin/env node
/**
 * Lane status must describe the lane, not just its Execution Run.
 *
 * WHAT WAS WRONG. Status was derived entirely from the run. A lane whose run
 * had closed — or never opened — read as "Ready" or "Idle" while a provider was
 * mid-turn in its worktree. Measured on the live host: three of four lanes
 * showed `run: none` while every one of their panes read "esc to interrupt".
 * The operator asked "Surfaces running or not? Runtime Performance running or
 * not?" and the screen genuinely could not tell them.
 *
 * A run is Vacilando's record of an instruction. Provider activity is what the
 * agent is doing. Both are real; only the first was ever displayed.
 */
import assert from "node:assert/strict";
import test from "node:test";

const A = await import("../lib/vacilando/lane-provider-activity.mjs");
const V = await import("../apps/vacilando/public/gateway-view.mjs");

const NBSP = String.fromCharCode(0x00a0);
const RULE = "─".repeat(70);
const pane = (footer, composer = "") => [
  "  some output", RULE, `❯${NBSP}${composer}`, RULE, footer,
].join("\n");

const WORKING = pane("  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents");
const READY = pane("  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents");
const BLOCKED = [
  RULE, "  Teach auto mode about your environment?", "  ❯ 1. Yes", "    2. Not now",
  "  Enter to confirm · Esc to cancel", RULE,
].join("\n");

// ------------------------------------------------------ classification

test("a mid-turn agent is working", () => {
  const r = A.classifyProviderActivity(WORKING, { provider: "claude" });
  assert.equal(r.activity, "working");
  assert.equal(r.signal, "esc to interrupt");
});

test("an agent at a prompt is ready, not working", () => {
  assert.equal(A.classifyProviderActivity(READY, { provider: "claude" }).activity, "ready");
});

test("a dialog outranks a spinner behind it", () => {
  // A blocked pane can also look busy; the more specific condition must win or
  // the operator is told work is progressing while a modal waits on them.
  const both = `${BLOCKED}\n  ⏵⏵ esc to interrupt`;
  assert.equal(A.classifyProviderActivity(both, { provider: "claude" }).activity, "blocked");
});

test("an unreadable pane is unknown, never assumed ready", () => {
  // Claiming "ready" for a pane we could not read is how a send is fired into
  // a modal.
  assert.equal(A.classifyProviderActivity("", { provider: "claude" }).activity, "unknown");
  assert.equal(A.classifyProviderActivity("   \n  \n", { provider: "claude" }).activity, "unknown");
});

test("lanes with no live pane are absent, and cost no capture", async () => {
  let captures = 0;
  const out = await A.attachLaneProviderActivity(
    [{ lane_id: "a", tmux: { alive: false } }, { lane_id: "b" }],
    { capture: async () => { captures += 1; return WORKING; } },
  );
  assert.equal(captures, 0, "an offline lane must not be captured");
  assert.deepEqual(out.map((l) => l.provider_activity.activity), ["absent", "absent"]);
});

test("a capture failure leaves the lane unknown, not ready", async () => {
  const out = await A.attachLaneProviderActivity(
    [{ lane_id: "a", tmux: { alive: true, pane_id: "%1" } }],
    { capture: async () => { throw new Error("tmux gone"); } },
  );
  assert.equal(out[0].provider_activity.activity, "unknown");
});

test("attachment reads each live pane once", async () => {
  const seen = [];
  const out = await A.attachLaneProviderActivity(
    [
      { lane_id: "a", tmux: { alive: true, pane_id: "%1" } },
      { lane_id: "b", tmux: { alive: true, pane_id: "%2" } },
    ],
    { capture: async (t) => { seen.push(t); return t === "%1" ? WORKING : READY; } },
  );
  assert.deepEqual(seen, ["%1", "%2"]);
  assert.deepEqual(out.map((l) => l.provider_activity.activity), ["working", "ready"]);
});

// -------------------------------------------------------- lane status

const lane = (run, activity, extra = {}) => ({
  lane_id: "l", label: "L", tmux: { alive: true }, claude: { presence: "present" },
  execution_run: run, provider_activity: activity ? { activity } : null, ...extra,
});

test("a working agent with NO run reads as Working, not Ready", () => {
  // This is the exact case the operator hit on Surfaces and Runtime Performance.
  const st = V.canonicalLaneWorkState(lane(null, "working"));
  assert.equal(st.label, "Working");
  assert.equal(st.group, "active");
  assert.equal(st.source, "agent_observed", "and it says where that came from");
});

test("a working agent after a COMPLETE run still reads as Working", () => {
  const st = V.canonicalLaneWorkState(lane({ state: "COMPLETE" }, "working"));
  assert.equal(st.label, "Working");
});

test("an idle agent with no run is still Ready", () => {
  const st = V.canonicalLaneWorkState(lane(null, "ready"));
  assert.equal(st.label, "Ready");
  assert.equal(st.group, "idle");
});

test("observed activity does not override a real wait", () => {
  // needs-input is true even while the provider draws a spinner; overriding it
  // would hide a question the operator has to answer.
  const st = V.canonicalLaneWorkState(lane({ state: "NEEDS_INPUT", state_reason: "which port?" }, "ready"));
  assert.equal(st.group, "needs_input");
});

test("with no activity signal at all, behaviour is unchanged", () => {
  // Older payloads, and any lane whose pane could not be read.
  const st = V.canonicalLaneWorkState(lane(null, null));
  assert.ok(["Ready", "Idle"].includes(st.label), st.label);
});

// ------------------------------------------------------ working but quiet

test("a long-silent worker says so, because Working alone is not the answer", () => {
  const now = Date.now();
  const quiet = lane(
    { state: "EXECUTING", last_worker_report_at: new Date(now - 76 * 60_000).toISOString() },
    "working",
  );
  const st = V.canonicalLaneWorkState(quiet, { nowMs: now });
  assert.equal(st.label, "Working");
  assert.ok(st.quiet_for, "the silence is reported");
  assert.match(st.hint, /no update for/);
});

test("a recently reporting worker carries no note", () => {
  const now = Date.now();
  const fresh = lane(
    { state: "EXECUTING", last_worker_report_at: new Date(now - 60_000).toISOString() },
    "working",
  );
  const st = V.canonicalLaneWorkState(fresh, { nowMs: now });
  assert.equal(st.quiet_for, null);
  assert.equal(/no update for/.test(st.hint), false);
});

test("the silence threshold is measured from the last thing actually heard", () => {
  const now = Date.now();
  const l = lane({ state: "EXECUTING", latest_progress: { at: new Date(now - 30 * 60_000).toISOString() } }, "working");
  assert.ok(V.workerSilenceMs(l, now) >= 29 * 60_000);
  assert.equal(V.workerSilenceMs(lane(null, "working"), now), null, "no run, nothing to measure");
});

// ----------------------------------------------- disagreement is surfaced

test("a run and an agent that disagree are reported, not silently reconciled", () => {
  assert.equal(A.activityContradictsRun(lane(null, "working")).kind, "working_without_run");
  assert.equal(A.activityContradictsRun(lane({ state: "EXECUTING" }, "ready")).kind, "idle_while_executing");
  assert.equal(A.activityContradictsRun(lane({ state: "EXECUTING" }, "absent")).kind, "executing_without_provider");
  assert.equal(A.activityContradictsRun(lane({ state: "EXECUTING" }, "working")), null, "agreement is not a finding");
});
