#!/usr/bin/env node
/**
 * Director capability freshness — stale registry vs unsupported action.
 * Isolated runtime. Does not bounce the live Gateway.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = mkdtempSync(join(tmpdir(), "vac-dir-fresh-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");

const {
  classifyActionAvailability,
  setLoadedRegistryForTests,
  ACTION_TYPES,
  directorRegistryFreshness,
} = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  refreshDirectorCapabilities,
  setDirectorRefreshHandlerForTests,
  resetDirectorFreshnessForTests,
  directorCapabilitiesDiagnostics,
  operatorDirectorCopy,
} = await import("../lib/vacilando/director-capability-freshness.mjs");
const {
  requestGovernedAction,
  processGovernedAction,
  recoverMisclassifiedStaleGovernedRequests,
  tickGovernedActions,
  getGovernedAction,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  readGovernedActionStore,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { deriveMissionPosture } = await import("../lib/vacilando/mission-posture.mjs");
const { composeMissionDirectorResponse } = await import("../lib/vacilando/mission-conversation-director.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetGovernedActionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetDirectorFreshnessForTests(ROOT);
  setGovernedActionExecuteImplForTests(null);
  setLoadedRegistryForTests(null);
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

function executingRun() {
  const queued = createQueuedRun({
    laneId: "alloy-identity",
    instruction: "Promote Access & Identity to staging",
    worktreePath: join(REPO, "scripts/local-dev"),
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system",
    root: ROOT,
    reason: "delivered",
  });
  assert.equal(moved.ok, true, moved.error);
  return moved.run;
}

function mergeProof(missionId) {
  return {
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    target: "staging",
    purpose: "OD-2 staging promotion of Access & Identity V2",
    reason_worker_cannot_execute: "Lane cannot run gh pr merge",
    mission_id: missionId,
    lane_id: "alloy-identity",
    requested_mode: "promotion",
    inputs: {
      repository: "ksquared-16/alloy",
      pullRequestNumber: 475,
      targetBranch: "staging",
      expectedHeadSha: "c3a88b874435938b973d297a2c855d5c39a76197",
      mergeMethod: "merge",
      requiredChecksGreen: true,
    },
    continuation_plan: {
      kind: "staging_schema_promotion",
      migrations: ["20260818170000_w13_collapse_portal_eligible"],
    },
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

await test("current registry action + stale loaded catalog is director_registry_stale", () => {
  setLoadedRegistryForTests({
    actionKeys: [ACTION_TYPES.DATABASE_READ_CENSUS],
    diskKeys: [
      ACTION_TYPES.DATABASE_READ_CENSUS,
      ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    ],
  });
  const stale = classifyActionAvailability(ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST);
  assert.equal(stale.code, "director_registry_stale");
  const missing = classifyActionAvailability("shell.exec");
  assert.equal(missing.code, "unsupported_action_key");
  const census = classifyActionAvailability(ACTION_TYPES.DATABASE_READ_CENSUS);
  assert.equal(census.code, "available");
  const live = directorRegistryFreshness();
  assert.equal(live.stale, true);
  assert.ok(live.missingFromLoaded.includes(ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST));
});

await test("stale Director auto-refreshes and retries the same request once", async () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "OD-2", status: "running" });
  setLoadedRegistryForTests({
    actionKeys: [ACTION_TYPES.DATABASE_READ_CENSUS],
    diskKeys: [
      ACTION_TYPES.DATABASE_READ_CENSUS,
      ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    ],
  });
  let refreshes = 0;
  setDirectorRefreshHandlerForTests(() => {
    refreshes += 1;
    setLoadedRegistryForTests(null);
    return { ok: true };
  });
  const first = requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT });
  assert.equal(first.ok, true, first.error);
  assert.equal(first.refreshing, true);
  assert.equal(first.classification, "director_registry_stale");
  assert.equal(first.request.status, "awaiting_control_plane_refresh");
  assert.equal(first.request.failure_code, null);
  const id = first.request.request_id;
  await sleep(20);
  const retried = processGovernedAction(id, { root: ROOT });
  assert.equal(retried.ok, true, retried.error);
  assert.equal(retried.awaiting_operator, true);
  assert.equal(retried.request.request_id, id);
  assert.equal(retried.request.status, "awaiting_operator");
  assert.match(retried.request.mission_need || retried.request.title, /475|Merge/);
  assert.equal(refreshes, 1);
  const listed = recoverMisclassifiedStaleGovernedRequests({ root: ROOT });
  assert.equal(listed.filter((x) => x?.request?.request_id === id).length, 0);
});

await test("no duplicate governed request is created for the same merge", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "OD-2", status: "running" });
  setLoadedRegistryForTests(null);
  const a = requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT, processNow: false });
  const b = requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT, processNow: false });
  assert.equal(a.ok, true, a.error);
  assert.equal(b.request.request_id, a.request.request_id);
  assert.equal(readGovernedActionStore(ROOT).requests.length, 1);
});

await test("unsupported action remains unsupported", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "x", status: "running" });
  const out = requestGovernedAction({
    ...mergeProof(mission.mission_id),
    action_key: "shell.exec",
  }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsupported_action_key");
});

await test("policy denial is not classified as stale", () => {
  setLoadedRegistryForTests(null);
  const avail = classifyActionAvailability(ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST);
  assert.equal(avail.code, "available");
  executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "x", status: "running" });
  const proof = mergeProof(mission.mission_id);
  const out = requestGovernedAction({
    ...proof,
    inputs: {
      ...proof.inputs,
      targetBranch: "main",
    },
  }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.notEqual(out.error, "director_registry_stale");
  assert.notEqual(out.error, "unsupported_action_key");
});

await test("failed unauthorized_action_key is revived when the action now exists", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "OD-2", status: "running" });
  const created = requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT, processNow: false });
  assert.equal(created.ok, true, created.error);
  const storePath = join(ROOT, "vacilando", "governed-actions", "requests.json");
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  const rec = store.requests.find((r) => r.request_id === created.request.request_id);
  rec.status = "failed";
  rec.failure_code = "action_unavailable";
  rec.failure_reason = "unauthorized_action_key";
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  const out = recoverMisclassifiedStaleGovernedRequests({ root: ROOT });
  assert.ok(out.length >= 1);
  const revived = getGovernedAction(created.request.request_id, ROOT);
  assert.equal(revived.status, "awaiting_operator");
  assert.equal(revived.revived_from_stale_registry, true);
  assert.equal(revived.continuation_plan?.kind, "staging_schema_promotion");
});

await test("mission posture is Updating Director during refresh, not idle", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "OD-2", status: "running" });
  setLoadedRegistryForTests({
    actionKeys: [ACTION_TYPES.DATABASE_READ_CENSUS],
    diskKeys: [
      ACTION_TYPES.DATABASE_READ_CENSUS,
      ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    ],
  });
  setDirectorRefreshHandlerForTests(() => ({ ok: true }));
  requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT });
  const posture = deriveMissionPosture(mission.mission_id);
  assert.equal(posture.id, "governed_action_director_refresh");
  assert.match(posture.label, /Updating Director/);
  assert.equal(posture.needsYou, false);
  assert.notEqual(posture.id, "ready_to_start");
});

await test("conversation refresh Director does not mention PIDs", () => {
  const composed = composeMissionDirectorResponse({
    missionId: "msn_test",
    pendingGovernedAction: {
      request_id: "gar_x",
      action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      title: "Merge PR #475 into staging",
    },
  }, { operatorText: "refresh Director", intent: { mode: "action" } });
  assert.equal(composed.autoRefreshDirector, true);
  assert.doesNotMatch(composed.summary, /\bPID\b|\blaunchctl\b|\b62449\b/i);
  assert.match(composed.summary, /updating Director/i);
});

await test("refresh failure surfaces a bounded Refresh Director action", async () => {
  setLoadedRegistryForTests({
    actionKeys: [ACTION_TYPES.DATABASE_READ_CENSUS],
    diskKeys: [ACTION_TYPES.DATABASE_READ_CENSUS, ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST],
  });
  const out = await refreshDirectorCapabilities({ reason: "test_fail", root: ROOT, allowExit: false });
  assert.equal(out.ok, false);
  assert.equal(out.operator_action?.kind, "refresh_director");
  const copy = operatorDirectorCopy("refresh_failed");
  assert.equal(copy.action_label, "Refresh Director");
  assert.doesNotMatch(copy.detail, /\bPID\b|\blaunchctl\b/i);
  const diag = directorCapabilitiesDiagnostics(ROOT);
  assert.equal(diag.state, "refresh_failed");
  assert.equal(diag.operator_action?.kind, "refresh_director");
});

await test("tick recovers a stale failed merge into awaiting_operator", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "OD-2", status: "running" });
  const created = requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT, processNow: false });
  const storePath = join(ROOT, "vacilando", "governed-actions", "requests.json");
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  const rec = store.requests.find((r) => r.request_id === created.request.request_id);
  rec.status = "failed";
  rec.failure_reason = "unauthorized_action_key";
  rec.failure_code = "action_unavailable";
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`);
  tickGovernedActions({ root: ROOT });
  const after = getGovernedAction(created.request.request_id, ROOT);
  assert.equal(after.status, "awaiting_operator");
  const posture = deriveMissionPosture(mission.mission_id);
  assert.match(posture.label, /Needs approval|Decision required/);
  assert.equal(posture.needsYou, true);
  assert.notEqual(posture.id, "ready_to_start");
});

await test("merge continuation plan survives refresh", async () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "OD-2", status: "running" });
  setLoadedRegistryForTests({
    actionKeys: [ACTION_TYPES.DATABASE_READ_CENSUS],
    diskKeys: [
      ACTION_TYPES.DATABASE_READ_CENSUS,
      ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    ],
  });
  setDirectorRefreshHandlerForTests(() => {
    setLoadedRegistryForTests(null);
    return { ok: true };
  });
  const first = requestGovernedAction(mergeProof(mission.mission_id), { root: ROOT });
  await sleep(20);
  const retried = processGovernedAction(first.request.request_id, { root: ROOT });
  const after = getGovernedAction(first.request.request_id, ROOT);
  assert.equal(after.continuation_plan?.kind, "staging_schema_promotion");
  assert.ok(Array.isArray(after.continuation_plan?.migrations));
  const store = readGovernedActionStore(ROOT);
  assert.equal(store.requests.length, 1);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
