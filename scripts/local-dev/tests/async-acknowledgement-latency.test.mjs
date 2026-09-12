#!/usr/bin/env node
/**
 * Intent acknowledgement latency — the number this mission exists to move.
 *
 * WHAT IS BEING MEASURED, AND WHY IT IS MEASURED THIS WAY. The operator symptom
 * is that pressing Approve can leave the browser waiting through the entire
 * trusted-host action — `database.read_census` carries a 180 s timeout and
 * `database.apply_promoted_migration` carries 600 s. A wall-clock test against a
 * real executor would measure GitHub and Postgres, be flaky, and prove nothing
 * about the architecture. What actually matters is STRUCTURAL: does the call
 * that answers the browser return before the executor does.
 *
 * So the executor here BLOCKS SYNCHRONOUSLY for a known interval. That is a
 * faithful model rather than a convenient one: the real executors run
 * `execFileSync` for gh and psql, so the event loop really is held. If
 * acknowledgement is coupled to execution, this test takes the full interval; if
 * it is not, it returns in single-digit milliseconds. The gap between those two
 * outcomes IS the defect, and it is deterministic on any machine.
 *
 * Isolated runtime only. Does not attach to live Claude or the deployed tenant.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync(join(tmpdir(), "vac-ack-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const Q15 = "docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json";

/** How long the modelled trusted-host action holds the event loop. */
const EXECUTOR_MS = 1200;
/**
 * The acknowledgement budget. The mission asks for "well below 500 ms locally
 * unless the architecture proves otherwise"; this asserts an order of magnitude
 * better than that, because once acknowledgement is decoupled the remaining work
 * is a grant mint and two file writes. A budget set at the mission's ceiling
 * would pass even if acknowledgement quietly regressed by 400 ms.
 */
const ACK_BUDGET_MS = 250;

const {
  requestGovernedAction,
  approveGovernedAction,
  getGovernedAction,
  tickGovernedActions,
  saveGovernedActionRecord,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");

let pass = 0;
let fail = 0;
const timings = [];
async function test(name, fn) {
  resetGovernedActionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  setGovernedActionExecuteImplForTests(null);
  setGovernedActionResumeImplForTests({});
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/**
 * A synchronous block, the way the real executors block.
 *
 * `await sleep()` would yield the event loop and let an early return look fast
 * for the wrong reason — it would be measuring Promise scheduling rather than
 * whether the HTTP answer waits for the work.
 */
function blockSync(ms) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, Math.min(25, end - Date.now()));
  }
}

function executingRun(laneId = "alloy-identity") {
  const queued = createQueuedRun({
    laneId,
    instruction: "Measure intent acknowledgement latency",
    worktreePath: join(REPO, "scripts/local-dev"),
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system", root: ROOT, reason: "delivered",
  });
  assert.equal(moved.ok, true, moved.error);
  return moved.run;
}

function censusProof() {
  return {
    action_key: ACTION_TYPES.DATABASE_READ_CENSUS,
    target: "alloy_deployed_primary",
    purpose: "Measure acknowledgement latency.",
    artifact_refs: [Q15],
    requested_mode: "read_only",
    reason_worker_cannot_execute: "no hosted credentials; alloy-ro has credential_access=false",
  };
}

function slowResult(rec) {
  blockSync(EXECUTOR_MS);
  return {
    ok: true,
    action: {
      id: "tha_slow",
      state: "completed",
      actionType: rec.action_key,
      inputs: { queryHash: "abc", databaseTarget: rec.target },
      result: { census: { org_count: 1 }, evidencePath: join(ROOT, "vacilando", "census.json") },
    },
  };
}

function fileOne(title = "Async Ack V1", laneId = "alloy-identity") {
  const run = executingRun(laneId);
  const mission = createMission({ slot: 1, title, objective: "Measure", status: "running" });
  const out = requestGovernedAction({
    ...censusProof(),
    mission_id: mission.mission_id,
    lane_id: laneId,
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.request.status, "awaiting_operator", out.request.escalation_reason || "");
  return out.request.request_id;
}

// ── The coupling, and the decoupling ─────────────────────────────────────────

await test("BASELINE — awaiting execution couples the answer to the work", async () => {
  // Kept deliberately as a test rather than deleted once fixed. It is the
  // control: it proves the harness can still SEE the old behaviour, so a green
  // result from the test below means acknowledgement was decoupled and not that
  // the measurement stopped working.
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const id = fileOne();
  const t0 = Date.now();
  const out = await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: true });
  const elapsed = Date.now() - t0;
  timings.push(["approve, awaiting execution (baseline)", elapsed]);
  assert.equal(out.ok, true, out.error);
  assert.equal(executions, 1);
  assert.ok(
    elapsed >= EXECUTOR_MS,
    `awaiting execution should cost at least the executor's ${EXECUTOR_MS}ms, took ${elapsed}ms`,
  );
});

await test("acknowledgement returns without waiting for the executor", async () => {
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const id = fileOne();
  const t0 = Date.now();
  const out = await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false });
  const elapsed = Date.now() - t0;
  timings.push(["approve, accepted only (after)", elapsed]);
  assert.equal(out.ok, true, out.error);
  assert.equal(out.accepted, true, "the answer must say the intent was accepted");
  assert.equal(executions, 0, "the executor must not have run inside the acknowledgement");
  assert.ok(
    elapsed < ACK_BUDGET_MS,
    `acknowledgement must be well under ${ACK_BUDGET_MS}ms, took ${elapsed}ms`,
  );
});

await test("acceptance is durable before the answer is given", async () => {
  // The whole safety argument for returning early. If the process died on the
  // next line, the decision, the authority and the execution ownership must all
  // already be on disk — otherwise "accepted" is a promise the system cannot keep.
  setGovernedActionExecuteImplForTests((rec) => slowResult(rec));
  const id = fileOne();
  await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false });
  const rec = getGovernedAction(id, ROOT);
  assert.equal(rec.operator_approval?.decision, "approved", "the decision must be persisted");
  assert.ok(rec.grant_id, "the capability the executor consumes must already exist");
  assert.ok(rec.async_execution?.accepted_at, "execution ownership must be recorded");
  assert.ok(rec.decision_timing?.accepted_at, "acceptance must be stamped");
  assert.equal(rec.execution_started_at, null, "acceptance is not execution");
});

await test("the accepted action is executed by the durable owner, not by the request", async () => {
  // No untracked background Promise is the durable execution model. The tick is
  // the owner; this drives it directly, exactly as the Gateway's recovery timer
  // does, with nothing left over from the HTTP call.
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const id = fileOne();
  await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  assert.equal(executions, 0);
  tickGovernedActions({ root: ROOT });
  assert.equal(executions, 1, "the tick must own the accepted action");
  assert.equal(getGovernedAction(id, ROOT).status, "complete");
});

await test("the durable owner does not execute an accepted action twice", async () => {
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const id = fileOne();
  await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  tickGovernedActions({ root: ROOT });
  tickGovernedActions({ root: ROOT });
  tickGovernedActions({ root: ROOT });
  assert.equal(executions, 1, "repeated ticks must not re-run a completed action");
});

await test("a duplicate approval after acceptance mints nothing and executes nothing", async () => {
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  const id = fileOne();
  const first = await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  assert.equal(first.accepted, true);
  const grantAfterFirst = getGovernedAction(id, ROOT).grant_id;
  const second = await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  assert.equal(second.already, true, "a second press converges on the decision that stands");
  assert.equal(second.duplicate, true);
  assert.equal(executions, 0);
  assert.equal(
    getGovernedAction(id, ROOT).grant_id, grantAfterFirst,
    "a duplicate press must not mint a second grant",
  );
});

// ── Restart and recovery ─────────────────────────────────────────────────────

await test("a Gateway restart between acceptance and execution loses nothing", async () => {
  // THE SAFETY ARGUMENT FOR 202, TESTED RATHER THAN ASSERTED. The process that
  // accepted the action is gone: no timer, no Promise, no in-memory anything.
  // What survives is the record on disk, and the tick is what reads it.
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const id = fileOne();
  await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  assert.equal(executions, 0, "nothing ran before the restart");
  const survived = getGovernedAction(id, ROOT);
  assert.equal(survived.status, "executing");
  assert.ok(survived.async_execution?.accepted_at);
  assert.ok(survived.grant_id, "the capability survived too, or execution would refuse");

  // The restart. Only the store crosses it.
  tickGovernedActions({ root: ROOT });
  assert.equal(executions, 1, "the durable owner picked it up after the restart");
  assert.equal(getGovernedAction(id, ROOT).status, "complete");
});

await test("an execution the Gateway died inside is settled, never replayed", async () => {
  // THE ONE RECOVERY THAT MUST NOT BE A RETRY. Nothing in the record can tell
  // "never ran" from "ran and we did not see the result", and for a migration
  // the difference is applying it twice. Both migration actions declare
  // maxAttempts 1; this honours that at the recovery layer rather than
  // discovering it at the executor.
  let executions = 0;
  setGovernedActionExecuteImplForTests((rec) => { executions += 1; return slowResult(rec); });
  const id = fileOne();
  await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  // Died mid-action: execution had started and never settled. Aged well past
  // the action's own declared timeout, because a record that started a moment
  // ago is indistinguishable from one running right now and must be left alone.
  const rec = getGovernedAction(id, ROOT);
  rec.execution_started_at = new Date(Date.now() - 60 * 60_000).toISOString();
  saveGovernedActionRecord(rec, ROOT);

  // A fresh one is NOT touched, which is the other half of the same rule.
  const freshId = fileOne("Still running", "alloy-identity-2");
  await approveGovernedAction(freshId, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  const fresh = getGovernedAction(freshId, ROOT);
  fresh.execution_started_at = new Date().toISOString();
  saveGovernedActionRecord(fresh, ROOT);

  tickGovernedActions({ root: ROOT });
  assert.equal(
    getGovernedAction(freshId, ROOT).status, "executing",
    "an execution that started moments ago must be left to finish",
  );
  assert.equal(executions, 0, "an interrupted trusted-host action must never be re-run");
  const after = getGovernedAction(id, ROOT);
  assert.equal(after.status, "failed");
  assert.equal(after.failure_code, "execution_interrupted");
  assert.match(after.failure_reason, /cannot be determined/i, "the ambiguity is reported, not guessed");
});

await test("acceptance does not bypass a refusal the operator's decision cannot cure", async () => {
  // Returning early must not turn a refusal into a success. The executor refuses
  // downstream; the request still lands on a visible terminal failure, and the
  // acceptance does not paper over it.
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "connection_failed" }));
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
    startLaneAgentSession: async () => ({ ok: true }),
  });
  const id = fileOne();
  const out = await approveGovernedAction(id, { actor: "operator", root: ROOT, awaitExecution: false, schedule: false });
  assert.equal(out.accepted, true);
  tickGovernedActions({ root: ROOT });
  const after = getGovernedAction(id, ROOT);
  assert.equal(after.status, "failed");
  assert.ok(after.failure_code, "a downstream refusal must still be a named failure");
});

// ── The composer empties on the press ────────────────────────────────────────

const View = await import("../apps/vacilando/public/gateway-view.mjs");
const LANE = "lane_ack_cert01";
const TEXT = "Continue the reconciliation and report what you find.";

await test("a send in flight is held outside the editable composer", () => {
  View.clearPendingSend(LANE);
  const rec = View.beginPendingSend(LANE, TEXT, { attachments: [] });
  assert.equal(rec.state, "sending");
  const html = View.renderPendingSend(LANE);
  assert.match(html, /Sending…/);
  assert.match(html, /Continue the reconciliation/, "the operator's words must stay on screen");
});

await test("an accepted send stops being pending, so it cannot double-render", () => {
  View.beginPendingSend(LANE, TEXT);
  const settled = View.settlePendingSend(LANE, { status: "queued" });
  assert.equal(settled.state, "accepted");
  assert.equal(settled.status, "queued");
  assert.equal(View.pendingSendFor(LANE), null);
  assert.equal(View.renderPendingSend(LANE), "", "the projection owns the message now");
});

await test("a refusal before acceptance gives the words back", () => {
  // current_run_active, send_in_progress, provider_prompt_not_ready and every
  // validation refusal land here: nothing was accepted, so nothing is lost.
  View.beginPendingSend(LANE, TEXT);
  const out = View.restorePendingSend(LANE, { currentDraft: "" });
  assert.equal(out.state, "restored");
  assert.equal(out.composer_is_free, true);
  assert.equal(out.text, TEXT);
  assert.equal(View.pendingSendFor(LANE), null, "restored text belongs to the composer again");
});

await test("a refusal never overwrites something the operator has since typed", () => {
  // The failure mode this exists to avoid is a worse data loss than the one it
  // repairs: silently pasting over live work while the operator is mid-sentence.
  View.beginPendingSend(LANE, TEXT);
  const out = View.restorePendingSend(LANE, { currentDraft: "actually, wait —" });
  assert.equal(out.state, "recoverable");
  assert.equal(out.composer_is_free, false);
  const html = View.renderPendingSend(LANE);
  assert.match(html, /Not sent/);
  assert.match(html, /Put it back in the composer/, "recovery has to be reachable");
  assert.match(html, /Continue the reconciliation/, "and the words are still there to recover");
  View.clearPendingSend(LANE);
});

await test("pending sends are per lane and cannot leak across them", () => {
  View.beginPendingSend(LANE, TEXT);
  View.beginPendingSend("lane_ack_cert02", "a different lane's message");
  assert.match(View.renderPendingSend(LANE), /Continue the reconciliation/);
  assert.match(View.renderPendingSend("lane_ack_cert02"), /a different lane/);
  assert.doesNotMatch(View.renderPendingSend(LANE), /a different lane/);
  View.clearPendingSend(LANE);
  View.clearPendingSend("lane_ack_cert02");
});

await test("the approval control distinguishes accepted from complete", () => {
  // ACCEPTED is not COMPLETE. The route answers as soon as the decision is
  // durable, so a control that said "Approved" would let the operator read a
  // finished action where there is a started one.
  const ga = { request_id: "gar_ack01", content_fingerprint: "fp", approve_label: "Approve", deny_label: "Deny" };
  View.setGovernedDecisionState(ga.request_id, "settled", { label: "Accepted" });
  const html = View.renderGovernedDecisionControls(ga);
  assert.match(html, /Accepted/);
  assert.ok(!/data-gw-governed-approve/.test(html), "an accepted decision offers nothing to press again");
  View.clearGovernedDecisionState(ga.request_id);
});

process.stdout.write("\nMEASURED\n");
for (const [label, ms] of timings) process.stdout.write(`  ${String(ms).padStart(6)} ms  ${label}\n`);
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
