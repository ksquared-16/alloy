#!/usr/bin/env node
/**
 * Provider session lifecycle — a healthy bound lane must never become unusable.
 *
 * Three defects made a migrated, correctly-bound Mac mini lane permanently
 * unsendable, and all three are covered here.
 *
 *  1. Stale-session reaping was Claude-only, so a dead CURSOR session stayed
 *     ACTIVE forever and blocked every replacement with lane_has_active_session.
 *  2. One open admission per lane was treated as "already handled". An
 *     admission stranded in PROVISIONING (in-flight tracking is process memory
 *     and does not survive a Gateway restart) is never re-driven, because only
 *     QUEUED rows are heads — so every later operator send returned that dead
 *     row, created no admission, and rested at waiting_for_agent_session.
 *  3. NEEDS_INPUT was reachable from prose, stranding runs in an operator state
 *     with no operator control to resolve it.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDurableLane, resetDevelopmentLanesForTests } from "../lib/vacilando/development-lane.mjs";
import {
  createQueuedRun,
  getExecutionRun,
  resetExecutionRunsForTests,
  transitionExecutionRun,
  patchRunFields,
} from "../lib/vacilando/execution-run.mjs";
import {
  createAdmissionRequest,
  reconcileStrandedProvisioning,
  resetAdmissionsForTests,
  transitionAdmission,
  readAdmissionStore,
} from "../lib/vacilando/execution-admission.mjs";
import {
  reconcileAgentSessionsWithoutRuntime,
  sessionIsExecutable,
  resetAgentSessionLifecycleForTests,
} from "../lib/vacilando/agent-session-lifecycle.mjs";
import {
  createAgentSession,
  getAgentSession,
  markAgentSessionActive,
  patchAgentSession,
  resetAgentSessionsForTests,
} from "../lib/vacilando/agent-session.mjs";
import {
  actionableOperatorInputForRun,
  reconcileNeedsInputWithoutInput,
} from "../lib/vacilando/operator-input.mjs";
import { WAIT_REASONS } from "../lib/vacilando/run-wait.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-psl-"));
const WT = join(ROOT, "wt-lane");
mkdirSync(join(WT, ".git"), { recursive: true });
writeFileSync(join(WT, ".git", "HEAD"), "ref: refs/heads/agent/claude/9-x\n");
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.ALLOY_MAX_ACTIVE_PROVIDERS = "3";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetAdmissionsForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function makeLane({ provider = "claude", tmux = "alloy-lane", node = null } = {}) {
  const out = createDurableLane({
    name: "Lane",
    binding: {
      worktree_path: WT,
      worktree_name: "wt-lane",
      branch: "agent/claude/9-x",
      provider,
      tmux_session: tmux,
      ...(node ? { node_id: node } : {}),
    },
    origin: "adopted",
    root: ROOT,
  });
  assert.ok(out.ok, "lane created");
  return out.lane;
}

function activeSession(laneId, provider, extra = {}) {
  const c = createAgentSession({ laneId, provider, root: ROOT, ...extra });
  assert.ok(c.ok, `session created: ${c.error || ""}`);
  markAgentSessionActive(c.session.agent_session_id, { root: ROOT });
  return c.session.agent_session_id;
}

const NO_PANES = { ok: true, panes: [] };

// ---------------------------------------------------------------- reaping

await test("Claude ACTIVE record with no pane is ENDED on positive proof", async () => {
  const lane = makeLane({ provider: "claude" });
  const id = activeSession(lane.lane_id, "claude");
  const out = await reconcileAgentSessionsWithoutRuntime({ root: ROOT, discover: async () => NO_PANES });
  assert.equal(out.ended.length, 1, "one session ended");
  assert.equal(getAgentSession(id, ROOT).state, "ENDED");
});

await test("REGRESSION: Cursor ACTIVE executable record with no pane is ENDED", async () => {
  const lane = makeLane({ provider: "cursor" });
  const id = activeSession(lane.lane_id, "cursor");
  const out = await reconcileAgentSessionsWithoutRuntime({ root: ROOT, discover: async () => NO_PANES });
  assert.equal(out.ended.length, 1, "a dead Cursor session must be reapable");
  assert.equal(out.ended[0].provider, "cursor");
  assert.equal(getAgentSession(id, ROOT).state, "ENDED");
});

await test("degraded pane observation reaps nothing", async () => {
  const lane = makeLane();
  const id = activeSession(lane.lane_id, "claude");
  const out = await reconcileAgentSessionsWithoutRuntime({
    root: ROOT,
    discover: async () => ({ ok: false, panes: [], error: "tmux_unavailable" }),
  });
  assert.equal(out.skipped, "pane_discovery_unavailable");
  assert.equal(getAgentSession(id, ROOT).state, "ACTIVE", "uncertainty must not end a session");
});

await test("SUSPENDED session is retained", async () => {
  const lane = makeLane();
  const id = activeSession(lane.lane_id, "claude");
  patchAgentSession(id, { state: "SUSPENDED" }, { root: ROOT });
  const out = await reconcileAgentSessionsWithoutRuntime({ root: ROOT, discover: async () => NO_PANES });
  assert.equal(out.ended.length, 0);
  assert.equal(getAgentSession(id, ROOT).state, "SUSPENDED");
});

await test("session bound to ANOTHER node is not reaped locally", async () => {
  const lane = makeLane({ node: "node_somewhere_else" });
  const id = activeSession(lane.lane_id, "claude");
  const out = await reconcileAgentSessionsWithoutRuntime({ root: ROOT, discover: async () => NO_PANES });
  assert.equal(out.ended.length, 0, "not locally visible is not absent");
  assert.equal(getAgentSession(id, ROOT).state, "ACTIVE");
});

await test("non-executable attached transcript is retained", async () => {
  const lane = makeLane({ provider: "cursor", tmux: null });
  const id = activeSession(lane.lane_id, "cursor", { executable: false, providerSessionId: "ide-1" });
  const out = await reconcileAgentSessionsWithoutRuntime({ root: ROOT, discover: async () => NO_PANES });
  assert.equal(out.ended.length, 0, "a read-only transcript has no pane by design");
  assert.equal(getAgentSession(id, ROOT).state, "ACTIVE");
  assert.equal(sessionIsExecutable({ executable: false }, null), false);
});

await test("a live provider pane keeps its session", async () => {
  const lane = makeLane({ provider: "claude", tmux: "alloy-lane" });
  const id = activeSession(lane.lane_id, "claude");
  const out = await reconcileAgentSessionsWithoutRuntime({
    root: ROOT,
    discover: async () => ({ ok: true, panes: [{ session: "alloy-lane", command: "claude", cwd: WT }] }),
  });
  assert.equal(out.ended.length, 0);
  assert.equal(getAgentSession(id, ROOT).state, "ACTIVE");
});

// ------------------------------------------------------------- admissions

await test("REGRESSION: stranded PROVISIONING admission is returned to the queue", async () => {
  const lane = makeLane();
  const run = createQueuedRun({ laneId: lane.lane_id, instruction: "A", root: ROOT });
  const a = createAdmissionRequest({ laneId: lane.lane_id, runId: run.run.run_id, root: ROOT });
  transitionAdmission(a.request.admission_id, "PROVISIONING", { root: ROOT });
  // Simulates a Gateway restart: durable row says PROVISIONING, no process is.
  const out = reconcileStrandedProvisioning({ root: ROOT });
  assert.equal(out.requeued.length, 1);
  const store = readAdmissionStore(ROOT);
  const rec = store.requests.find((r) => r.admission_id === a.request.admission_id);
  assert.equal(rec.state, "QUEUED", "must become re-drivable");
});

await test("stranded PROVISIONING whose run is gone FAILS instead of blocking", async () => {
  const lane = makeLane();
  const run = createQueuedRun({ laneId: lane.lane_id, instruction: "A", root: ROOT });
  const a = createAdmissionRequest({ laneId: lane.lane_id, runId: run.run.run_id, root: ROOT });
  transitionAdmission(a.request.admission_id, "PROVISIONING", { root: ROOT });
  transitionExecutionRun(run.run.run_id, "FAILED", { reason: "x", origin: "system", root: ROOT });
  reconcileStrandedProvisioning({ root: ROOT });
  const store = readAdmissionStore(ROOT);
  const rec = store.requests.find((r) => r.admission_id === a.request.admission_id);
  assert.equal(rec.state, "FAILED");
});

await test("REGRESSION: a new send adopts an open admission whose run is terminal", async () => {
  const lane = makeLane();
  const dead = createQueuedRun({ laneId: lane.lane_id, instruction: "old", root: ROOT });
  const a = createAdmissionRequest({ laneId: lane.lane_id, runId: dead.run.run_id, root: ROOT });
  transitionAdmission(a.request.admission_id, "PROVISIONING", { root: ROOT });
  transitionExecutionRun(dead.run.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(dead.run.run_id, "COMPLETE", { reason: "done", origin: "agent", root: ROOT });

  // The exact production shape: a brand new operator send on a healthy lane.
  const fresh = createQueuedRun({ laneId: lane.lane_id, instruction: "new", root: ROOT });
  const b = createAdmissionRequest({ laneId: lane.lane_id, runId: fresh.run.run_id, root: ROOT });
  assert.ok(b.ok);
  assert.equal(b.adopted, true, "the stale row must be adopted, not silently reused");
  assert.equal(b.request.run_id, fresh.run.run_id, "admission must point at the NEW run");
  assert.equal(b.request.state, "QUEUED", "and must be re-drivable");
});

await test("an open admission for a still-live run is not stolen", async () => {
  const lane = makeLane();
  const live = createQueuedRun({ laneId: lane.lane_id, instruction: "live", root: ROOT });
  const a = createAdmissionRequest({ laneId: lane.lane_id, runId: live.run.run_id, root: ROOT });
  const again = createAdmissionRequest({ laneId: lane.lane_id, runId: live.run.run_id, root: ROOT });
  assert.equal(again.request.admission_id, a.request.admission_id);
  assert.notEqual(again.adopted, true);
});

// --------------------------------------------------------- wait semantics

await test("capacity waiting is its own reason, not a session wait", () => {
  assert.ok(WAIT_REASONS.waiting_for_provider_capacity, "capacity wait exists");
  assert.equal(WAIT_REASONS.waiting_for_provider_capacity.resource_type, "provider_capacity");
  assert.ok(WAIT_REASONS.provider_provisioning, "provisioning-in-progress exists");
  assert.ok(WAIT_REASONS.provider_start_failed, "start failure is actionable");
  assert.equal(WAIT_REASONS.provider_start_failed.policy, "bounded");
  assert.ok(WAIT_REASONS.waiting_for_executable_transport, "transport wait exists");
  // Bounded on purpose: needs_operator_input is the ONE unbounded reason, and a
  // pane stuck on a modal must escalate rather than rest forever.
  assert.equal(WAIT_REASONS.provider_prompt_block.policy, "bounded");
  assert.ok(WAIT_REASONS.provider_prompt_block.bound_ms > 0);
  // The session wait stays bounded and impossible-when-unbindable.
  assert.equal(WAIT_REASONS.waiting_for_agent_session.impossible_when, "no_session_binding");
});

// ------------------------------------------------------------ NEEDS_INPUT

await test("REGRESSION: provider prose alone cannot manufacture NEEDS_INPUT", async () => {
  const lane = makeLane();
  const run = createQueuedRun({ laneId: lane.lane_id, instruction: "go", root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(run.run.run_id, "NEEDS_INPUT", {
    reason: "Operator approved, but the trusted host still refused (grant_pull_request_mismatch).",
    origin: "system",
    root: ROOT,
  });
  assert.equal(actionableOperatorInputForRun(getExecutionRun(run.run.run_id, ROOT), { root: ROOT }), null);
  const out = reconcileNeedsInputWithoutInput({ root: ROOT });
  assert.equal(out.reconciled.length, 1, "an unresolvable operator state must be reconciled");
  const after = getExecutionRun(run.run.run_id, ROOT);
  assert.notEqual(after.state, "NEEDS_INPUT");
  // COLLECTED, NOT FAILED. This asserted FAILED, and the failure reason printed
  // back was the run's own NEEDS_INPUT reason — a mission reported as failed by
  // quoting the question it was waiting on. ABANDONED already means "not going
  // to continue, and recoverable", which is what actually happened.
  assert.equal(after.state, "ABANDONED", "collected out of an impossible state, not reported as a failure");
  assert.equal(after.state_reason, "needs_input_without_operator_input");
});

await test("a real worker question keeps the run in NEEDS_INPUT", async () => {
  const lane = makeLane();
  const run = createQueuedRun({ laneId: lane.lane_id, instruction: "go", root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(run.run.run_id, "NEEDS_INPUT", { reason: "asked", origin: "agent", root: ROOT });
  patchRunFields(run.run.run_id, {
    agent_report: { type: "needs_input", report_id: "arep_1", message: "Which target?", choices: [{ id: "a", label: "A" }] },
  }, { root: ROOT });
  const input = actionableOperatorInputForRun(getExecutionRun(run.run.run_id, ROOT), { root: ROOT });
  assert.equal(input.kind, "agent_question");
  assert.equal(input.choices, 1, "the operator control has choices to render");
  const out = reconcileNeedsInputWithoutInput({ root: ROOT });
  assert.equal(out.reconciled.length, 0, "a legitimate question must never be reconciled away");
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("a suspended provider is actionable operator input", () => {
  const input = actionableOperatorInputForRun(
    { run_id: "r", state: "NEEDS_INPUT", provider_suspension: { state: "SUSPENDED" } },
    { root: ROOT },
  );
  assert.equal(input.kind, "provider_suspension");
});

await test("an answered question no longer strands the run", async () => {
  const lane = makeLane();
  const run = createQueuedRun({ laneId: lane.lane_id, instruction: "go", root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(run.run.run_id, "NEEDS_INPUT", { reason: "asked", origin: "agent", root: ROOT });
  // The operator answered: the report is superseded by a progress report.
  patchRunFields(run.run.run_id, {
    agent_report: { type: "progress", report_id: "arep_2", message: "continuing" },
  }, { root: ROOT });
  const out = reconcileNeedsInputWithoutInput({ root: ROOT });
  assert.equal(out.reconciled.length, 1, "a stale/answered input cannot hold NEEDS_INPUT");
  assert.notEqual(getExecutionRun(run.run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("a malformed input record cannot leave a run in NEEDS_INPUT", async () => {
  const lane = makeLane();
  const run = createQueuedRun({ laneId: lane.lane_id, instruction: "go", root: ROOT });
  transitionExecutionRun(run.run.run_id, "EXECUTING", { reason: "d", origin: "system", root: ROOT });
  transitionExecutionRun(run.run.run_id, "NEEDS_INPUT", { reason: "asked", origin: "agent", root: ROOT });
  patchRunFields(run.run.run_id, { agent_report: { type: "needs_input_typo", report_id: null } }, { root: ROOT });
  const out = reconcileNeedsInputWithoutInput({ root: ROOT });
  assert.equal(out.reconciled.length, 1);
  assert.notEqual(getExecutionRun(run.run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("REGRESSION: the governor tick reaps runtime-absent sessions, not only boot", async () => {
  const lane = makeLane({ provider: "claude", tmux: "alloy-lane" });
  const id = activeSession(lane.lane_id, "claude");
  // No tmux server on this hermetic root => zero panes, truthfully observed.
  const { reconcileGovernor } = await import("../lib/vacilando/execution-reconcile.mjs");
  await reconcileGovernor({ root: ROOT, reason: "test", depth: "cheap" });
  assert.equal(
    getAgentSession(id, ROOT).state,
    "ENDED",
    "a pane closed while the Gateway runs must be reaped without a restart",
  );
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
