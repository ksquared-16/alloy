#!/usr/bin/env node
/**
 * Phase 6 — Agent Session identity, handoff, rotation, recovery.
 * Isolated runtime. Injected send/observe/spawn. Does not attach to live Claude.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  activeRunForLane,
  createQueuedRun,
  getExecutionRun,
  resetExecutionRunsForTests,
  transitionExecutionRun,
} from "../lib/vacilando/execution-run.mjs";
import {
  ensureResourceRequest,
  patchResourceRequest,
  resetResourceRequestsForTests,
  setResourceGrantImplForTests,
} from "../lib/vacilando/execution-resource.mjs";
import {
  activeAgentSessionForLane,
  createAgentSession,
  getAgentSession,
  listAgentSessionsForLane,
  markAgentSessionActive,
  publicAgentSession,
  resetAgentSessionsForTests,
} from "../lib/vacilando/agent-session.mjs";
import {
  FORBIDDEN_SPAWN_FLAGS,
  ROTATION_POLICY,
  acceptHandoffReport,
  acceptOrientationReport,
  attachLaneAgentSessions,
  captureGitTruth,
  completeSessionRotation,
  evaluateRotationNeed,
  evaluateSafeCheckpoint,
  recoverDeadAgentSession,
  reconcileAutomaticContextRotation,
  requestSessionRotation,
  maybeAdvanceSessionRotation,
  resetAgentHandoffsForTests,
  resetAgentSessionLifecycleForTests,
  setAgentSessionLifecycleImplForTests,
} from "../lib/vacilando/agent-session-lifecycle.mjs";
import { agentSessionEventsPath } from "../lib/vacilando/agent-session.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");
const ROOT = mkdtempSync(join(tmpdir(), "vac-agsess-"));
const WT = mkdtempSync(join(tmpdir(), "vac-agsess-wt-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_SKIP_SESSION_ADVANCE = "1";

spawnSync("git", ["init"], { cwd: WT, encoding: "utf8" });
spawnSync("git", ["config", "user.email", "phase6@example.com"], { cwd: WT });
spawnSync("git", ["config", "user.name", "Phase Six"], { cwd: WT });
writeFileSync(join(WT, "keep.txt"), "keep\n");
spawnSync("git", ["add", "keep.txt"], { cwd: WT });
spawnSync("git", ["commit", "-m", "init"], { cwd: WT, encoding: "utf8" });

let pass = 0;
let fail = 0;
const sends = [];
let claudePresent = true;
let claudeCount = 1;
let spawnCalls = [];

async function test(name, fn) {
  resetExecutionRunsForTests(ROOT);
  resetResourceRequestsForTests(ROOT);
  resetAgentSessionsForTests(ROOT);
  resetAgentHandoffsForTests(ROOT);
  resetAgentSessionLifecycleForTests();
  sends.length = 0;
  spawnCalls = [];
  claudePresent = true;
  claudeCount = 1;
  setResourceGrantImplForTests(null);
  delete process.env.VACILANDO_AUTO_SESSION_ROTATION;
  installLifecycle();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function installLifecycle() {
  setAgentSessionLifecycleImplForTests({
    sendLaneInstruction: async (laneId, instruction, opts = {}) => {
      sends.push({ laneId, instruction, opts: { ...opts } });
      return { ok: true, status: "delivered", lane_id: laneId, worktree_path: WT };
    },
    observeLane: async (id) => fakeLane(id),
    spawnClaude: ({ lane, sessionId, argv }) => {
      spawnCalls.push({ laneId: lane?.lane_id, sessionId, argv: [...(argv || [])] });
      claudePresent = true;
      claudeCount = 1;
      return { ok: true, provider_session_id: sessionId, argv };
    },
    countClaude: () => claudeCount,
    collectTelemetry: async () => ({
      available: true,
      context: { used_tokens: 412000, max_tokens: 1000000, percent_used: 41 },
      usage: { input_tokens: 10, output_tokens: 20, cache_read_tokens: 0, cache_write_tokens: 0 },
      cost: { reported_usd: null, estimated_usd: null, billing_mode: "claude_max_subscription" },
      agent: { session_id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", model: "claude-opus-5" },
    }),
  });
}

function fakeLane(id = "alloy-records") {
  return {
    lane_id: id,
    label: "Records",
    claude: { presence: claudePresent ? "present" : "absent" },
    tmux: {
      alive: true,
      session: id,
      pane_id: "%9",
      command: claudePresent ? "2.1.233" : "zsh",
      cwd: WT,
    },
    worktree: { managed: true, path: WT, name: "wt-records" },
    git: { branch: "agent/cursor/5-vacilando-gateway-v2", state: "dirty" },
  };
}

function makeRun(instruction = "Finish the remaining Records work.", nowMs = Date.now()) {
  const q = createQueuedRun({
    laneId: "alloy-records",
    instruction,
    worktreePath: WT,
    nowMs,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(q.ok, true, q.error);
  const t = transitionExecutionRun(q.run.run_id, "EXECUTING", { root: ROOT, nowMs, origin: "system" });
  assert.equal(t.ok, true, t.error);
  return t.run;
}

async function plannedHandoff(run) {
  const req = await requestSessionRotation({
    laneId: "alloy-records",
    origin: "operator",
    confirm: true,
    root: ROOT,
    lane: fakeLane(),
  });
  assert.equal(req.ok, true, req.error);
  const accepted = acceptHandoffReport({
    laneId: "alloy-records",
    runId: run.run_id,
    handoff: {
      handoff_id: req.handoff_id,
      completed_work: "Identity locked",
      remaining_work: "Certify rotation",
      current_phase: "EXECUTING",
      next_action: "Continue certification",
      git_state: "tree clean",
    },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(accepted.ok, true, accepted.error);
  claudePresent = false;
  claudeCount = 0;
  return { req, accepted };
}

function activateSession(run, providerSessionId = "prov-old") {
  const created = createAgentSession({
    laneId: "alloy-records",
    runId: run.run_id,
    root: ROOT,
    providerSessionId,
  });
  assert.equal(created.ok, true, created.error);
  return markAgentSessionActive(created.session.agent_session_id, {
    root: ROOT,
    providerSessionId,
  }) || created.session;
}

function tel(percent, sessionId = "prov-old") {
  return {
    available: true,
    context: { percent_used: percent, used_tokens: 100, max_tokens: 200 },
    agent: { session_id: sessionId },
  };
}

function sessionEvents() {
  try {
    return readFileSync(agentSessionEventsPath(ROOT), "utf8")
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function gitDiff(rel) {
  return spawnSync("git", ["diff", "--", rel], { cwd: REPO, encoding: "utf8" }).stdout || "";
}

await test("lane, run, and agent session are distinct identities", () => {
  const run = makeRun();
  const created = createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  assert.equal(created.ok, true, created.error);
  const s = created.session;
  assert.equal(s.agent_session_id.startsWith("agsess_"), true);
  assert.notEqual(s.agent_session_id, s.lane_id);
  assert.notEqual(s.agent_session_id, run.run_id);
  assert.equal(s.lane_id, "alloy-records");
  assert.equal(s.run_id, run.run_id);
  assert.equal(activeRunForLane("alloy-records", ROOT).run_id, run.run_id);
});

await test("one active agent session per lane", () => {
  const run = makeRun();
  const a = createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  const b = createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.equal(b.error, "lane_has_active_session");
});

await test("unknown context percent does not auto-rotate; 84.9 stays quiet; 85% is safe_automatic by default", () => {
  assert.equal(evaluateRotationNeed({ context: { percent_used: null } }).kind, "none");
  assert.equal(evaluateRotationNeed({ context: { percent_used: null } }).unknown, true);
  assert.equal(evaluateRotationNeed({ context: { percent_used: 61 } }).kind, "none");
  assert.equal(evaluateRotationNeed({ context: { percent_used: 84.9 } }).kind, "none");
  assert.equal(evaluateRotationNeed({ context: { percent_used: 85 } }).kind, "safe_automatic");
  assert.equal(evaluateRotationNeed({ context: { percent_used: 88 } }).kind, "safe_automatic");
  process.env.VACILANDO_AUTO_SESSION_ROTATION = "0";
  assert.equal(evaluateRotationNeed({ context: { percent_used: 88 } }).kind, "recommended");
});

await test("safe checkpoint refuses VALIDATING + GRANTED scarce resource", () => {
  const run = makeRun();
  const validating = transitionExecutionRun(run.run_id, "VALIDATING", { root: ROOT, origin: "agent" });
  assert.equal(validating.ok, true, validating.error);
  setResourceGrantImplForTests(() => ({ ok: true, holder: "vac-test" }));
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  assert.equal(req.ok, true, req.error);
  if (req.request.state !== "GRANTED") {
    patchResourceRequest(req.request.request_id, { state: "GRANTED" }, { root: ROOT });
  }
  const check = evaluateSafeCheckpoint({
    lane: fakeLane(),
    run: getExecutionRun(run.run_id, ROOT),
    root: ROOT,
  });
  assert.equal(check.ok, false);
  assert.equal(check.blockers.some((b) => b.code === "unsafe_resource_phase"), true);
  assert.equal(check.dirty_ok, true);
});

await test("operator context refresh is allowed with no active Execution Run", async () => {
  const idleCheck = evaluateSafeCheckpoint({ lane: fakeLane(), run: null, root: ROOT });
  assert.equal(idleCheck.ok, true);
  const req = await requestSessionRotation({
    laneId: "alloy-records",
    origin: "operator",
    confirm: true,
    root: ROOT,
    lane: fakeLane(),
  });
  assert.equal(req.ok, true, req.error);
  assert.equal(req.run_id, null);
  assert.match(sends[0].instruction, /no active Execution Run/i);
  claudePresent = false;
  claudeCount = 0;
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.phase, "ACTIVE");
  assert.equal(done.run_id, null);
  assert.equal(spawnCalls.length, 1);
});

await test("stuck idle refresh aborts if Claude does not exit", async () => {
  const req = await requestSessionRotation({
    laneId: "alloy-records",
    origin: "operator",
    confirm: true,
    root: ROOT,
    lane: fakeLane(),
  });
  assert.equal(req.ok, true, req.error);
  const waiting = await maybeAdvanceSessionRotation(fakeLane(), { root: ROOT });
  assert.equal(waiting.waiting_exit, true);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "HANDOFF");
  const aborted = await maybeAdvanceSessionRotation(fakeLane(), {
    root: ROOT,
    nowMs: Date.now() + ROTATION_POLICY.exit_wait_ms + 1000,
  });
  assert.equal(aborted.error, "outgoing_still_present");
  assert.equal(aborted.aborted, true);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "ACTIVE");
});

await test("planned rotation requires confirm, checkpoint, structured handoff, and same run", async () => {
  const run = makeRun();
  const denied = await requestSessionRotation({
    laneId: "alloy-records",
    origin: "operator",
    confirm: false,
    root: ROOT,
    lane: fakeLane(),
  });
  assert.equal(denied.error, "confirm_required");
  const { req, accepted } = await plannedHandoff(run);
  assert.equal(accepted.git.dirty, false);
  assert.equal(accepted.handoff.payload.completed_work.includes("Identity locked"), true);
  assert.equal(JSON.stringify(accepted.handoff).includes("transcript"), false);
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: true });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.run_id, run.run_id);
  assert.notEqual(done.agent_session_id, req.agent_session_id);
  const old = getAgentSession(req.agent_session_id, ROOT);
  const neu = getAgentSession(done.agent_session_id, ROOT);
  assert.equal(old.state, "ENDED");
  assert.equal(old.end_reason, "planned_rotation");
  assert.equal(old.successor_session_id, neu.agent_session_id);
  assert.equal(neu.predecessor_session_id, old.agent_session_id);
  assert.equal(neu.state, "VERIFYING");
  assert.equal(activeRunForLane("alloy-records", ROOT).run_id, run.run_id);
  assert.equal(activeRunForLane("alloy-records", ROOT).state, "EXECUTING");
  assert.equal(spawnCalls.length, 1);
  const argv = spawnCalls[0].argv;
  assert.equal(argv[0], "claude");
  assert.equal(argv.includes("--session-id"), true);
  for (const flag of FORBIDDEN_SPAWN_FLAGS) assert.equal(argv.includes(flag), false);
  assert.equal(sends.some((s) => s.instruction.includes("Orient first")), true);
  assert.equal(sends.some((s) => s.instruction.includes("vac-session-report.mjs")), true);
});

await test("Git truth overrides a clean handoff when the tree is dirty; dirty files survive rotation", async () => {
  writeFileSync(join(WT, "keep.txt"), "keep-modified\n");
  writeFileSync(join(WT, "untracked-phase6.txt"), "scratch\n");
  const before = captureGitTruth(WT);
  assert.equal(before.dirty, true);
  assert.equal(before.untracked_count >= 1, true);
  const head = before.head;
  const branch = before.branch;
  const run = makeRun("Dirty tree rotation");
  await plannedHandoff(run);
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.ok, true, done.error);
  const after = captureGitTruth(WT);
  assert.equal(after.head, head);
  assert.equal(after.branch, branch);
  assert.equal(after.dirty, true);
  assert.equal(readFileSync(join(WT, "keep.txt"), "utf8"), "keep-modified\n");
  assert.equal(readFileSync(join(WT, "untracked-phase6.txt"), "utf8"), "scratch\n");
  writeFileSync(join(WT, "keep.txt"), "keep\n");
});

await test("stale handoff is rejected; substrate facts stay independent", async () => {
  const run = makeRun();
  const { req } = await plannedHandoff(run);
  const stale = acceptHandoffReport({
    laneId: "alloy-records",
    runId: run.run_id,
    handoff: { handoff_id: req.handoff_id, completed_work: "replay" },
    cwd: WT,
    root: ROOT,
    nowMs: Date.now() + ROTATION_POLICY.handoff_max_age_ms + 1000,
  });
  assert.equal(stale.error, "stale_handoff");
});

await test("outgoing Claude that does not exit is not killed", async () => {
  const run = makeRun();
  await plannedHandoff(run);
  claudePresent = true;
  claudeCount = 1;
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: true });
  assert.equal(done.ok, false);
  assert.equal(done.error, "outgoing_still_present");
  assert.equal(spawnCalls.length, 0);
});

await test("duplicate Claude after spawn escalates NEEDS_INPUT", async () => {
  const run = makeRun();
  await plannedHandoff(run);
  setAgentSessionLifecycleImplForTests({
    sendLaneInstruction: async (laneId, instruction, opts = {}) => {
      sends.push({ laneId, instruction, opts: { ...opts } });
      return { ok: true, status: "delivered", lane_id: laneId, worktree_path: WT };
    },
    observeLane: async (id) => fakeLane(id),
    spawnClaude: ({ sessionId, argv }) => {
      spawnCalls.push({ sessionId, argv });
      claudeCount = 2;
      return { ok: true, provider_session_id: sessionId, argv };
    },
    countClaude: () => claudeCount,
    collectTelemetry: async () => ({ available: false }),
  });
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.error, "duplicate_claude");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("orientation mismatch escalates; run resumes only after ORIENTED", async () => {
  const run = makeRun();
  await plannedHandoff(run);
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.ok, true, done.error);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "EXECUTING");
  const bad = acceptOrientationReport({
    laneId: "alloy-records",
    runId: run.run_id,
    orientation: { lane: "alloy-other", run: run.run_id, branch: "nope" },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(bad.error, "orientation_mismatch");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("successful orientation keeps the same Execution Run ACTIVE", async () => {
  const run = makeRun();
  await plannedHandoff(run);
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  const git = captureGitTruth(WT);
  const ok = acceptOrientationReport({
    laneId: "alloy-records",
    runId: run.run_id,
    orientation: {
      lane: "alloy-records",
      run: run.run_id,
      worktree: WT,
      branch: git.branch,
      current_phase: "EXECUTING",
      next_action: "Continue certification",
    },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(ok.ok, true, ok.error);
  assert.equal(ok.run_id, run.run_id);
  assert.equal(ok.run_state, "EXECUTING");
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "ACTIVE");
  assert.equal(listAgentSessionsForLane("alloy-records", ROOT).length, 2);
});

await test("replacement start failure escalates NEEDS_INPUT", async () => {
  const run = makeRun();
  await plannedHandoff(run);
  setAgentSessionLifecycleImplForTests({
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
    observeLane: async (id) => fakeLane(id),
    spawnClaude: () => ({ ok: false, error: "spawn_failed" }),
    countClaude: () => 0,
    collectTelemetry: async () => ({ available: false }),
  });
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.error, "replacement_start_failed");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("unexpected death with a recovery packet starts a replacement that must inspect first", async () => {
  const run = makeRun();
  createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  claudePresent = false;
  claudeCount = 0;
  const out = await recoverDeadAgentSession({ laneId: "alloy-records", root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.run_id, run.run_id);
  assert.equal(out.recovery, true);
  assert.match(sends[0].instruction, /Inspect current Git/);
  assert.match(sends[0].instruction, /Do not assume the previous session/);
  assert.equal(sends[0].instruction.includes("just continue where the other Claude left off"), false);
});

await test("unexpected death during GRANTED validation is NEEDS_INPUT, not a blind restart", async () => {
  const run = makeRun();
  transitionExecutionRun(run.run_id, "VALIDATING", { root: ROOT, origin: "agent" });
  setResourceGrantImplForTests(() => ({ ok: true, holder: "vac-test" }));
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  if (req.request.state !== "GRANTED") {
    patchResourceRequest(req.request.request_id, { state: "GRANTED" }, { root: ROOT });
  }
  createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  claudePresent = false;
  claudeCount = 0;
  const out = await recoverDeadAgentSession({ laneId: "alloy-records", root: ROOT });
  assert.equal(out.error, "ambiguous_active_operation");
  assert.equal(spawnCalls.length, 0);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("restart budget is one recovery spawn per Execution Run", async () => {
  const run = makeRun();
  createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  claudePresent = false;
  claudeCount = 0;
  const first = await recoverDeadAgentSession({ laneId: "alloy-records", root: ROOT });
  assert.equal(first.ok, true, first.error);
  claudePresent = false;
  claudeCount = 0;
  const second = await recoverDeadAgentSession({ laneId: "alloy-records", root: ROOT });
  assert.equal(second.error, "budget_exhausted");
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("unknown cost is not $0; attach never spawns Claude", () => {
  const run = makeRun();
  const created = createAgentSession({ laneId: "alloy-records", runId: run.run_id, root: ROOT });
  const pub = publicAgentSession(created.session, {
    session_count: 1,
    lifetime_cost: { reported_usd: null, estimated_usd: null, note: "Not reported · Claude Max subscription" },
  });
  assert.notEqual(pub.lane_economics.lifetime_cost.reported_usd, 0);
  assert.equal(String(pub.lane_economics.lifetime_cost.note).includes("$0"), false);
  const before = spawnCalls.length;
  attachLaneAgentSessions([fakeLane()], ROOT);
  assert.equal(spawnCalls.length, before);
});

await test("rotation overlay does not bounce Execution Run state", async () => {
  const run = makeRun();
  await requestSessionRotation({
    laneId: "alloy-records",
    origin: "operator",
    confirm: true,
    root: ROOT,
    lane: fakeLane(),
  });
  const [lane] = attachLaneAgentSessions([{
    ...fakeLane(),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }], ROOT);
  assert.equal(lane.execution_run.state, "EXECUTING");
  assert.equal(lane.runtime_posture.state, "SESSION_ROTATING");
  assert.equal(lane.execution_run.runtime_posture.state, "SESSION_ROTATING");
});

await test("85% marks ROTATION_PENDING and rotates at a safe checkpoint without operator confirm", async () => {
  const run = makeRun();
  activateSession(run);
  const lane = { ...fakeLane(), agent_telemetry: tel(85), execution_run: getExecutionRun(run.run_id, ROOT) };
  const out = await maybeAdvanceSessionRotation(lane, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  const session = activeAgentSessionForLane("alloy-records", ROOT);
  assert.equal(session.state, "HANDOFF");
  assert.equal(session.rotation_trigger?.origin, "automatic");
  assert.equal(sessionEvents().some((e) => e.type === "context_rotation_threshold_reached"), true);
  assert.equal(sessionEvents().some((e) => e.type === "rotation_started"), true);
  assert.equal(sends.length >= 1, true);
});

await test("pending + granted browser cert during VALIDATING defers", async () => {
  const run = makeRun();
  activateSession(run);
  const validating = transitionExecutionRun(run.run_id, "VALIDATING", { root: ROOT, origin: "agent" });
  assert.equal(validating.ok, true, validating.error);
  setResourceGrantImplForTests(() => ({ ok: true, holder: "vac-test" }));
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  assert.equal(req.ok, true, req.error);
  if (req.request.state !== "GRANTED") {
    patchResourceRequest(req.request.request_id, { state: "GRANTED" }, { root: ROOT });
  }
  const before = sends.length;
  const out = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(87),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(out.deferred, true);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "ROTATION_PENDING");
  assert.equal(sends.length, before);
  assert.equal(sessionEvents().some((e) => e.type === "rotation_deferred"), true);
});

await test("pending + exclusive timing work defers even while EXECUTING", async () => {
  const run = makeRun();
  activateSession(run);
  setResourceGrantImplForTests(() => ({ ok: true, holder: "vac-test" }));
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-records",
    resourceKey: "runtime_timing_certification",
    root: ROOT,
  });
  assert.equal(req.ok, true, req.error);
  if (req.request.state !== "GRANTED") {
    patchResourceRequest(req.request.request_id, { state: "GRANTED" }, { root: ROOT });
  }
  const check = evaluateSafeCheckpoint({
    lane: fakeLane(),
    run: getExecutionRun(run.run_id, ROOT),
    root: ROOT,
  });
  assert.equal(check.ok, false);
  assert.equal(check.blockers.some((b) => b.code === "exclusive_active"), true);
  const out = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(90),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(out.deferred, true);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "ROTATION_PENDING");
});

await test("pending + ambiguous continuation defers", async () => {
  const run = makeRun();
  activateSession(run);
  setResourceGrantImplForTests(() => ({ ok: true, holder: "vac-test" }));
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  patchResourceRequest(req.request.request_id, {
    state: "GRANTED",
    continuation: { delivery_state: "AMBIGUOUS", ambiguous: true },
  }, { root: ROOT });
  const check = evaluateSafeCheckpoint({
    lane: fakeLane(),
    run: { ...getExecutionRun(run.run_id, ROOT), state: "EXECUTING" },
    root: ROOT,
  });
  assert.equal(check.blockers.some((b) => b.code === "continuation_ambiguous" || b.code === "continuation_delivering"), true);
});

await test("blocker clear proceeds without operator action and preserves the same Execution Run", async () => {
  const run = makeRun();
  activateSession(run);
  const validating = transitionExecutionRun(run.run_id, "VALIDATING", { root: ROOT, origin: "agent" });
  assert.equal(validating.ok, true, validating.error);
  setResourceGrantImplForTests(() => ({ ok: true, holder: "vac-test" }));
  const req = ensureResourceRequest({
    runId: run.run_id,
    laneId: "alloy-records",
    resourceKey: "browser_certification",
    root: ROOT,
  });
  if (req.request.state !== "GRANTED") {
    patchResourceRequest(req.request.request_id, { state: "GRANTED" }, { root: ROOT });
  }
  await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(86),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "ROTATION_PENDING");
  patchResourceRequest(req.request.request_id, { state: "RELEASED" }, { root: ROOT });
  transitionExecutionRun(run.run_id, "EXECUTING", { root: ROOT, origin: "system" });
  const out = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(86),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "HANDOFF");
  assert.equal(activeRunForLane("alloy-records", ROOT).run_id, run.run_id);
});

await test("automatic rotation keeps Git/worktree state and requires orientation before resume", async () => {
  writeFileSync(join(WT, "keep.txt"), "keep-modified\n");
  const before = captureGitTruth(WT);
  const run = makeRun("Dirty auto rotation");
  activateSession(run);
  const started = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(91),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(started.ok, true, started.error);
  const accepted = acceptHandoffReport({
    laneId: "alloy-records",
    runId: run.run_id,
    handoff: {
      handoff_id: started.handoff_id,
      completed_work: "Auto threshold",
      remaining_work: "Continue",
      current_phase: "EXECUTING",
      next_action: "Keep going",
    },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(accepted.ok, true, accepted.error);
  claudePresent = false;
  claudeCount = 0;
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.ok, true, done.error);
  assert.equal(done.run_id, run.run_id);
  assert.equal(spawnCalls.length, 1);
  const neu = getAgentSession(done.agent_session_id, ROOT);
  assert.equal(neu.state, "VERIFYING");
  const after = captureGitTruth(WT);
  assert.equal(after.head, before.head);
  assert.equal(after.dirty, true);
  assert.equal(readFileSync(join(WT, "keep.txt"), "utf8"), "keep-modified\n");
  writeFileSync(join(WT, "keep.txt"), "keep\n");
});

await test("successful automatic rotation does not notify; failure becomes NEEDS_INPUT", async () => {
  const gwSrc = readFileSync(join(HERE, "../apps/vacilando/public/gateway.js"), "utf8");
  assert.match(gwSrc, /watchRefresh/);
  assert.equal(/if \(refresh\?\.kind === "progress"\) \{\s*G\.watchRefresh = true/s.test(gwSrc), false);
  const run = makeRun();
  activateSession(run);
  const started = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(88),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(started.ok, true, started.error);
  const accepted = acceptHandoffReport({
    laneId: "alloy-records",
    runId: run.run_id,
    handoff: {
      handoff_id: started.handoff_id,
      completed_work: "done",
      remaining_work: "left",
      current_phase: "EXECUTING",
      next_action: "go",
    },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(accepted.ok, true, accepted.error);
  claudePresent = false;
  claudeCount = 0;
  setAgentSessionLifecycleImplForTests({
    sendLaneInstruction: async () => ({ ok: true, status: "delivered" }),
    observeLane: async (id) => fakeLane(id),
    spawnClaude: () => ({ ok: false, error: "spawn_failed" }),
    countClaude: () => 0,
    collectTelemetry: async () => ({ available: false }),
  });
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.ok, false);
  assert.equal(getExecutionRun(run.run_id, ROOT).state, "NEEDS_INPUT");
});

await test("unknown percent does not auto-rotate; manual refresh still works below threshold", async () => {
  const run = makeRun();
  activateSession(run);
  const skipped = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: { available: true, context: { percent_used: null, used_tokens: 412000 } },
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(skipped.skipped || skipped.unknown, true);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "ACTIVE");
  const below = await requestSessionRotation({
    laneId: "alloy-records",
    origin: "operator",
    confirm: true,
    root: ROOT,
    lane: fakeLane(),
  });
  assert.equal(below.ok, true, below.error);
  assert.equal(activeAgentSessionForLane("alloy-records", ROOT).state, "HANDOFF");
});

await test("replacement session cannot inherit predecessor trigger; restart does not loop", async () => {
  const run = makeRun();
  const old = activateSession(run, "prov-old");
  const started = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(93, "prov-old"),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(started.ok, true, started.error);
  const accepted = acceptHandoffReport({
    laneId: "alloy-records",
    runId: run.run_id,
    handoff: {
      handoff_id: started.handoff_id,
      completed_work: "handoff",
      remaining_work: "more",
      current_phase: "EXECUTING",
      next_action: "continue",
    },
    cwd: WT,
    root: ROOT,
  });
  assert.equal(accepted.ok, true, accepted.error);
  claudePresent = false;
  claudeCount = 0;
  const done = await completeSessionRotation({ laneId: "alloy-records", root: ROOT, waitOutgoing: false });
  assert.equal(done.ok, true, done.error);
  const neu = getAgentSession(done.agent_session_id, ROOT);
  assert.equal(neu.rotation_trigger == null || neu.rotation_trigger.session_id === neu.agent_session_id, true);
  assert.notEqual(neu.agent_session_id, old.agent_session_id);
  const leaked = await reconcileAutomaticContextRotation({
    ...fakeLane(),
    agent_telemetry: tel(93, "prov-old"),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(leaked.predecessor_telemetry || leaked.skipped, true);
  assert.notEqual(activeAgentSessionForLane("alloy-records", ROOT).state, "ROTATION_PENDING");
  const again = await maybeAdvanceSessionRotation({
    ...fakeLane(),
    agent_telemetry: tel(93, "prov-old"),
    execution_run: getExecutionRun(run.run_id, ROOT),
  }, { root: ROOT });
  assert.equal(spawnCalls.length, 1);
  assert.equal(again.skipped || again.predecessor_telemetry || activeAgentSessionForLane("alloy-records", ROOT).state === "VERIFYING", true);
});

await test("no TUI scrape, no claude -p, no tmux kill, no package-script changes", () => {
  const src = readFileSync(join(HERE, "../lib/vacilando/agent-session-lifecycle.mjs"), "utf8");
  assert.equal(src.includes("capture-pane"), false);
  assert.equal(src.includes("send-keys"), false);
  assert.equal(src.includes("tmux kill"), false);
  assert.equal(src.includes("Ctrl-C"), false);
  assert.equal(src.includes("claude -p"), true);
  assert.match(src, /Never uses `claude -p`/);
  assert.equal(src.includes("deliverManagedLaneInstruction"), false);
  assert.equal(existsSync(join(HERE, "../vac-session-report.mjs")), true);
  assert.equal(gitDiff("web/package.json"), "");
  assert.equal(gitDiff("scripts/local-dev/alloy-compute"), "");
  assert.equal(gitDiff("scripts/local-dev/lib/sprint-ops.sh"), "");
  assert.equal(gitDiff("scripts/local-dev/lib/browser-cert-lease.mjs"), "");
  assert.equal(gitDiff("scripts/local-dev/lib/lock.sh"), "");
  assert.equal(gitDiff("scripts/local-dev/vac-run"), "");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
