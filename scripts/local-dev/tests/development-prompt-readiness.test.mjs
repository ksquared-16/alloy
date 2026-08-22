#!/usr/bin/env node
/**
 * Delivery truth — a paste is not a delivery, and old output is not a result.
 *
 * Regression origin (2026-08-22): Vacilando pasted an approved instruction into
 * a Claude pane sitting on the "Teach auto mode about your environment?"
 * onboarding screen. tmux accepted the keystrokes, so delivery was
 * acknowledged, the run went EXECUTING, and the previous turn's completion —
 * still on screen — was attributed to it. Four separate laws are certified here:
 *
 *   1. a modal screen is NOT READY and is never pasted into
 *   2. a not-ready pane yields NEEDS_INPUT, never EXECUTING, instruction kept
 *   3. output without this run's receipt token is not this run's output
 *   4. a completion cannot close an instruction that was never delivered
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-prompt-ready-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "0";

const {
  PROMPT_NOT_READY_ERROR,
  assessPanePromptReadiness,
  detectPromptBlocker,
  promptReadinessAllowsSend,
} = await import("../lib/vacilando/provider-prompt-readiness.mjs");
const viewModule = await import("../apps/vacilando/public/gateway-view.mjs");
const {
  bindOutputToRun,
  outputFingerprint,
  resetLaneSendStateForTests,
  sendLaneInstruction,
  textProvesInstructionReceipt,
} = await import("../lib/vacilando/lanes.mjs");
const { deliverManagedLaneInstruction, laneInstructionHttpStatus } = await import("../lib/vacilando/execution-run-send.mjs");
const {
  createQueuedRun,
  getExecutionRun,
  listExecutionRunsForLane,
  noteInstructionReceipt,
  reportRunState,
  resetExecutionRunsForTests,
  runCompletionAdmissible,
  supersedeFalseCompletion,
  transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const { stopAllOutputWatches } = await import("../lib/vacilando/lane-notify.mjs");

const IDENTITY_WT = "/Users/Kelly/Code/alloy-worktrees/wt1-access-identity-v2";
const WT_ROOT = "/Users/Kelly/Code/alloy-worktrees";
const LANE = "alloy-identity";

// ---------------------------------------------------------------- screens ---

const READY_PANE = [
  "● Done. Summary written to docs/notes.md.",
  "",
  "╭──────────────────────────────────────────────╮",
  "│ >                                            │",
  "╰──────────────────────────────────────────────╯",
  "  ? for shortcuts",
].join("\n");

const ONBOARDING_PANE = [
  "╭──────────────────────────────────────────────╮",
  "│ Teach auto mode about your environment?      │",
  "│                                              │",
  "│ ❯ 1. Yes, scan my environment                │",
  "│   2. Not now                                 │",
  "╰──────────────────────────────────────────────╯",
].join("\n");

const PERMISSION_PANE = [
  "Do you want to allow Claude to run this command?",
  "",
  "  1. Yes",
  "  2. Yes, and don't ask again",
  "  3. No, tell Claude what to do differently",
].join("\n");

const BUSY_PANE = [
  "● Reading scripts/local-dev/lib/vacilando/lanes.mjs",
  "",
  "  Thinking… (12s · esc to interrupt)",
].join("\n");

// ------------------------------------------------------------------ harness --

function paneLine({ command = "2.1.220", cwd = IDENTITY_WT, dead = "0" } = {}) {
  return [LANE, "0", "0", "%13", "7093", dead, "0", "1786985224", command, cwd, "_ Access Identity V2"].join("|");
}

function harness(paneText) {
  const calls = [];
  return {
    calls,
    opts: {
      listPanes: async () => ({ ok: true, stdout: `${paneLine()}\n` }),
      gitFacts: async () => ({ git: "clean", ahead_behind: "0/0", branch: "agent/claude/1-access-identity-v2" }),
      metadata: [],
      worktreeRoot: WT_ROOT,
      cfg: { worktree_root: WT_ROOT },
      writeAudit: (ev) => ({ id: "evt_test", ...ev }),
      root: ROOT,
      worktreePath: IDENTITY_WT,
      capturePane: async () => ({ ok: true, stdout: paneText }),
      tmux: async (argv, o = {}) => {
        calls.push({ argv: [...argv], input: o.input ?? null });
        return { ok: true, stdout: "", stderr: "" };
      },
    },
  };
}

function pasted(calls) {
  return calls.some((c) => c.argv[0] === "paste-buffer");
}

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetLaneSendStateForTests();
  stopAllOutputWatches();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  } finally {
    stopAllOutputWatches();
  }
}

// ------------------------------------------------------------- 1. detection --

await test("onboarding, permission, login, update and selection screens are NOT READY", () => {
  const cases = [
    [ONBOARDING_PANE, "onboarding"],
    [PERMISSION_PANE, "permission"],
    ["Do you trust the files in this folder?\n  1. Yes  2. No", "trust"],
    ["Select login method\n  1. Claude account", "login"],
    ["A new version is available.\nPress enter to update", "update"],
    ["Select a conversation to resume", "resume_picker"],
    ["Use the arrow keys to select a theme", "selection"],
  ];
  for (const [text, kind] of cases) {
    const blocker = detectPromptBlocker(text, { provider: "claude" });
    assert.ok(blocker, `expected a blocker for ${kind}`);
    assert.equal(blocker.kind, kind);
    const a = assessPanePromptReadiness(text, { provider: "claude" });
    assert.equal(a.ready, false);
    assert.equal(a.state, "blocked");
    assert.match(a.summary, /\S/);
    assert.equal(promptReadinessAllowsSend(a).allow, false);
  }
});

await test("an actionable prompt is READY; a mid-turn pane and an unknown screen are not", () => {
  const ready = assessPanePromptReadiness(READY_PANE, { provider: "claude" });
  assert.equal(ready.ready, true);
  assert.equal(ready.state, "ready");
  assert.equal(promptReadinessAllowsSend(ready).allow, true);

  const busy = assessPanePromptReadiness(BUSY_PANE, { provider: "claude" });
  assert.equal(busy.state, "busy");
  assert.equal(promptReadinessAllowsSend(busy).allow, false);

  const unknown = assessPanePromptReadiness("build finished with 0 errors", { provider: "claude" });
  assert.equal(unknown.state, "unknown");
  assert.equal(promptReadinessAllowsSend(unknown).allow, false);
});

await test("the real Claude Code footer and caret are recognised, idle and mid-turn", () => {
  // Captured verbatim from a live Claude Code pane (%13). The composer caret is
  // U+276F, and the busy marker shares one footer line with the mode hint — so
  // "shift+tab to cycle" alone must never be read as an actionable prompt.
  const footer = "  ⏵⏵ auto mode on (shift+tab to cycle) · esc to interrupt · ← for agents";
  const composer = [
    "  ⎿  Tip: Use /btw to ask a quick side question",
    "                                        ✔ Update installed · Restart to update",
    "────────────────────────────────────────────────────────────────────────────",
    "❯                                                      ",
    "────────────────────────────────────────────────────────────────────────────",
  ].join("\n");

  const busy = assessPanePromptReadiness(`${composer}\n${footer}`, { provider: "claude" });
  assert.equal(busy.state, "busy", "a live turn is not an actionable prompt");

  const idle = assessPanePromptReadiness(
    `${composer}\n  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents`,
    { provider: "claude" },
  );
  assert.equal(idle.state, "ready");
  assert.equal(promptReadinessAllowsSend(idle).allow, true);

  // A passive "Restart to update" notice is not an update MODAL. Treating it as
  // one would block delivery on every pane that has ever seen an update.
  assert.equal(detectPromptBlocker(composer, { provider: "claude" }), null);
});

await test("a composer holding typed text is READY — the footer varies", () => {
  // REGRESSION, from a live refusal. The operator could not send to the Runtime
  // Performance lane: its pane read `❯ merge it` — the composer with their text
  // already in it — and the gate classified it "unknown" and refused.
  //
  // Two patterns had to both miss for that: one required an EMPTY caret line,
  // the other required the caret line to be the LAST line of the capture. A
  // composer holding text is neither, because the footer always follows it.
  // The footer itself was no help — Claude Code varies that line, and this one
  // said "auto mode on · PR #495 · 1 shell · ← for agents · ↓ to manage" with
  // no "shift+tab to cycle" anywhere.
  const live = [
    "  Run state reported as NEEDS_INPUT on lane_73a897409906: merge authorization is",
    "  yours.",
    "",
    "✻ Sautéed for 1h 15m 33s · 1 shell still running",
    "                                        ✔ Update installed · Restart to update",
    "────────────────────────────────────────────────────────────────────────────────",
    "❯ merge it",
    "────────────────────────────────────────────────────────────────────────────────",
    "  ⏵⏵ auto mode on · PR #495 · 1 shell · ← for agents · ↓ to manage",
  ].join("\n");
  const a = assessPanePromptReadiness(live, { provider: "claude" });
  assert.equal(a.state, "ready", "a composer with text in it is an actionable prompt");
  assert.equal(promptReadinessAllowsSend(a).allow, true);

  // An empty composer with the same footer variant is equally ready.
  const empty = live.replace("❯ merge it", "❯");
  assert.equal(assessPanePromptReadiness(empty, { provider: "claude" }).state, "ready");

  // Footer fragments this build actually emits, each sufficient on its own.
  for (const footer of [
    "  ⏵⏵ auto mode on · ← for agents · ↓ to manage",
    "  ⏵⏵ auto mode on (shift+tab to cycle) · ← for agents",
    "  ? for shortcuts",
  ]) {
    assert.equal(assessPanePromptReadiness(`some output\n${footer}`, { provider: "claude" }).state, "ready", footer);
  }

  // The broader caret rule must NOT swallow a numbered menu — blockers are
  // evaluated first, and a caret-marked choice list is still a modal.
  assert.equal(assessPanePromptReadiness("Teach auto mode about your environment?\n ❯ 1. Yes\n   2. No", { provider: "claude" }).state, "blocked");
  assert.equal(assessPanePromptReadiness("Do you want to allow Claude to run this command?\n ❯ 1. Yes\n   2. No", { provider: "claude" }).state, "blocked");
  // And a mid-turn pane is still busy, caret or no caret.
  assert.equal(assessPanePromptReadiness("❯ \n  ⏵⏵ auto mode on · esc to interrupt", { provider: "claude" }).state, "busy");
});

await test("a refused send tells the operator what the pane was doing", () => {
  // What they actually saw was "Delivery refused (provider_prompt_not_ready)".
  const { deliveryNotice, deliveryErrorText } = viewModule;
  const withReason = deliveryNotice({
    ok: false,
    error: "provider_prompt_not_ready",
    prompt_readiness: { summary: 'The agent is mid-turn ("esc to interrupt"), not at an actionable prompt.' },
  });
  assert.equal(withReason.kind, "err");
  assert.match(withReason.text, /Not sent/);
  assert.match(withReason.text, /mid-turn/);
  assert.match(withReason.text, /Open Details/);
  assert.equal(withReason.text.includes("provider_prompt_not_ready"), false, "never show the operator a raw error code");

  const bare = deliveryNotice({ ok: false, error: "provider_prompt_not_ready" });
  assert.match(bare.text, /not at a prompt/);
  assert.equal(bare.text.includes("provider_prompt_not_ready"), false);
  assert.equal(deliveryErrorText("provider_prompt_not_ready").includes("provider_prompt_not_ready"), false);
});

await test("a screen that cannot be captured defers to the pane-presence contract", () => {
  const none = assessPanePromptReadiness("", { provider: "claude" });
  assert.equal(none.state, "capture_unavailable");
  assert.equal(promptReadinessAllowsSend(none).allow, true);
  assert.equal(promptReadinessAllowsSend(none, { strictCapture: true }).allow, false);
});

// -------------------------------------------------------- 2. send interception --

await test("an onboarding modal intercepts the send: nothing is pasted", async () => {
  const h = harness(ONBOARDING_PANE);
  const out = await sendLaneInstruction(LANE, "do the thing", h.opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, PROMPT_NOT_READY_ERROR);
  assert.equal(out.status, "refused");
  assert.equal(out.prompt_readiness.blocker_kind, "onboarding");
  assert.match(out.prompt_readiness.summary, /onboarding/i);
  assert.equal(pasted(h.calls), false, "an unready pane must never be pasted into");
});

await test("a ready pane is pasted into, and the pre-paste baseline is returned", async () => {
  const h = harness(READY_PANE);
  const out = await sendLaneInstruction(LANE, "do the thing", h.opts);
  assert.equal(out.ok, true);
  assert.equal(out.status, "delivered");
  assert.equal(out.prompt_readiness.ready, true);
  assert.equal(pasted(h.calls), true);
  assert.equal(out.output_baseline_fingerprint, outputFingerprint(READY_PANE));
  assert.ok(out.output_baseline_captured_at);
  const captureIndex = h.calls.findIndex((c) => c.argv[0] === "paste-buffer");
  assert.ok(captureIndex >= 0);
});

// ------------------------------------------------ 3. run state on not-ready --

await test("a not-ready pane yields NEEDS_INPUT, never EXECUTING, instruction preserved", async () => {
  const h = harness(ONBOARDING_PANE);
  const out = await deliverManagedLaneInstruction(LANE, "VACILANDO_READY_PANE_REPAIR_20260822 do the work", h.opts);
  assert.equal(out.ok, false);
  assert.equal(out.error, PROMPT_NOT_READY_ERROR);
  assert.equal(out.status, "needs_input");
  assert.match(out.blocking_screen, /onboarding/i);
  assert.equal(laneInstructionHttpStatus(out), 409);

  const runs = listExecutionRunsForLane(LANE, ROOT);
  assert.equal(runs.length, 1);
  const run = runs[0];
  assert.equal(run.state, "NEEDS_INPUT");
  assert.equal(run.started_at, null, "a run nobody received must not look started");
  assert.equal(run.delivery.acknowledged, false);
  assert.equal(run.delivery.error, PROMPT_NOT_READY_ERROR);
  assert.match(run.instruction, /VACILANDO_READY_PANE_REPAIR_20260822/, "instruction is preserved for retry");
});

await test("a ready pane delivers end to end and binds the run to its pre-paste baseline", async () => {
  const h = harness(READY_PANE);
  const out = await deliverManagedLaneInstruction(LANE, "VACILANDO_READY_PANE_REPAIR_20260822 do the work", h.opts);
  assert.equal(out.ok, true);
  assert.equal(out.status, "delivered");

  const run = listExecutionRunsForLane(LANE, ROOT)[0];
  assert.equal(run.state, "EXECUTING");
  assert.equal(run.delivery.acknowledged, true);
  assert.equal(run.delivery.receipt_token, run.run_id);
  assert.equal(run.delivery.receipt_confirmed, false, "a paste is not yet a receipt");
  assert.equal(run.output_fingerprint_at_send, outputFingerprint(READY_PANE));
  assert.equal(run.delivery.prompt_readiness.ready, true);
});

// ---------------------------------------------------- 4. prior-output reuse --

await test("output that predates the baseline, or lacks the receipt token, is withheld", () => {
  const run = {
    run_id: "erun_newinstruction01",
    state: "EXECUTING",
    output_fingerprint_at_send: "base-fp",
    delivery: { acknowledged: true, receipt_token: "erun_newinstruction01", receipt_confirmed: false },
  };
  const priorText = "VACILANDO_CLAUDE_DELIVERY_PROOF_1787409580\n\nRun reported complete.";

  // Output that never moved past the baseline: the pane still shows the old turn.
  const unmoved = bindOutputToRun(
    { ok: true, available: true, text: priorText, fingerprint: "base-fp" },
    run,
  );
  assert.equal(unmoved.available, false);
  assert.equal(unmoved.error, "awaiting_provider_output");
  assert.equal(unmoved.text, null);

  // Output that DID move but is still the previous turn rendering: no token.
  const movedButUnattributed = bindOutputToRun(
    { ok: true, available: true, text: `${priorText}\nDone.`, fingerprint: "moved-fp" },
    run,
  );
  assert.equal(movedButUnattributed.available, false);
  assert.equal(movedButUnattributed.error, "awaiting_instruction_receipt");
  assert.equal(movedButUnattributed.text, null);

  // Output carrying this run's own token is finally attributable.
  const attributable = bindOutputToRun(
    { ok: true, available: true, text: "You are executing Vacilando run erun_newinstruction01.\nWorking…", fingerprint: "own-fp" },
    run,
  );
  assert.equal(attributable.available, true);
  assert.equal(attributable.run_id, run.run_id);
  assert.equal(
    textProvesInstructionReceipt(run, "You are executing Vacilando run erun_newinstruction01.", "own-fp"),
    true,
  );
  assert.equal(textProvesInstructionReceipt(run, priorText, "moved-fp"), false);
});

await test("receipt confirmation is persisted once and never reverts", async () => {
  const h = harness(READY_PANE);
  await deliverManagedLaneInstruction(LANE, "VACILANDO_READY_PANE_REPAIR_20260822 do the work", h.opts);
  const run = listExecutionRunsForLane(LANE, ROOT)[0];

  const missed = noteInstructionReceipt(run.run_id, { text: "unrelated output", fingerprint: "x", root: ROOT });
  assert.equal(missed.confirmed, false);
  assert.equal(getExecutionRun(run.run_id, ROOT).delivery.receipt_confirmed, false);

  const seen = noteInstructionReceipt(run.run_id, {
    text: `You are executing Vacilando run ${run.run_id}.`,
    fingerprint: "advanced-fp",
    root: ROOT,
  });
  assert.equal(seen.confirmed, true);
  const after = getExecutionRun(run.run_id, ROOT);
  assert.equal(after.delivery.receipt_confirmed, true);
  assert.ok(after.delivery.receipt_confirmed_at);
});

// ------------------------------------------------------- 5. false completion --

await test("a completion cannot close an instruction that was never delivered", () => {
  const created = createQueuedRun({ laneId: LANE, instruction: "queued but never delivered", root: ROOT });
  assert.equal(created.ok, true);
  assert.equal(runCompletionAdmissible(created.run).ok, false);

  const reported = reportRunState(created.run.run_id, "complete", {
    summary: "Worktree path and branch reported.",
    root: ROOT,
    origin: "agent",
  });
  assert.equal(reported.ok, false);
  assert.equal(reported.error, "completion_before_delivery");
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state, "QUEUED");
});

await test("an incorrectly completed run is superseded with its instruction preserved", async () => {
  const created = createQueuedRun({ laneId: LANE, instruction: "the UI assignment", root: ROOT });
  transitionExecutionRun(created.run.run_id, "EXECUTING", { reason: "test", root: ROOT });
  transitionExecutionRun(created.run.run_id, "COMPLETE", { reason: "test", root: ROOT });
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state, "COMPLETE");

  const out = supersedeFalseCompletion(created.run.run_id, {
    reason: "provider_prompt_not_ready",
    root: ROOT,
  });
  assert.equal(out.ok, true);
  assert.equal(out.mode, "superseded");
  assert.equal(out.retry_instruction, "the UI assignment");
  const run = getExecutionRun(created.run.run_id, ROOT);
  assert.equal(run.false_completion.superseded, true);
  assert.equal(run.false_completion.reason, "provider_prompt_not_ready");
  assert.equal(run.false_completion.preserved_instruction, "the UI assignment");

  // The supersession is visible to the operator, not buried in the store.
  const { publicExecutionRun } = await import("../lib/vacilando/execution-run.mjs");
  assert.equal(publicExecutionRun(run).false_completion.superseded, true);

  // Idempotent: reconciling twice does not double-report.
  const again = supersedeFalseCompletion(created.run.run_id, { root: ROOT });
  assert.equal(again.already, true);
});

await test("a non-terminal run reconciles to FAILED with the instruction preserved", () => {
  const created = createQueuedRun({ laneId: LANE, instruction: "not yet delivered", root: ROOT });
  const out = supersedeFalseCompletion(created.run.run_id, {
    reason: "provider_prompt_not_ready",
    root: ROOT,
  });
  assert.equal(out.ok, true);
  assert.equal(out.mode, "failed");
  assert.equal(out.retry_instruction, "not yet delivered");
  const run = getExecutionRun(created.run.run_id, ROOT);
  assert.equal(run.state, "FAILED");
  assert.equal(run.false_completion.preserved_instruction, "not yet delivered");
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
