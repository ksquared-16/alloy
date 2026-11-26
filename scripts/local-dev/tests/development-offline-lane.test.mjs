#!/usr/bin/env node
/**
 * Offline durable-lane semantics: bound-without-agent is valid.
 * Isolated runtime. Does not attach to live Claude or spawn tmux.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDurableLane, resetDevelopmentLanesForTests } from "../lib/vacilando/development-lane.mjs";
import {
  activeRunForLane,
  getExecutionRun,
  listExecutionRunsForLane,
  resetExecutionRunsForTests,
} from "../lib/vacilando/execution-run.mjs";
import { deliverManagedLaneInstruction } from "../lib/vacilando/execution-run-send.mjs";
import {
  admissionForLane,
  evaluateAdmissionQueue,
  resetAdmissionsForTests,
  setAdmissionImplForTests,
} from "../lib/vacilando/execution-admission.mjs";
import {
  attachLaneAgentSessions,
  startLaneAgentSession,
  setAgentSessionLifecycleImplForTests,
  resetAgentSessionLifecycleForTests,
} from "../lib/vacilando/agent-session-lifecycle.mjs";
import { listAgentSessionsForLane, resetAgentSessionsForTests } from "../lib/vacilando/agent-session.mjs";
import { resetAlloyAdapterImplForTests, setAlloyAdapterImplForTests } from "../lib/vacilando/alloy-dev-adapter.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-offline-"));
const WT = join(ROOT, "wt-comms");
mkdirSync(WT, { recursive: true });
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetAdmissionsForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  resetAlloyAdapterImplForTests();
  setAlloyAdapterImplForTests({ listPanes: () => [] });
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: false, available: false }),
    provisionLaneBinding: () => {
      throw new Error("must not sprint-start a bound lane");
    },
  });
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function makeComms() {
  return createDurableLane({
    name: "Communications",
    binding: { worktree_path: WT, worktree_name: "wt-comms", provider: "claude" },
    origin: "adopted",
    root: ROOT,
  });
}

await test("send to bound offline lane stays QUEUED and does not FAILED", async () => {
  const created = makeComms();
  assert.equal(created.ok, true, created.error);
  const out = await deliverManagedLaneInstruction(created.lane.lane_id, "Ship inbound SMS routing.", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async () => {
      throw new Error("must not attempt pane delivery");
    },
  });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.status, "queued");
  assert.equal(out.session_required, true);
  assert.equal(out.execution_run.state, "QUEUED");
  assert.notEqual(out.execution_run.state, "FAILED");
  assert.equal(activeRunForLane(created.lane.lane_id, ROOT).state, "QUEUED");
  assert.equal(listExecutionRunsForLane(created.lane.lane_id, ROOT).some((r) => r.state === "FAILED"), false);
  assert.equal(admissionForLane(created.lane.lane_id, ROOT).state, "QUEUED");
});

await test("second send replaces queued instruction instead of refusing", async () => {
  const created = makeComms();
  const first = await deliverManagedLaneInstruction(created.lane.lane_id, "Ship inbound SMS routing.", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async () => {
      throw new Error("must not attempt pane delivery");
    },
  });
  assert.equal(first.ok, true);
  const second = await deliverManagedLaneInstruction(created.lane.lane_id, "Ship inbound SMS plus retries.", {
    root: ROOT,
    worktreePath: WT,
    sendLaneInstruction: async () => {
      throw new Error("must not attempt pane delivery");
    },
  });
  assert.equal(second.ok, true, second.error);
  assert.equal(second.status, "queued");
  assert.equal(second.replaced, true);
  assert.equal(second.session_required, true);
  const run = activeRunForLane(created.lane.lane_id, ROOT);
  assert.equal(run.state, "QUEUED");
  assert.equal(run.instruction, "Ship inbound SMS plus retries.");
  assert.equal(listExecutionRunsForLane(created.lane.lane_id, ROOT).length, 1);
});

await test("inspect of bound offline lane does not mint an Agent Session", async () => {
  const created = makeComms();
  const lane = {
    lane_id: created.lane.lane_id,
    label: "Communications",
    durable: true,
    claude: { presence: "absent" },
    tmux: { alive: false, session: null, command: "", title: "", cwd: WT },
    worktree: { path: WT, name: "wt-comms", managed: true },
    binding: created.lane.binding,
  };
  const before = listAgentSessionsForLane(created.lane.lane_id, ROOT).length;
  const [out] = attachLaneAgentSessions([lane], ROOT);
  assert.equal(out.agent_session, null);
  assert.equal(out.runtime, "offline");
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, before);
});

await test("admission does not sprint-start when a worktree binding already exists", async () => {
  const created = makeComms();
  let provisioned = 0;
  setAdmissionImplForTests({
    canProvisionNow: () => ({ ok: true, available: true }),
    provisionLaneBinding: () => {
      provisioned += 1;
      throw new Error("must not provision a second worktree");
    },
    startProviderOnBinding: async () => ({ ok: false, error: "runtime_pane_missing", skip_queue: true }),
  });
  const send = await deliverManagedLaneInstruction(created.lane.lane_id, "Queue this.", { root: ROOT, worktreePath: WT });
  assert.equal(send.ok, true);
  const ev = await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(provisioned, 0);
  assert.equal(ev.skipped, "runtime_pane_missing");
  assert.equal(getExecutionRun(send.run_id, ROOT).state, "QUEUED");
});

await test("Start Session without a pane does not mint an Agent Session when runtime start fails", async () => {
  const created = makeComms();
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: false, pane_id: null },
      worktree: { path: WT },
    }),
    spawnClaude: () => {
      throw new Error("must not spawn without a pane");
    },
    startRuntime: async () => ({ ok: false, error: "provider_start_failed", rolled_back: true }),
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "provider_start_failed");
  assert.equal(out.start_session_implemented, true);
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, 0);
});

await test("Start Session with a pane creates a session only after spawn succeeds", async () => {
  const created = makeComms();
  const spawnCalls = [];
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: true, pane_id: "%9", session: "alloy-comms" },
      worktree: { path: WT },
    }),
    spawnClaude: ({ sessionId }) => {
      spawnCalls.push(sessionId);
      return { ok: true, provider_session_id: sessionId };
    },
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(spawnCalls.length, 1);
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, 1);
});

await test("unbound idle send queues admission without FAILED", async () => {
  const created = createDurableLane({ name: "Billing", origin: "created", root: ROOT });
  const out = await deliverManagedLaneInstruction(created.lane.lane_id, "Add invoice export.", { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.status, "queued");
  assert.equal(out.session_required, false);
  assert.equal(out.execution_run.state, "QUEUED");
  assert.equal(admissionForLane(created.lane.lane_id, ROOT).state, "QUEUED");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
