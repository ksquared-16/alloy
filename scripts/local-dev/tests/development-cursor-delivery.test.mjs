#!/usr/bin/env node
/**
 * Cursor send is fail-closed unless a live tmux cursor-agent pane exists.
 * Transcript readability is not delivery.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.VACILANDO_SKIP_NODE_PROBE = "1";
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cursor-delivery-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.HOME = ROOT;
process.env.ALLOY_CONFIG_FILE = join(ROOT, ".config", "alloy-dev", "config");

const WT = join(ROOT, "Code", "alloy-worktrees", "wt5-vacilando-gateway-v2");
mkdirSync(WT, { recursive: true });
mkdirSync(join(ROOT, "metadata"), { recursive: true });
mkdirSync(join(ROOT, ".config", "alloy-dev"), { recursive: true });
writeFileSync(join(ROOT, ".config", "alloy-dev", "config"), [
  `ALLOY_REPO="${ROOT}/Alloy"`,
  `ALLOY_WORKTREE_ROOT="${ROOT}/Code/alloy-worktrees"`,
  `ALLOY_RUNTIME_ROOT="${ROOT}"`,
  "",
].join("\n"));
writeFileSync(join(ROOT, "metadata", "wt5-vacilando-gateway-v2.env"), [
  'ALLOY_WORKTREE_NAME="wt5-vacilando-gateway-v2"',
  'ALLOY_WORKTREE_SLOT="5"',
  `ALLOY_WORKTREE_PATH="${WT}"`,
  'ALLOY_WORKTREE_BRANCH="agent/cursor/5-vac-run-idle-complete"',
  'ALLOY_AGENT="cursor"',
  'ALLOY_SPRINT_NAME="vacilando-gateway-v2"',
  'ALLOY_WORKER_LIFECYCLE="active"',
  "",
].join("\n"));

const { ensureVacilandoSpecialistLane, resetDevelopmentLanesForTests, getDurableLane, setLanePreferredProvider } = await import("../lib/vacilando/development-lane.mjs");
const { cmdAttachCursorSession } = await import("../lib/vacilando/commands/node-ops.mjs");
const { resetAgentSessionsForTests, activeAgentSessionForLane, listAgentSessionsForLane } = await import("../lib/vacilando/agent-session.mjs");
const {
  startLaneAgentSession,
  setAgentSessionLifecycleImplForTests,
  resetAgentSessionLifecycleForTests,
} = await import("../lib/vacilando/agent-session-lifecycle.mjs");
const { setAlloyAdapterImplForTests, resetAlloyAdapterImplForTests } = await import("../lib/vacilando/alloy-dev-adapter.mjs");
const { deliverManagedLaneInstruction } = await import("../lib/vacilando/execution-run-send.mjs");
const { CURSOR_DELIVERY_UNAVAILABLE } = await import("../lib/vacilando/lanes.mjs");
const {
  listExecutionRunsForLane,
  lastInstructionFromRun,
  createQueuedRun,
  getExecutionRun,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const { reconcileUndeliveredRuns, DELIVERY_ACK_TIMEOUT_MS } = await import("../lib/vacilando/execution-stale.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

await test("Cursor send without tmux transport fails and never EXECUTING", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  resetAlloyAdapterImplForTests();
  setAlloyAdapterImplForTests({
    listPanes: async () => [],
  });
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  const bound = cmdAttachCursorSession({
    laneId: vac.lane.lane_id,
    worktree: "wt5-vacilando-gateway-v2",
    providerSessionId: "de15219d-59f5-4841-9182-05b2687a72a6",
    root: ROOT,
  });
  assert.equal(bound.ok, true, bound.error);
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: vac.lane.lane_id,
      durable: true,
      worktree: { path: WT, managed: true, name: "wt5-vacilando-gateway-v2" },
      tmux: { alive: false, session: null, pane_id: null },
      binding: bound.lane.binding,
      preferred_provider: "cursor",
      claude: { presence: "absent" },
    }),
    startRuntime: async () => ({ ok: false, error: "provider_start_failed" }),
  });
  let sent = 0;
  const out = await deliverManagedLaneInstruction(vac.lane.lane_id, "Do not treat this as delivered.", {
    root: ROOT,
    provider: "cursor",
    sendLaneInstruction: async () => {
      sent += 1;
      throw new Error("tmux paste must not run when Cursor has no executable transport");
    },
  });
  assert.equal(sent, 0);
  assert.equal(out.ok, false);
  assert.equal(out.error, CURSOR_DELIVERY_UNAVAILABLE);
  assert.equal(out.execution_run?.state, "FAILED");
  assert.notEqual(out.execution_run?.state, "EXECUTING");
  assert.equal(out.execution_run?.started_at, null);
  assert.equal(out.execution_run?.delivery?.acknowledged, false);
  const runs = listExecutionRunsForLane(vac.lane.lane_id, ROOT);
  assert.equal(runs[0].state, "FAILED");
  const kept = lastInstructionFromRun(runs[0]);
  assert.equal(kept.instruction, "Do not treat this as delivered.");
  assert.equal(kept.status, "failed");
  const rec = getDurableLane(vac.lane.lane_id, ROOT);
  assert.equal(rec.preferred_provider, "claude");
  assert.equal(rec.binding.provider, "cursor");
  resetAgentSessionLifecycleForTests();
});

await test("governor fails undelivered Cursor runs immediately and ignores Claude queue", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  const bound = cmdAttachCursorSession({
    laneId: vac.lane.lane_id,
    worktree: "wt5-vacilando-gateway-v2",
    providerSessionId: "de15219d-59f5-4841-9182-05b2687a72a6",
    root: ROOT,
  });
  assert.equal(bound.ok, true, bound.error);
  setLanePreferredProvider(vac.lane.lane_id, "cursor", { root: ROOT });
  const leftover = createQueuedRun({
    laneId: vac.lane.lane_id,
    instruction: "stale cursor queue",
    nowMs: 1_000,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(leftover.ok, true, leftover.error);
  const swept = reconcileUndeliveredRuns({ root: ROOT, nowMs: 1_000 });
  assert.equal(swept.count, 1);
  const failed = getExecutionRun(leftover.run.run_id, ROOT);
  assert.equal(failed.state, "FAILED");
  assert.equal(failed.state_reason, CURSOR_DELIVERY_UNAVAILABLE);
  assert.equal(failed.delivery?.acknowledged, false);
  assert.equal(getDurableLane(vac.lane.lane_id, ROOT).preferred_provider, "claude");
});

await test("governor fails EXECUTING without delivery ack after timeout; Claude QUEUED is kept", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  setLanePreferredProvider(vac.lane.lane_id, "claude", { root: ROOT });
  const queued = createQueuedRun({
    laneId: vac.lane.lane_id,
    instruction: "wait for claude session",
    nowMs: 1_000,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const keep = reconcileUndeliveredRuns({ root: ROOT, nowMs: 1_000 + DELIVERY_ACK_TIMEOUT_MS + 1 });
  assert.equal(keep.count, 0);
  assert.equal(getExecutionRun(queued.run.run_id, ROOT).state, "QUEUED");

  resetExecutionRunsForTests(ROOT);
  const created = createQueuedRun({
    laneId: vac.lane.lane_id,
    instruction: "executing without ack",
    nowMs: 1_000,
    origin: "operator",
    root: ROOT,
  });
  const exec = transitionExecutionRun(created.run.run_id, "EXECUTING", {
    reason: "false_executing",
    origin: "system",
    nowMs: 1_000,
    root: ROOT,
  });
  assert.equal(exec.ok, true, exec.error);
  assert.equal(exec.run.delivery?.acknowledged, false);
  const early = reconcileUndeliveredRuns({ root: ROOT, nowMs: 1_000 + DELIVERY_ACK_TIMEOUT_MS - 1 });
  assert.equal(early.count, 0);
  const late = reconcileUndeliveredRuns({ root: ROOT, nowMs: 1_000 + DELIVERY_ACK_TIMEOUT_MS + 1 });
  assert.equal(late.count, 1);
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state, "FAILED");
  assert.equal(getExecutionRun(created.run.run_id, ROOT).state_reason, "delivery_unacknowledged");
});

await test("preferred Claude start supersedes observation-only Cursor and binds Claude", async () => {
  resetDevelopmentLanesForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  resetAlloyAdapterImplForTests();
  setAlloyAdapterImplForTests({ listPanes: () => [] });
  const vac = ensureVacilandoSpecialistLane({ root: ROOT });
  const bound = cmdAttachCursorSession({
    laneId: vac.lane.lane_id,
    worktree: "wt5-vacilando-gateway-v2",
    providerSessionId: "de15219d-59f5-4841-9182-05b2687a72a6",
    root: ROOT,
  });
  assert.equal(bound.ok, true, bound.error);
  const cursorSess = activeAgentSessionForLane(vac.lane.lane_id, ROOT);
  assert.equal(cursorSess.provider, "cursor");
  setLanePreferredProvider(vac.lane.lane_id, "claude", { root: ROOT });
  let observed = 0;
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => {
      observed += 1;
      const base = {
        lane_id: vac.lane.lane_id,
        durable: true,
        worktree: { path: WT, managed: true, name: "wt5-vacilando-gateway-v2" },
        binding: getDurableLane(vac.lane.lane_id, ROOT).binding,
        preferred_provider: "claude",
      };
      if (observed === 1) {
        return { ...base, tmux: { alive: false, session: null }, claude: { presence: "absent" } };
      }
      return {
        ...base,
        tmux: { alive: true, session: "alloy-vacilando", pane_id: "%99", cwd: WT, command: "claude" },
        claude: { presence: "present" },
      };
    },
    startRuntime: async () => ({
      ok: true,
      tmux_session: "alloy-vacilando",
      pane_id: "%99",
      cwd: WT,
      created: { tmux: true, provider: true },
    }),
    spawnClaude: async () => {
      throw new Error("spawnClaude must not run after startRuntime created the provider");
    },
  });
  const start = await startLaneAgentSession({ laneId: vac.lane.lane_id, root: ROOT, origin: "operator" });
  assert.equal(start.ok, true, start.error);
  assert.equal(start.provider, "claude");
  const rec = getDurableLane(vac.lane.lane_id, ROOT);
  assert.equal(rec.binding.provider, "claude");
  assert.equal(rec.preferred_provider, "claude");
  assert.equal(rec.binding.tmux_session, "alloy-vacilando");
  assert.equal(rec.binding.worktree_path, WT);
  const live = activeAgentSessionForLane(vac.lane.lane_id, ROOT);
  assert.equal(live.provider, "claude");
  assert.notEqual(live.agent_session_id, cursorSess.agent_session_id);
  const ended = listAgentSessionsForLane(vac.lane.lane_id, ROOT).find((s) => s.agent_session_id === cursorSess.agent_session_id);
  assert.equal(ended.state, "ENDED");
  assert.equal(ended.end_reason, "observation_only_superseded");
  assert.equal(ended.provider_session_id, "de15219d-59f5-4841-9182-05b2687a72a6");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
rmSync(ROOT, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
