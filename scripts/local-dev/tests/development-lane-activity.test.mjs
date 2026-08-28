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

const WORKING = [
  "✶ Tinkering… (10m 44s · ↓ 30.8k tokens)",
  RULE, `❯${NBSP}`, RULE,
  "  ⏵⏵ auto mode on · 7 shells · esc to interrupt · ← for agents · ↓ to manage",
].join("\n");
const READY = pane("  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents");
const BLOCKED = [
  RULE, "  Teach auto mode about your environment?", "  ❯ 1. Yes", "    2. Not now",
  "  Enter to confirm · Esc to cancel", RULE,
].join("\n");

// ------------------------------------------------------ classification

test("a mid-turn agent is working", () => {
  const r = A.classifyProviderActivity(WORKING, { provider: "claude" });
  assert.equal(r.activity, "working");
  assert.match(r.signal, /Tinkering/);
});

test("footer esc-to-interrupt without a spinner is ready, not working", () => {
  // Live Claude Code puts that phrase on the status footer whenever a
  // background shell is running. That is not a turn.
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

const TRUST_PANE = [
  "⏺ Now the review UI and a test with negative controls.",
  "",
  "  Ran 19 shell commands",
  "",
  "⏺ Now update the two certification tests to the new denominator.",
  "",
  "  Brokered typecheck · 58s",
  "  ⎿  $ vac run typecheck:tests 2>&1 | tail -3",
  "",
  "· Forging… (1h 26m 54s · ↓ 111.6k tokens)",
  "────────────────────────────────────────────────────────────────────────────────",
  `❯${NBSP}`,
  "────────────────────────────────────────────────────────────────────────────────",
  "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents",
].join("\n");

test("live turn narration is extracted without TUI chrome", () => {
  const p = A.extractLiveTurnProgress(TRUST_PANE);
  assert.match(p.summary, /Now the review UI/);
  assert.match(p.summary, /Ran 19 shell commands/);
  assert.match(p.summary, /Now update the two certification tests/);
  assert.match(p.summary, /Brokered typecheck/);
  assert.match(p.summary, /Forging/);
  assert.equal(p.summary.includes("vac run typecheck"), false, "command traces stay out");
  assert.equal(p.summary.includes("❯"), false);
  assert.equal(p.summary.includes("auto mode"), false);
});

test("a working lane with no run shows live narration, not the previous answer", () => {
  const seen = A.classifyProviderActivity(TRUST_PANE, { provider: "claude" });
  const trust = {
    lane_id: "l",
    label: "Trust Runtime",
    tmux: { alive: true },
    previous_run: { state: "COMPLETE", agent_report: { message: "Shipped yesterday's packet." } },
    execution_run: null,
    provider_activity: seen,
  };
  const src = V.assistantMessageSource(trust, { latestResponse: { ok: true, available: true, mode: "latest_response", source: "claude_code_session_transcript", text: "Shipped yesterday's packet." } });
  assert.equal(src.kind, "live");
  assert.match(src.text, /Now update the two certification tests/);
  assert.equal(src.text.includes("Shipped yesterday"), false);
  const html = V.renderAssistantMessage(src);
  assert.match(html, /Live from this turn/);
  assert.equal(html.includes("Shipped yesterday"), false);
});

test("an idle agent with an EXECUTING run is Ready, not Working", () => {
  // Trust Runtime sat EXECUTING for 19 hours after Claude had cooked. The
  // leftover run is not work.
  const st = V.canonicalLaneWorkState(lane({ state: "EXECUTING" }, "ready"));
  assert.equal(st.label, "Ready");
  assert.equal(st.group, "idle");
  assert.equal(st.source, "agent_idle_run_open");
  assert.notEqual(V.canonicalLaneWorkState(lane({ state: "EXECUTING" }, "working")).label, "Ready");
});

const COOKED_PANE = [
  "Slice 6 is closed on the engineering side. The typecheck boundary held.",
  "",
  "Safeguarding ownership is a Director decision and is not claimed here.",
  "",
  "✻ Cooked for 1h 38m 25s",
  RULE,
  `❯${NBSP}Slice 6: resolve safeguarding ownership as a Director decision`,
  RULE,
  "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
].join("\n");

test("a cooked pane yields the completion, not the composer leftover", () => {
  const p = A.extractIdleTurnResult(COOKED_PANE);
  assert.match(p.summary, /Slice 6 is closed/);
  assert.match(p.summary, /Director decision/);
  assert.equal(p.idle_result, true);
  assert.equal(p.summary.includes("❯"), false);
  assert.equal(p.summary.includes("Cooked for"), false);
  assert.equal(p.summary.includes("auto mode"), false);
  assert.equal(A.classifyProviderActivity(COOKED_PANE, { provider: "claude" }).activity, "ready");
});

test("a quiet prompt without Cooked is not a finished-turn result", () => {
  // Between tool calls the pane can look ready. That is not a completion.
  const quiet = [
    "A reasonably long leftover paragraph from the previous tool narration sits here on screen.",
    RULE,
    `❯${NBSP}`,
    RULE,
    "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
  ].join("\n");
  assert.equal(A.extractIdleTurnResult(quiet), null);
  assert.equal(A.classifyProviderActivity(quiet, { provider: "claude" }).live_progress, null);
});

test("an EXECUTING run with an idle pane does not freeze on vac run-status", () => {
  const seen = A.classifyProviderActivity(COOKED_PANE, { provider: "claude" });
  const trust = {
    lane_id: "l",
    label: "Trust Runtime",
    tmux: { alive: true },
    claude: { presence: "present" },
    preferred_provider: "claude",
    slot: 4,
    execution_run: {
      state: "EXECUTING",
      state_reason: "operator_input",
      latest_progress: { summary: "Slice 4: 37-row ownership ledger. Slice 5: cross-sprint ownership convergence." },
      started_at: "2026-08-24T16:00:00.000Z",
    },
    provider_activity: seen,
  };
  const src = V.assistantMessageSource(trust, {});
  assert.notEqual(src.kind, "status");
  assert.equal(src.text.includes("37-row ownership ledger"), false);
  assert.match(src.text, /Slice 6 is closed/);
  assert.equal(src.text.includes("❯"), false);
  const html = V.renderAssistantMessage(src);
  assert.equal(html.includes("vac run-status"), false);
  assert.equal(html.includes("Working"), false);
  const withTranscript = V.assistantMessageSource(trust, {
    latestResponse: {
      ok: true, available: true, mode: "latest_response",
      source: "claude_code_session_transcript",
      text: "Full Slice 6 writeup from the session transcript.",
    },
  });
  assert.equal(withTranscript.kind, "transcript");
  assert.equal(withTranscript.report.type, "completion");
  assert.match(withTranscript.text, /Full Slice 6 writeup/);
  assert.match(V.renderAssistantMessage(withTranscript), /Complete/);
  assert.equal(V.renderAssistantMessage(withTranscript).includes("Working"), false);
  const work = V.renderCurrentWork(trust.execution_run, Date.parse("2026-08-25T11:00:00.000Z"), { activity: "ready" });
  assert.match(work, /At a prompt/);
  assert.doesNotMatch(work, />Executing</);
  const posture = V.deriveLaneExecutionPosture(trust);
  assert.equal(posture.state, "CONNECTED");
  const runtime = V.renderLaneRuntimeControls(trust, posture);
  assert.match(runtime, /Claude connected/);
  assert.equal(runtime.includes("This lane is working"), false);
  assert.equal(runtime.includes("Executing"), false);
});

test("live ⏺ after leftover Cooked is working, not Ready", () => {
  const pane = [
    "Slice 6 is closed on the engineering side. The typecheck boundary held.",
    "",
    "✻ Cooked for 1h 38m 25s",
    RULE,
    `❯${NBSP}`,
    RULE,
    "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
    "",
    "⏺ Investigation complete. No canonical owner exists — writing the finding, then the model.",
  ].join("\n");
  const seen = A.classifyProviderActivity(pane, { provider: "claude" });
  assert.equal(seen.activity, "working");
  assert.match(seen.signal, /Investigation complete/);
  const live = A.extractLiveTurnProgress(pane);
  assert.match(live.summary, /Investigation complete/);
  assert.equal(live.summary.includes("Slice 6 is closed"), false);
  const trust = {
    lane_id: "l",
    label: "Trust Runtime",
    tmux: { alive: true },
    claude: { presence: "present" },
    preferred_provider: "claude",
    slot: 4,
    execution_run: { state: "EXECUTING", started_at: "2026-08-25T19:45:00.000Z" },
    provider_activity: seen,
  };
  const st = V.canonicalLaneWorkState(trust);
  assert.equal(st.label, "Working");
  assert.equal(V.deriveLaneExecutionPosture(trust).state, "RUNNING");
  const src = V.assistantMessageSource(trust, {});
  assert.equal(src.kind, "live");
  assert.match(src.text, /Investigation complete/);
});

test("list and detail activity merge prefer working over leftover Ready", () => {
  const t0 = "2026-08-25T19:48:00.000Z";
  const t1 = "2026-08-25T19:48:03.000Z";
  const working = { activity: "working", observed_at: t0, signal: "live narration" };
  const ready = { activity: "ready", observed_at: t1, signal: "prompt" };
  assert.equal(V.preferProviderActivity(working, ready).activity, "working");
  const detail = {
    lane_id: "lane_trust",
    label: "Trust Runtime",
    last_instruction: { instruction: "keep going" },
    execution_run: { state: "EXECUTING", instruction: "keep going", agent_report: { message: "mid" } },
    provider_activity: working,
  };
  const listed = {
    lane_id: "lane_trust",
    label: "Trust Runtime",
    execution_run: { state: "EXECUTING" },
    provider_activity: ready,
  };
  const merged = V.mergeListedLane(detail, listed);
  assert.equal(merged.provider_activity.activity, "working");
  assert.equal(merged.last_instruction.instruction, "keep going");
  assert.equal(merged.execution_run.instruction, "keep going");
  const rows = V.upsertLaneInList([listed], merged);
  assert.equal(rows[0].provider_activity.activity, "working");
  assert.equal(V.canonicalLaneWorkState(merged).label, V.canonicalLaneWorkState(rows[0]).label);
});

/**
 * A finished turn must be recognised whatever verb Claude Code used to end it.
 *
 * TURN_FINISHED_RE listed Cooked|Sautéed|Sauted|Baked. Claude Code also ends
 * turns with "Worked for 14s". An unlisted verb meant no match, so the leftover
 * ⏺ narration was read as a LIVE turn and the pane — sitting idle at a prompt —
 * was classified `working`. Delivery refuses a busy pane, so the lane could not
 * be given its next instruction. That is what stuck the Communications lane,
 * whose pane ended exactly this way.
 */
test("a finished turn is recognised by shape, not by a verb list", async () => {
  const P = await import("../lib/vacilando/provider-prompt-readiness.mjs");
  const idlePane = [
    "⏺ Background command \"Watch for the merge to land\" was stopped",
    "⏺ Both merge watchers were stopped, so nothing is monitoring PR #510 now.",
    "✻ Worked for 14s",
    RULE, `❯${NBSP}`, RULE,
    "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
  ].join("\n");

  assert.equal(P.TURN_FINISHED_RE.test(idlePane), true, "\"Worked for\" must count as finished");
  assert.equal(P.detectProviderBusy(idlePane), null, "an idle pane must not read as busy");
  assert.equal(A.classifyProviderActivity(idlePane, { provider: "claude" }).activity, "ready");

  // Every verb, including the accented one, and durations in each unit.
  for (const line of ["✻ Worked for 14s", "✻ Cooked for 1m 3s", "  Sautéed for 45s",
    "✻ Baked for 2h", "  Simmered for 900ms"]) {
    assert.equal(P.TURN_FINISHED_RE.test(line), true, `${line} should be a completion`);
  }

  // POSITIVE CONTROLS. Without these the regex could match everything and the
  // suite would look identical: narration is not completion, a duration needs a
  // real unit, and a live spinner must still read as busy.
  for (const line of ["⏺ Searched for 3 files", "⏺ Waited for the merge",
    "  Ran 19 shell commands", "✻ Forging… (12s · esc to interrupt)"]) {
    assert.equal(P.TURN_FINISHED_RE.test(line), false, `${line} must not be a completion`);
  }
  const busy = [
    "⏺ Still going", "✻ Forging… (12s · esc to interrupt)",
    RULE, `❯${NBSP}`, RULE, "  ⏵⏵ auto mode on · esc to interrupt",
  ].join("\n");
  assert.equal(A.classifyProviderActivity(busy, { provider: "claude" }).activity, "working");
});
