#!/usr/bin/env node
/**
 * A terminal modal must never strand a lane.
 *
 * Observed on lane_db3431e755a8. Claude was showing a permission prompt, so the
 * readiness gate correctly refused the paste — and then everything downstream
 * conspired to make the lane immovable:
 *
 *   1. the undelivered run was parked NEEDS_INPUT. That means "the agent asked
 *      the operator something", answered from the Vacilando composer. A Claude
 *      permission dialog is the opposite: only answerable at the terminal.
 *   2. NEEDS_INPUT is protective, so the governor would not close it.
 *   3. the next Send was treated as a decision reply and retried the paste into
 *      the same blocked pane.
 *   4. automatic rotation then patched the session to HANDOFF *before* the
 *      handoff instruction delivered. That paste failed too, the handoff stayed
 *      "requested", and maybeAdvanceSessionRotation only aborts a handoff that
 *      reached "ready" — so the session stayed HANDOFF forever.
 *
 * The laws below close each step.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-prompt-block-"));
const WT = mkdtempSync(join(tmpdir(), "vac-prompt-block-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "0";
process.env.VACILANDO_SKIP_SESSION_ADVANCE = "1";

const {
  activeRunForLane, createQueuedRun, getExecutionRun, listExecutionRunsForLane,
  resetExecutionRunsForTests, transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const { deliverManagedLaneInstruction, undeliveredPromptBlocked, UNDELIVERED_PROMPT_BLOCK } =
  await import("../lib/vacilando/execution-run-send.mjs");
const {
  assessPanePromptReadiness, promptBlockNeedsTerminalOperator, publicPromptReadiness,
  OPERATOR_TERMINAL_BLOCKERS, PROMPT_NOT_READY_ERROR,
} = await import("../lib/vacilando/provider-prompt-readiness.mjs");
const { deliveryNotice, deliveryErrorText } = await import("../apps/vacilando/public/gateway-view.mjs");
const { stopAllOutputWatches } = await import("../lib/vacilando/lane-notify.mjs");

const LANE = "alloy-identity";

const PERMISSION_PANE = [
  "Do you want to allow Claude to run this command?",
  "",
  "  1. Yes",
  "  2. Yes, and don't ask again",
  "  3. No, tell Claude what to do differently",
].join("\n");
const BUSY_PANE = "● Reading a file\n\n  Thinking… (12s · esc to interrupt)";

/** A send that refuses exactly the way the readiness gate does. */
function refusingSend(paneText) {
  const readiness = assessPanePromptReadiness(paneText, { provider: "claude" });
  return async (laneId, _instruction, opts = {}) => ({
    ok: false,
    schema_version: "vacilando.lane.send.v1",
    lane_id: laneId,
    status: "refused",
    error: PROMPT_NOT_READY_ERROR,
    delivered_at: new Date(opts.nowMs || Date.now()).toISOString(),
    prompt_readiness: publicPromptReadiness(readiness),
  });
}
const deliveringSend = async (laneId, instruction) => ({
  ok: true, status: "delivered", lane_id: laneId,
  delivered_at: new Date().toISOString(), instruction_size: String(instruction).length,
  worktree_path: WT,
});
const quietOutput = async () => ({ ok: true, text: "", fingerprint: "fp", captured_at: new Date().toISOString() });

const sendOpts = (send) => ({
  root: ROOT, worktreePath: WT, sendLaneInstruction: send,
  getOutput: quietOutput, notifyIntervalMs: 60_000,
});

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
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

// ------------------------------------------------ law 1: not NEEDS_INPUT ----

await test("a permission dialog QUEUES the undelivered run — the adapter owns it, not the terminal", async () => {
  /*
   * CONTRACT CHANGED, DELIBERATELY. A permission prompt used to FAIL the run and
   * tell the operator to answer it in tmux. It is an execution-adapter concern:
   * provider-prompt-authority classifies it against Vacilando's own authority,
   * answers what is already authorized, and converts the rest into a governed
   * decision. So the run stays retryable rather than dying.
   *
   * The property the original test existed to protect is unchanged and asserted
   * below: a permission dialog must never park the run as sticky NEEDS_INPUT.
   */
  const out = await deliverManagedLaneInstruction(LANE, "do the work", sendOpts(refusingSend(PERMISSION_PANE)));
  assert.equal(out.ok, false);
  assert.equal(out.error, PROMPT_NOT_READY_ERROR);
  assert.equal(out.status, "queued");
  assert.notEqual(out.needs_terminal_operator, true, "a permission prompt is never the operator's terminal problem");

  const run = listExecutionRunsForLane(LANE, ROOT)[0];
  assert.notEqual(run.state, "NEEDS_INPUT", "still never sticky needs-input");
  assert.equal(run.delivery.acknowledged, false);
  assert.match(run.instruction, /do the work/, "the instruction is preserved");
});

await test("every operator-terminal blocker kind fails; transient states do not", () => {
  for (const kind of OPERATOR_TERMINAL_BLOCKERS) {
    assert.equal(promptBlockNeedsTerminalOperator({ state: "blocked", blocker: { kind } }), true, kind);
  }
  for (const state of ["busy", "unknown", "capture_unavailable", "ready"]) {
    assert.equal(promptBlockNeedsTerminalOperator({ state }), false, state);
  }
  assert.equal(promptBlockNeedsTerminalOperator(null), false);
});

await test("a mid-turn agent keeps the run QUEUED for a later retry", async () => {
  const out = await deliverManagedLaneInstruction(LANE, "later please", sendOpts(refusingSend(BUSY_PANE)));
  assert.equal(out.ok, false);
  assert.equal(out.status, "queued");
  assert.equal(out.needs_terminal_operator, false);
  const run = listExecutionRunsForLane(LANE, ROOT)[0];
  assert.equal(run.state, "QUEUED", "transient refusal must not fail work nobody refused");
  assert.equal(run.state_reason, "waiting_for_ready_prompt");
  assert.equal(run.delivery.acknowledged, false);
  assert.match(run.instruction, /later please/);
});

// --------------------------------------- law 2: Send supersedes, never retries --

await test("Send supersedes an undelivered blocked run instead of pasting into it", async () => {
  const first = await deliverManagedLaneInstruction(LANE, "first instruction", sendOpts(refusingSend(PERMISSION_PANE)));
  // Queued, not failed: a permission prompt is adapter business now. What this
  // test actually protects — a later Send is a NEW turn and never re-pastes the
  // blocked instruction — is unchanged.
  assert.equal(first.status, "queued");
  const blocked = listExecutionRunsForLane(LANE, ROOT)[0];

  // The pane is clear now. The next Send is a NEW turn.
  const payloads = [];
  const second = await deliverManagedLaneInstruction(LANE, "second instruction", sendOpts(
    async (laneId, instruction) => { payloads.push(instruction); return deliveringSend(laneId, instruction); },
  ));
  assert.equal(second.ok, true);
  assert.notEqual(second.run_id, blocked.run_id, "a new turn, not a continuation of the blocked run");
  assert.equal(getExecutionRun(second.run_id, ROOT).state, "EXECUTING");
  assert.equal(payloads.length, 1);
  assert.match(payloads[0], /second instruction/);
  assert.equal(payloads[0].includes("first instruction"), false, "the blocked instruction is not re-pasted");
});

await test("a run parked NEEDS_INPUT by the old behaviour is recoverable, not sticky", async () => {
  // Exactly the shape found in the live store.
  const created = createQueuedRun({ laneId: LANE, instruction: "stuck instruction", worktreePath: WT, root: ROOT });
  transitionExecutionRun(created.run.run_id, "NEEDS_INPUT", {
    root: ROOT, origin: "system", reason: "provider_prompt_not_ready",
  });
  const parked = getExecutionRun(created.run.run_id, ROOT);
  assert.equal(parked.state, "NEEDS_INPUT");
  assert.equal(parked.delivery.acknowledged, false);
  assert.equal(undeliveredPromptBlocked(parked), true);

  const payloads = [];
  const out = await deliverManagedLaneInstruction(LANE, "move on", sendOpts(
    async (laneId, instruction) => { payloads.push(instruction); return deliveringSend(laneId, instruction); },
  ));
  assert.equal(out.ok, true);
  assert.notEqual(out.run_id, created.run.run_id);
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state, "FAILED");
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state_reason, UNDELIVERED_PROMPT_BLOCK);
  assert.equal(payloads[0].includes("stuck instruction"), false);
});

await test("a genuine NEEDS_INPUT question still continues the same run", async () => {
  // The protective behaviour must survive: this run WAS delivered and the agent
  // asked something the composer can answer.
  const created = createQueuedRun({ laneId: LANE, instruction: "do it", worktreePath: WT, root: ROOT });
  transitionExecutionRun(created.run.run_id, "EXECUTING", { root: ROOT });
  const { submitAgentReport } = await import("../lib/vacilando/execution-run-report.mjs");
  submitAgentReport(created.run.run_id, {
    type: "needs_input", message: "Which default do you want?", cwd: WT, laneId: LANE, root: ROOT,
  });
  const asked = getExecutionRun(created.run.run_id, ROOT);
  assert.equal(asked.state, "NEEDS_INPUT");
  assert.equal(undeliveredPromptBlocked(asked), false, "a delivered run that asked a question is not prompt-blocked");

  const out = await deliverManagedLaneInstruction(LANE, "the first one", sendOpts(deliveringSend));
  assert.equal(out.ok, true);
  assert.equal(out.run_id, created.run.run_id, "an answer continues the SAME run");
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state, "EXECUTING");
});

// ------------------------------------- law 4: the operator is told the truth --

await test("the notice tells the operator where the answer actually lives", () => {
  const blocked = deliveryNotice({
    ok: false, error: PROMPT_NOT_READY_ERROR, status: "failed", needs_terminal_operator: true,
    prompt_readiness: { summary: 'Claude is waiting on a permission prompt: "Do you want to proceed?"', needs_terminal_operator: true },
  });
  assert.equal(blocked.kind, "err");
  assert.match(blocked.text, /was not sent/i);
  // Terminal guidance survives ONLY for a screen with nothing selectable — a login
  // URL, a free-text field. It says WHY, so the operator is not sent to a terminal
  // to hunt for a choice that does not exist there either.
  assert.match(blocked.text, /nothing to pick/i);
  assert.match(blocked.text, /agent's terminal/i);
  assert.equal(blocked.text.includes("provider_prompt_not_ready"), false);
  // And it must NOT claim Vacilando is incapable of answering prompts as a class —
  // that sentence is what sent the Director to a terminal for an ordinary permission
  // prompt, which is the dead end this slice removes.
  assert.equal(/cannot answer it for you/i.test(blocked.text), false);

  // A blocked pane whose prompt DOES offer choices is answerable in the lane, and
  // the already-queued instruction continues itself once it is answered.
  const answerable = deliveryNotice({
    ok: false, error: PROMPT_NOT_READY_ERROR,
    prompt_readiness: {
      summary: 'Claude is waiting on a permission prompt: "Do you want to proceed?"',
      blocker_kind: "permission",
      needs_terminal_operator: false,
    },
  });
  assert.match(answerable.text, /Answer it above/i);
  assert.match(answerable.text, /do not need to send it again/i);
  assert.equal(/terminal/i.test(answerable.text), false, "an answerable prompt must never mention a terminal");

  const queued = deliveryNotice({
    ok: false, error: PROMPT_NOT_READY_ERROR, status: "queued", admission_queued: true,
    prompt_readiness: { summary: "The agent is mid-turn, not at an actionable prompt." },
  });
  assert.match(queued.text, /Queued/);
  assert.match(queued.text, /delivered when the agent is ready/);

  assert.match(deliveryErrorText(UNDELIVERED_PROMPT_BLOCK), /answer it in this lane/i);
  assert.equal(/answered in the terminal/i.test(deliveryErrorText(UNDELIVERED_PROMPT_BLOCK)), false);
  assert.equal(deliveryErrorText(UNDELIVERED_PROMPT_BLOCK).includes(UNDELIVERED_PROMPT_BLOCK), false);
});

process.stdout.write(`\n1..${pass + fail}\npass ${pass}\nfail ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
