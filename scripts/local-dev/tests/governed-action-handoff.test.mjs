#!/usr/bin/env node
/**
 * Development Lane → Director governed-action path.
 * Isolated runtime. Does not hit the deployed tenant or live Claude.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdirSync, mkdtempSync, writeFileSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = mkdtempSync(join(tmpdir(), "vac-gar-path-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const TOOLKIT = join(HERE, "..");
const REPO = join(HERE, "..", "..", "..");
const COMBINED = "scripts/local-dev/tests/fixtures/q15-combined-query.json";
const MUTATION = "scripts/local-dev/tests/fixtures/governed-mutation-census.json";

const {
  requestGovernedAction,
  approveGovernedAction,
  denyGovernedAction,
  pendingGovernedActionForLane,
  pendingGovernedActionForMission,
  orchestrateDirectorGovernedWait,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
  continuationTextForGovernedAction,
  DIRECTOR_GOVERNED_RESOURCE_KEY,
  governedPayloadHasSecrets,
  tickGovernedActions,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  activeRunForLane,
  resetExecutionRunsForTests,
  reportRunState,
  getExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { deriveMissionPosture } = await import("../lib/vacilando/mission-posture.mjs");
const {
  createDurableLane,
  bindLaneMission,
  missionIdForLane,
  resetDevelopmentLanesForTests,
  getDurableLane,
} = await import("../lib/vacilando/development-lane.mjs");
const { getActionDefinition, ACTION_TYPES, resolvePathInsideWorktree, resolveArtifactRoot } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const { classifyExecutionRunStale } = await import("../lib/vacilando/execution-stale.mjs");
const { validateReadOnlySql } = await import("../lib/vacilando/trusted-host-sql-readonly.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetGovernedActionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetDevelopmentLanesForTests(ROOT);
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

function fakeCensus(rec) {
  return {
    ok: true,
    action: {
      id: "tha_once",
      state: "completed",
      actionType: rec.action_key,
      inputs: { queryHash: "abc", databaseTarget: rec.target },
      result: {
        census: { org_count: 1, census_run_at: "2026-08-19T00:00:00Z", database: "postgres" },
        evidencePath: join(ROOT, "vacilando", "trusted-host-actions", "census.json"),
      },
    },
  };
}

function workerProof(overrides = {}) {
  return {
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    purpose: "Verify real role/grant coverage before removing Access compatibility paths.",
    artifact_refs: [COMBINED],
    requested_mode: "read_only",
    reason_worker_cannot_execute: "no hosted credentials; worker cannot execute database.read_census",
    ...overrides,
  };
}

function laneAndRun({ missionId = null, bind = true } = {}) {
  const created = createDurableLane({
    name: "Access & Identity",
    aliases: ["alloy-identity"],
    origin: "test",
    root: ROOT,
    mission_id: bind ? missionId : null,
  });
  assert.equal(created.ok, true, created.error);
  const queued = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "Continue Q15",
    worktreePath: REPO,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system",
    root: ROOT,
    reason: "delivered",
    worktreePath: REPO,
  });
  return { lane: created.lane, run: moved.run, missionId };
}

chmodSync(join(TOOLKIT, "vac"), 0o755);
chmodSync(join(TOOLKIT, "vac-governed-action.mjs"), 0o755);

await test("canonical vac run-status reporting", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { run } = laneAndRun({ missionId: mission.mission_id });
  const cli = spawnSync(join(TOOLKIT, "vac"), [
    "run-status", run.run_id, "validating", "--summary", "working", "--lane", run.lane_id,
  ], {
    cwd: REPO,
    env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /VALIDATING/);
  const again = getExecutionRun(run.run_id, ROOT);
  assert.equal(again.latest_progress?.summary, "working");
  assert.equal(again.transitions.some((t) => t.origin === "agent"), true);
});

await test("canonical vac governed-action reporting", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { lane, run } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_x", state: "policy_review" } }));
  const cli = spawnSync(join(TOOLKIT, "vac"), [
    "governed-action",
    "--run", run.run_id,
    "--lane", lane.lane_id,
    "--json", JSON.stringify(workerProof()),
  ], {
    cwd: REPO,
    env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /governed-action requested/);
  tickGovernedActions({ root: ROOT });
  const waiting = activeRunForLane(lane.lane_id, ROOT);
  assert.equal(waiting.state, "WAITING_RESOURCE");
  assert.equal(waiting.resource_wait.resource_key, DIRECTOR_GOVERNED_RESOURCE_KEY);
  assert.equal(pendingGovernedActionForLane(lane.lane_id, ROOT).status, "awaiting_operator");
});

await test("persistent lane inherits mission id on new runs", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const created = createDurableLane({
    name: "Access & Identity",
    origin: "test",
    root: ROOT,
    mission_id: mission.mission_id,
  });
  const queued = createQueuedRun({
    laneId: created.lane.lane_id,
    instruction: "Next slice",
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.run.mission_id, mission.mission_id);
  assert.equal(missionIdForLane(created.lane.lane_id, ROOT), mission.mission_id);
});

await test("existing lane can be bound to existing mission without recreate", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const created = createDurableLane({ name: "Access & Identity", origin: "test", root: ROOT });
  assert.equal(created.lane.mission_id, null);
  const bound = bindLaneMission(created.lane.lane_id, mission.mission_id, { root: ROOT, requireExisting: true });
  assert.equal(bound.ok, true, bound.error);
  assert.equal(bound.lane.mission_id, mission.mission_id);
  assert.equal(getDurableLane(created.lane.lane_id, ROOT).mission_id, mission.mission_id);
});

await test("missing mission binding fails clearly", () => {
  const { lane, run } = laneAndRun({ bind: false });
  const out = requestGovernedAction({
    ...workerProof(),
    lane_id: lane.lane_id,
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_mission_binding");
});

await test("WAITING_RESOURCE director_governed_action triggers governed request", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { lane, run } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_y", state: "policy_review" } }));
  const wait = reportRunState(run.run_id, "waiting-resource", {
    origin: "agent",
    root: ROOT,
    cwd: REPO,
    resource: DIRECTOR_GOVERNED_RESOURCE_KEY,
    reason: "Read-only database census requested",
    payload: workerProof(),
  });
  assert.equal(wait.ok, true, wait.error);
  tickGovernedActions({ root: ROOT });
  const pending = pendingGovernedActionForLane(lane.lane_id, ROOT);
  assert.ok(pending);
  assert.equal(pending.action_key, "database.read_census");
  assert.equal(pending.status, "awaiting_operator");
  const live = getExecutionRun(run.run_id, ROOT);
  assert.equal(live.resource_wait.governed_request_id, pending.request_id);
});

await test("duplicate request dedupes", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { lane, run } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_z", state: "policy_review" } }));
  const first = requestGovernedAction({ ...workerProof(), lane_id: lane.lane_id, run_id: run.run_id }, { root: ROOT });
  const second = requestGovernedAction({ ...workerProof(), lane_id: lane.lane_id, run_id: run.run_id }, { root: ROOT });
  assert.equal(first.ok, true, first.error);
  assert.equal(second.deduped, true);
  assert.equal(second.request.request_id, first.request.request_id);
});

await test("authorization-required, approval, denial, and trusted-host failure", async () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { lane, run } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_auth", state: "policy_review" } }));
  const req = requestGovernedAction({ ...workerProof(), lane_id: lane.lane_id, run_id: run.run_id }, { root: ROOT });
  assert.equal(req.request.status, "awaiting_operator");
  let posture = deriveMissionPosture(mission.mission_id);
  assert.equal(posture.label, "Needs approval");
  assert.equal(posture.id === "mission_idle", false);

  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "host_runtime_missing", action: { state: "failed", failureReason: "host_runtime_missing" } }));
  const failed = await approveGovernedAction(req.request.request_id, { actor: "operator", root: ROOT });
  assert.equal(failed.ok, false);
  posture = deriveMissionPosture(mission.mission_id);
  assert.match(posture.label, /Blocked \/ governed action failed/);

  const run2q = createQueuedRun({
    laneId: lane.lane_id,
    instruction: "Retry after bind",
    worktreePath: REPO,
    origin: "operator",
    root: ROOT,
    nowMs: Date.now() + 10,
  });
  // previous run may still be WAITING_RESOURCE — close it
  if (!run2q.ok) {
    transitionExecutionRun(run.run_id, "FAILED", { origin: "system", root: ROOT, reason: "reset" });
  }
});

await test("approval resumes same lane once; denial blocks", async () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { lane, run } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_a", state: "policy_review" } }));
  const req = requestGovernedAction({ ...workerProof(), lane_id: lane.lane_id, run_id: run.run_id }, { root: ROOT });
  const sends = [];
  setGovernedActionExecuteImplForTests(fakeCensus);
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => {
      sends.push(id);
      return { ok: true, same_lane: true, same_worktree: true, same_branch: true };
    },
  });
  const approved = await approveGovernedAction(req.request.request_id, { actor: "operator", root: ROOT });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.request.status, "complete");
  await new Promise((r) => setImmediate(r));
  assert.equal(sends.length, 1);

  const { lane: lane2, run: run2 } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_d", state: "policy_review" } }));
  const req2 = requestGovernedAction({ ...workerProof(), lane_id: lane2.lane_id, run_id: run2.run_id }, { root: ROOT });
  const denied = denyGovernedAction(req2.request.request_id, { actor: "operator", root: ROOT, reason: "no", code: "approval_denied" });
  assert.equal(denied.ok, true);
  const posture = deriveMissionPosture(mission.mission_id);
  assert.match(posture.label, /Blocked \/ denied/);
});

await test("originating worktree artifact resolution and path escape rejection", () => {
  const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
  const ok = def.validateInputs({
    queryArtifactPath: COMBINED,
    databaseTarget: "alloy_deployed_primary",
    worktreePath: REPO,
  });
  assert.equal(ok.ok, true, ok.detail || ok.code);
  assert.equal(ok.normalized.artifactRoot.includes("wt5-vacilando-gateway-v2") || ok.normalized.worktreePath === resolveArtifactRoot({ worktreePath: REPO }), true);

  const escape = resolvePathInsideWorktree(REPO, "../secret.json");
  assert.equal(escape.ok, false);
  assert.equal(escape.code, "path_escape");

  const absEscape = def.validateInputs({
    queryArtifactPath: "/etc/passwd",
    databaseTarget: "alloy_deployed_primary",
    worktreePath: REPO,
  });
  assert.equal(absEscape.ok, false);
  assert.equal(absEscape.code, "path_escape");
});

await test("Q15 combined_query accepted; mutation SQL rejected", () => {
  const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
  const ok = def.validateInputs({
    queryArtifactPath: COMBINED,
    databaseTarget: "alloy_deployed_primary",
    worktreePath: REPO,
  });
  assert.equal(ok.ok, true, ok.detail || ok.code);
  assert.equal(validateReadOnlySql(ok.normalized.sql).ok, true);

  const bad = def.validateInputs({
    queryArtifactPath: MUTATION,
    databaseTarget: "alloy_deployed_primary",
    worktreePath: REPO,
  });
  assert.equal(bad.ok, false);
  assert.ok(["forbidden_keyword", "policy_denied"].includes(bad.code) || bad.failure_code === "policy_denied" || /forbidden/.test(bad.code || ""));
});

await test("worker credential isolation and continuation has no secrets", () => {
  const rec = {
    request_id: "gar_x",
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    result_ref: "evidence/census.json",
    continuation_intent: "Continue W-15/W-20",
    lane_id: "lane_test",
  };
  const text = continuationTextForGovernedAction(rec, {
    id: "tha_x",
    result: { census: { org_count: 2 }, DATABASE_URL: "postgresql://secret" },
  });
  assert.equal(text.includes("postgresql://"), false);
  assert.equal(governedPayloadHasSecrets("postgresql://foo"), true);
  assert.match(text, /You did NOT receive hosted database credentials/);
  assert.match(text, /Continue W-15\/W-20/);
});

await test("continuation stays under lane instruction max even with a large census", () => {
  const rec = {
    request_id: "gar_x",
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    result_ref: "docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.results.json",
    continuation_intent: "Continue W-15/W-20",
  };
  const questions = {};
  for (let i = 0; i < 10; i += 1) {
    questions[`Q15-X${i}`] = {
      question_id: `Q15-X${i}`,
      row_count: i,
      rows: Array.from({ length: 80 }, (_, j) => ({ k: `row-${j}`, n: j })),
    };
  }
  const text = continuationTextForGovernedAction(rec, {
    id: "tha_x",
    result: { census: { format: "q15_labeled_rows", questions, question_ids: Object.keys(questions) } },
  });
  assert.equal(text.length < 24000, true, `continuation ${text.length}`);
  assert.match(text, /q15-authority-census.results.json/);
  assert.equal(text.includes("row-79"), false);
});

await test("valid governed wait is not ABANDONED", () => {
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const { run } = laneAndRun({ missionId: mission.mission_id });
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "authorization_required", action: { id: "tha_w", state: "policy_review" } }));
  requestGovernedAction({ ...workerProof(), lane_id: run.lane_id, run_id: run.run_id }, { root: ROOT });
  const waiting = getExecutionRun(run.run_id, ROOT);
  const classified = classifyExecutionRunStale(waiting, {
    now_ms: Date.now() + 10 * 60 * 1000,
    open_resource: false,
    in_flight_continuation: false,
  });
  assert.equal(classified.class, "active");
  assert.match(classified.reason, /protective_state_waiting_resource|governed_action_pending/);
  const now = Date.now();
  transitionExecutionRun(run.run_id, "EXECUTING", { origin: "system", root: ROOT, reason: "governed_action_complete", nowMs: now });
  const justResumed = classifyExecutionRunStale(getExecutionRun(run.run_id, ROOT), {
    now_ms: now + 10_000,
    open_resource: false,
    in_flight_continuation: false,
  });
  assert.equal(justResumed.class, "active");
  assert.equal(justResumed.reason, "governed_action_resumed");
  const later = classifyExecutionRunStale(getExecutionRun(run.run_id, ROOT), {
    now_ms: now + 20 * 60 * 1000,
    open_resource: false,
    in_flight_continuation: false,
  });
  assert.notEqual(later.reason, "governed_action_resumed");
  assert.ok(["ambiguous", "stale"].includes(later.class), later.reason);
});

await test("orchestrate recovers missing binding without creating a request", () => {
  const { run } = laneAndRun({ bind: false });
  transitionExecutionRun(run.run_id, "WAITING_RESOURCE", {
    origin: "agent",
    root: ROOT,
    resource_wait: { resource_key: DIRECTOR_GOVERNED_RESOURCE_KEY, action_key: "database.read_census" },
  });
  const live = getExecutionRun(run.run_id, ROOT);
  const out = orchestrateDirectorGovernedWait({ run: live, root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_mission_binding");
  assert.equal(pendingGovernedActionForLane(run.lane_id, ROOT), null);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
