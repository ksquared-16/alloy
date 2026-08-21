#!/usr/bin/env node
/**
 * CASE C: start a persistent agent session on an already-bound worktree.
 * Isolated runtime. Does not attach to live Claude unless a test mocks tmux.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { createDurableLane, resetDevelopmentLanesForTests, setPreferredLaneProvider } from "../lib/vacilando/development-lane.mjs";
import {
  activeRunForLane,
  createQueuedRun,
  getExecutionRun,
  patchRunFields,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
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
  acceptOrientationReport,
  reconcilePendingOrientation,
  buildContinuationInstruction,
} from "../lib/vacilando/agent-session-lifecycle.mjs";
import { listAgentSessionsForLane, resetAgentSessionsForTests, activeAgentSessionForLane, patchAgentSession, createAgentSession, markAgentSessionActive } from "../lib/vacilando/agent-session.mjs";
import {
  assessSessionStartCapacity,
  resetAlloyAdapterImplForTests,
  setAlloyAdapterImplForTests,
  persistentProviderArgv,
  startPersistentAgentSession,
  tmuxSessionNameForLane,
} from "../lib/vacilando/alloy-dev-adapter.mjs";
import { LANE_INSTRUCTION_MAX, unexpectedLaneControlFields } from "../lib/vacilando/lanes.mjs";
import { deliverExistingQueuedRun } from "../lib/vacilando/execution-run-send.mjs";

const ROOT = mkdtempSync(join(tmpdir(), "vac-casec-"));
const WT = join(ROOT, "wt-comms");
mkdirSync(join(WT, ".git"), { recursive: true });
writeFileSync(join(WT, ".git", "HEAD"), "ref: refs/heads/agent/claude/3-email-receiving-provisioning\n");
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";
process.env.ALLOY_MAX_ACTIVE_PROVIDERS = "3";

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetAdmissionsForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  resetAlloyAdapterImplForTests();
  setAlloyAdapterImplForTests({
    listPanes: () => [],
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
    binding: { worktree_path: WT, worktree_name: "wt-comms", branch: "agent/claude/3-email-receiving-provisioning", provider: "claude" },
    origin: "adopted",
    root: ROOT,
  });
}

await test("tmux name is alloy-* not the durable lane id", () => {
  const name = tmuxSessionNameForLane("Communications", "wt3-communications-inbound-sms");
  assert.equal(name, "alloy-communications");
  assert.equal(name.startsWith("lane_"), false);
});

await test("browser cannot provide tmux/path/command on Start Session", () => {
  const extra = unexpectedLaneControlFields({
    lane_id: "lane_abc",
    tmux_session: "alloy-hack",
    cwd: "/tmp",
    command: "claude -p",
  });
  assert.ok(extra.includes("tmux_session"));
  assert.ok(extra.includes("cwd"));
  assert.ok(extra.includes("command"));
});

await test("offline bound lane can request Start Session", async () => {
  const created = makeComms();
  let started = 0;
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: false, pane_id: null },
      worktree: { path: WT },
    }),
    startRuntime: async () => {
      started += 1;
      return { ok: true, tmux_session: "alloy-communications", pane_id: "%22", created: { tmux: true, provider: true }, cwd: WT };
    },
    spawnClaude: () => { throw new Error("adapter already started provider"); },
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.started, true);
  assert.equal(started, 1);
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, 1);
  assert.equal(out.tmux_session, "alloy-communications");
});

await test("no binding refuses Start Session", async () => {
  const created = createDurableLane({ name: "Billing", origin: "created", root: ROOT });
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: false },
      worktree: { path: null },
    }),
    startRuntime: async () => { throw new Error("must not start"); },
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "binding_missing");
});

await test("existing live agent refuses duplicate start", async () => {
  const created = makeComms();
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "present" },
      tmux: { alive: true, pane_id: "%1", session: "alloy-communications" },
      worktree: { path: WT },
    }),
    countClaude: () => 1,
    startRuntime: async () => { throw new Error("must not create a second runtime"); },
    spawnClaude: () => { throw new Error("must not spawn"); },
  });
  const first = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(first.ok, true);
  assert.equal(first.adopted, true);
  const second = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(second.ok, false);
  assert.equal(second.error, "agent_already_running");
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, 1);
});

await test("paper Cursor session does not block starting Claude", async () => {
  const created = makeComms();
  createAgentSession({
    laneId: created.lane.lane_id,
    provider: "cursor",
    providerSessionId: "cursor-paper",
    root: ROOT,
  });
  patchAgentSession(activeAgentSessionForLane(created.lane.lane_id, ROOT).agent_session_id, {
    state: "VERIFYING",
    provider: "cursor",
    tmux_session: null,
  }, { root: ROOT });
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "present" },
      tmux: { alive: true, pane_id: "%6", session: "alloy-vacilando" },
      worktree: { path: WT },
    }),
    countClaude: () => 1,
    startRuntime: async () => { throw new Error("must adopt existing Claude"); },
    spawnClaude: () => { throw new Error("must not spawn"); },
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.adopted, true);
  const live = activeAgentSessionForLane(created.lane.lane_id, ROOT);
  assert.equal(live.provider, "claude");
});

await test("paper Claude session does not block adopting live Cursor", async () => {
  const created = makeComms();
  setPreferredLaneProvider(created.lane.lane_id, "cursor", { root: ROOT });
  const paper = createAgentSession({
    laneId: created.lane.lane_id,
    provider: "claude",
    providerSessionId: "old-claude",
    root: ROOT,
  });
  assert.equal(paper.ok, true);
  markAgentSessionActive(paper.session.agent_session_id, { root: ROOT });
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      preferred_provider: "cursor",
      claude: { presence: "absent" },
      tmux: { alive: true, pane_id: "%10", session: "alloy-vacilando", command: "cursor-agent" },
      worktree: { path: WT },
    }),
    countClaude: () => 0,
    startRuntime: async () => { throw new Error("must adopt existing Cursor pane"); },
    spawnClaude: () => { throw new Error("must not spawn Claude"); },
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.adopted, true);
  const live = activeAgentSessionForLane(created.lane.lane_id, ROOT);
  assert.equal(live.provider, "cursor");
});

await test("preferred Cursor does not adopt a live Claude pane", async () => {
  const created = makeComms();
  setPreferredLaneProvider(created.lane.lane_id, "cursor", { root: ROOT });
  let startedProvider = null;
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      preferred_provider: "cursor",
      binding: { provider: "cursor", worktree_path: WT },
      claude: { presence: "present" },
      tmux: { alive: true, pane_id: "%6", session: "alloy-vacilando", command: "2.1.239" },
      worktree: { path: WT },
    }),
    countClaude: () => 1,
    startRuntime: async ({ rec }) => {
      startedProvider = rec.preferred_provider || rec.binding?.provider;
      return { ok: true, tmux_session: "alloy-vacilando", pane_id: "%6", created: { tmux: false, provider: true } };
    },
    spawnClaude: () => { throw new Error("must not spawn Claude for a Cursor lane"); },
  });
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(startedProvider, "cursor");
  const live = activeAgentSessionForLane(created.lane.lane_id, ROOT);
  assert.equal(live.provider, "cursor");
});

await test("capacity unavailable queues start and does not FAILED", async () => {
  const created = makeComms();
  setAlloyAdapterImplForTests({
    listPanes: () => [
      { session: "alloy-a", command: "claude", cwd: "/x/a" },
      { session: "alloy-b", command: "claude", cwd: "/x/b" },
      { session: "alloy-c", command: "claude", cwd: "/x/c" },
    ],
  });
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: false },
      worktree: { path: WT },
    }),
    startRuntime: async () => { throw new Error("must not start without capacity"); },
  });
  const cap = await assessSessionStartCapacity();
  assert.equal(cap.ok, false);
  const out = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.queued, true);
  assert.equal(out.waiting_for_execution_capacity, true);
  assert.equal(admissionForLane(created.lane.lane_id, ROOT).state, "QUEUED");
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, 0);
});

await test("capacity release triggers provisioning via admission", async () => {
  const created = makeComms();
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "Continue inbound SMS.",
    worktreePath: WT,
    root: ROOT,
  });
  setAlloyAdapterImplForTests({
    listPanes: () => [
      { session: "alloy-a", command: "claude", cwd: "/x/a" },
      { session: "alloy-b", command: "claude", cwd: "/x/b" },
      { session: "alloy-c", command: "claude", cwd: "/x/c" },
    ],
  });
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: false },
      worktree: { path: WT },
    }),
  });
  const queued = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(queued.queued, true);
  let started = 0;
  setAlloyAdapterImplForTests({ listPanes: () => [] });
  setAdmissionImplForTests({
    startProviderOnBinding: async () => {
      started += 1;
      return { ok: true, started: true };
    },
    canProvisionNow: () => ({ ok: false }),
  });
  const ev = await evaluateAdmissionQueue({ root: ROOT });
  assert.equal(started, 1);
  assert.equal(ev.admitted, 1);
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "QUEUED");
});

await test("existing queued run is reused and delivered exactly once after orientation", async () => {
  const created = makeComms();
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "Approved work stays the same.",
    worktreePath: WT,
    root: ROOT,
  });
  const sends = [];
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: true, pane_id: "%9", session: "alloy-communications" },
      worktree: { path: WT },
    }),
    spawnClaude: ({ sessionId }) => ({ ok: true, provider_session_id: sessionId }),
    sendLaneInstruction: async (_id, text) => {
      sends.push(text);
      return { ok: true, status: "delivered" };
    },
  });
  const start = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(start.ok, true);
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "QUEUED");
  assert.equal(sends.length, 1);
  assert.match(sends[0], /Orient first/);
  assert.equal(activeAgentSessionForLane(created.lane.lane_id, ROOT).state, "VERIFYING");
  const session = activeAgentSessionForLane(created.lane.lane_id, ROOT);
  const oriented = acceptOrientationReport({
    laneId: created.lane.lane_id,
    runId: run.run.run_id,
    orientation: {
      lane: created.lane.lane_id,
      run: run.run.run_id,
      worktree: WT,
      branch: "agent/claude/3-email-receiving-provisioning",
    },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(oriented.ok, true, oriented.error);
  const delivered = await deliverExistingQueuedRun(run.run.run_id, {
    root: ROOT,
    sendLaneInstruction: async (_id, text) => {
      sends.push(text);
      return { ok: true, status: "delivered" };
    },
  });
  assert.equal(delivered.ok, true);
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "EXECUTING");
  const again = await deliverExistingQueuedRun(run.run.run_id, {
    root: ROOT,
    sendLaneInstruction: async () => { throw new Error("duplicate delivery"); },
  });
  assert.equal(again.already_delivered, true);
  assert.equal(sends.length, 2);
  assert.match(sends[0], /Orient first/);
  assert.match(sends[1], /Approved work stays the same/);
  assert.equal(activeRunForLane(created.lane.lane_id, ROOT).run_id, run.run.run_id);
  assert.equal(session.agent_session_id, start.agent_session_id);
});

await test("inspect still does not mint an Agent Session", async () => {
  const created = makeComms();
  const [out] = attachLaneAgentSessions([{
    lane_id: created.lane.lane_id,
    durable: true,
    claude: { presence: "absent" },
    tmux: { alive: false, session: null },
    worktree: { path: WT },
    binding: created.lane.binding,
  }], ROOT);
  assert.equal(out.agent_session, null);
  assert.equal(out.runtime, "offline");
  assert.equal(out.start_session.implemented, true);
  assert.equal(out.start_session.available, true);
  assert.equal(listAgentSessionsForLane(created.lane.lane_id, ROOT).length, 0);
});

await test("adapter refuses unmanaged paths", async () => {
  const unmanaged = await startPersistentAgentSession({
    worktreePath: WT,
    laneName: "Communications",
  });
  assert.equal(unmanaged.ok, false);
  assert.ok(["worktree_not_managed", "worktree_missing", "path_refused"].includes(unmanaged.error));
});

await test("adopted and newly created bindings share startLaneAgentSession", async () => {
  const a = makeComms();
  const procPath = join(ROOT, "wt-proc");
  mkdirSync(join(procPath, ".git"), { recursive: true });
  const b = createDurableLane({
    name: "Processing",
    binding: { worktree_path: procPath, worktree_name: "wt-proc", provider: "claude" },
    origin: "created",
    root: ROOT,
  });
  const ids = [];
  setAgentSessionLifecycleImplForTests({
    observeLane: async (id) => ({
      lane_id: id,
      claude: { presence: "absent" },
      tmux: { alive: true, pane_id: "%7", session: "alloy-x" },
      worktree: { path: id === a.lane.lane_id ? WT : procPath },
    }),
    spawnClaude: ({ sessionId }) => {
      ids.push(sessionId);
      return { ok: true, provider_session_id: sessionId };
    },
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
  });
  const one = await startLaneAgentSession({ laneId: a.lane.lane_id, root: ROOT });
  const two = await startLaneAgentSession({ laneId: b.lane.lane_id, root: ROOT });
  assert.equal(one.ok, true, one.error);
  assert.equal(two.ok, true, two.error);
  assert.equal(ids.length, 2);
});

await test("reconcile retries orientation when Claude is ready but not oriented", async () => {
  const created = makeComms();
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "Approved work stays the same.",
    worktreePath: WT,
    root: ROOT,
  });
  patchRunFields(run.run.run_id, { state_reason: "waiting_for_agent_session" }, { root: ROOT });
  const sends = [];
  let live = false;
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: live ? "present" : "absent" },
      tmux: { alive: true, pane_id: "%9", session: "alloy-communications", command: live ? "claude" : "zsh" },
      worktree: { path: WT },
    }),
    spawnClaude: ({ sessionId }) => {
      live = true;
      return { ok: true, provider_session_id: sessionId };
    },
    sendLaneInstruction: async (_id, text) => {
      sends.push(text);
      return { ok: true, status: "delivered" };
    },
  });
  const start = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(start.ok, true);
  assert.equal(sends.length, 1);
  const session = activeAgentSessionForLane(created.lane.lane_id, ROOT);
  patchAgentSession(session.agent_session_id, {
    last_orientation_attempt_at: new Date(0).toISOString(),
  }, { root: ROOT });
  const retry = await reconcilePendingOrientation({ root: ROOT, nowMs: Date.now() });
  assert.equal(retry.retried, 1);
  assert.equal(sends.length, 2);
  assert.match(sends[1], /Orient first/);
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "QUEUED");
});

await test("orientation wrap does not duplicate a long approved instruction", () => {
  const instruction = `${"Measure the workspace. ".repeat(800)}UNIQUE_TAIL`;
  const text = buildContinuationInstruction({
    run: {
      lane_id: "lane_testtesttest",
      run_id: "erun_testtesttest",
      instruction,
      state: "QUEUED",
      worktree_path: WT,
    },
    handoff: {
      remaining_work: instruction,
      next_action: "Orient first.",
    },
    git: { branch: "main", head: "abc", dirty: false, worktree: WT },
    successorSessionId: "agsess_test",
  });
  assert.ok(text.length <= LANE_INSTRUCTION_MAX, `wrap ${text.length} exceeds ${LANE_INSTRUCTION_MAX}`);
  assert.match(text, /See approved instruction above/);
  assert.equal((text.match(/UNIQUE_TAIL/g) || []).length, 1);
});

await test("oversized kickoff falls back to delivering the queued run", async () => {
  const created = makeComms();
  const run = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "Approved work stays the same.",
    worktreePath: WT,
    root: ROOT,
  });
  const sends = [];
  setAgentSessionLifecycleImplForTests({
    observeLane: async () => ({
      lane_id: created.lane.lane_id,
      claude: { presence: "absent" },
      tmux: { alive: true, pane_id: "%9", session: "alloy-communications" },
      worktree: { path: WT },
    }),
    spawnClaude: ({ sessionId }) => ({ ok: true, provider_session_id: sessionId }),
    sendLaneInstruction: async (_id, text) => {
      sends.push(text);
      if (/Orient first/.test(text)) return { ok: false, error: "instruction_too_large" };
      return { ok: true, status: "delivered" };
    },
  });
  const start = await startLaneAgentSession({ laneId: created.lane.lane_id, root: ROOT });
  assert.equal(start.ok, true);
  assert.equal(getExecutionRun(run.run.run_id, ROOT).state, "EXECUTING");
  assert.equal(activeAgentSessionForLane(created.lane.lane_id, ROOT).state, "ACTIVE");
  assert.ok(sends.some((t) => /Approved work stays the same/.test(t)));
});

await test("interactive Cursor starts with --trust so workspace trust is not a chat question", () => {
  assert.deepEqual(persistentProviderArgv({ provider: "cursor", bin: "cursor-agent" }), ["cursor-agent", "--trust"]);
  assert.deepEqual(persistentProviderArgv({ provider: "claude", bin: "claude", sessionId: "sid" }), ["claude", "--session-id", "sid"]);
  assert.equal(persistentProviderArgv({ provider: "claude", bin: "claude" }).includes("--trust"), false);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
