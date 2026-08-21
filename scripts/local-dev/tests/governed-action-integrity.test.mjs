#!/usr/bin/env node
/**
 * Governed-action identity and result-schema integrity.
 * Isolated runtime only.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-gar-integrity-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  ACTION_TYPES,
  getActionDefinition,
  listRegisteredActions,
  setLoadedRegistryForTests,
} = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  assertGovernedActionIdentity,
  validateGovernedResultSchema,
  continuationSummaryFor,
  completionNotificationFor,
  classifyStoredGovernedCompletion,
} = await import("../lib/vacilando/governed-action-integrity.mjs");
const {
  requestGovernedAction,
  processGovernedAction,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
  continuationTextForGovernedAction,
  pendingGovernedActionForLane,
  readGovernedActionStore,
  reconcileGovernedActionIntegrity,
  orchestrateDirectorGovernedWait,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  resetExecutionRunsForTests,
} = await import("../lib/vacilando/execution-run.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { grantMissionAuthorization } = await import("../lib/vacilando/trusted-host-authz.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  resetGovernedActionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  setGovernedActionExecuteImplForTests(null);
  setGovernedActionResumeImplForTests({});
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

function missionLane() {
  const mission = createMission({
    slot: 5,
    title: "Access & Identity V2",
    objective: "Integrity",
    status: "running",
    worktree: ROOT,
    provider: "cursor",
  });
  const queued = createQueuedRun({
    laneId: "alloy-identity",
    instruction: "Integrity coverage",
    missionId: mission.mission_id,
    worktreePath: ROOT,
    origin: "system",
    root: ROOT,
  });
  if (!queued.ok) throw new Error(queued.error || "queue_failed");
  const moved = transitionExecutionRun(queued.run.run_id, "EXECUTING", { origin: "system", root: ROOT, reason: "start" });
  return { mission, run: moved.run || queued.run, laneId: "alloy-identity" };
}

function censusResult(rec) {
  return {
    ok: true,
    action: {
      id: "tha_census",
      state: "completed",
      actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
      result: {
        census: { org_count: 2, census_run_at: "2026-08-20T00:00:00Z", database: "postgres" },
        evidencePath: join(ROOT, "census.json"),
      },
    },
  };
}

function mergeResult() {
  return {
    ok: true,
    action: {
      id: "tha_merge",
      state: "completed",
      actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      result: {
        pull_request_number: 483,
        merge_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
        staging_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
        repository: "ksquared-16/alloy",
        target_branch: "staging",
      },
    },
  };
}

function certResult() {
  return {
    ok: true,
    action: {
      id: "tha_cert",
      state: "completed",
      actionType: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
      result: {
        action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
        status: "certified_read_only",
        suite: { key: "access_identity_v2", hash: "abc" },
        write_policy: "read_only",
        source_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
        tests: { passed: 16, failed: 0, skipped: 1 },
        evidence_path: join(ROOT, "certification.json"),
      },
    },
  };
}

await test("real application.certify_staging is registered", () => {
  const keys = listRegisteredActions().map((a) => a.actionType);
  assert.equal(keys.includes(ACTION_TYPES.APPLICATION_CERTIFY_STAGING), true);
  assert.ok(getActionDefinition(ACTION_TYPES.APPLICATION_CERTIFY_STAGING));
});

await test("unsupported action cannot complete or create evidence", async () => {
  const { mission, run, laneId } = missionLane();
  const before = listEvidence(mission.mission_id).length;
  const out = requestGovernedAction({
    mission_id: mission.mission_id,
    lane_id: laneId,
    run_id: run.run_id,
    action_key: "application.invented_capability",
    target: "staging",
    purpose: "Invented",
    reason_worker_cannot_execute: "Lane cannot invent capabilities.",
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsupported_action_key");
  const store = readGovernedActionStore(ROOT);
  assert.equal(store.requests.some((r) => r.action_key === "application.invented_capability"), false);
  assert.equal(listEvidence(mission.mission_id).length, before);
});

await test("request/action/evidence identity mismatch fails", async () => {
  const { mission, run, laneId } = missionLane();
  setGovernedActionExecuteImplForTests((rec) => ({
    ok: true,
    action: {
      id: "tha_wrong",
      state: "completed",
      actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
      result: censusResult(rec).action.result,
    },
  }));
  const out = requestGovernedAction({
    mission_id: mission.mission_id,
    lane_id: laneId,
    run_id: run.run_id,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify",
    reason_worker_cannot_execute: "Lane cannot reach staging secrets.",
    inputs: {
      environment: "staging",
      expected_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
      suite_key: "access_identity_v2",
      write_policy: "read_only",
    },
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, false);
  assert.equal(out.error, "governed_action_identity_mismatch");
  assert.notEqual(out.request?.status, "complete");
});

await test("census evidence cannot satisfy merge", () => {
  const schema = validateGovernedResultSchema(
    ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    { census: { org_count: 1, census_run_at: "x" } },
  );
  assert.equal(schema.ok, false);
  assert.equal(schema.error, "governed_action_result_schema_mismatch");
});

await test("merge evidence cannot satisfy certification", () => {
  const schema = validateGovernedResultSchema(
    ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    { merge_sha: "abc", pull_request_number: 1 },
  );
  assert.equal(schema.ok, false);
  assert.equal(schema.error, "governed_action_result_schema_mismatch");
});

await test("duplicate/deduped requests cannot cross action types", async () => {
  const { mission, run, laneId } = missionLane();
  const census = requestGovernedAction({
    mission_id: mission.mission_id,
    lane_id: laneId,
    run_id: run.run_id,
    action_key: ACTION_TYPES.DATABASE_READ_CENSUS,
    target: "alloy_deployed_primary",
    purpose: "Census",
    reason_worker_cannot_execute: "No hosted credentials.",
    artifact_refs: ["docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json"],
    requested_mode: "read_only",
  }, { root: ROOT, processNow: false });
  assert.equal(census.ok, true, census.error);
  const wait = orchestrateDirectorGovernedWait({
    run: { ...run, mission_id: mission.mission_id, lane_id: laneId },
    wait: {
      action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
      mission_id: mission.mission_id,
      purpose: "Certify",
      reason_worker_cannot_execute: "Lane cannot reach staging secrets.",
      requested_mode: "certification",
      inputs: {
        environment: "staging",
        expected_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
        suite_key: "access_identity_v2",
        write_policy: "read_only",
      },
    },
    root: ROOT,
  });
  assert.equal(wait.ok, true, wait.error);
  assert.equal(wait.request.action_key, ACTION_TYPES.APPLICATION_CERTIFY_STAGING);
  assert.notEqual(wait.request.request_id, census.request.request_id);
});

await test("stale continuation cannot reuse another action result", () => {
  const text = continuationTextForGovernedAction({
    request_id: "gar_merge",
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    target: "staging",
    result: mergeResult().action.result,
  }, mergeResult().action);
  assert.equal(text.includes("census_run_at"), false);
  assert.match(text, /PR #483|merge_sha|16658ab/);
  const summary = continuationSummaryFor({
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    result: mergeResult().action.result,
  });
  assert.equal(summary.pull_request_number, 483);
  assert.equal(summary.census_run_at, undefined);
});

await test("unsupported prior evidence can be invalidated without deletion", () => {
  const { mission, laneId } = missionLane();
  const rec = {
    schema_version: "vacilando.governed_action_request.v1",
    request_id: "gar_1bcb1fcda29235",
    mission_id: mission.mission_id,
    lane_id: laneId,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    status: "complete",
    result_ref: "tha_9f2937526a6719",
    trusted_host_action_id: "tha_9f2937526a6719",
    result: {
      status: "certified_read_only",
      suite: { key: "access_identity_v2" },
      tests: { passed: 16, failed: 0, skipped: 1 },
    },
    created_at: "2026-08-20T20:11:04.900Z",
    updated_at: "2026-08-20T20:11:04.900Z",
  };
  const storePath = join(ROOT, "vacilando", "governed-actions");
  mkdirSync(storePath, { recursive: true });
  writeFileSync(join(storePath, "requests.json"), JSON.stringify({ schema_version: "vacilando.governed_action_request.v1", requests: [rec] }, null, 2));
  const classified = classifyStoredGovernedCompletion(rec);
  assert.equal(classified.ok, false);
  const report = reconcileGovernedActionIntegrity({ root: ROOT });
  assert.equal(report.invalidated.some((r) => r.request_id === "gar_1bcb1fcda29235"), true);
  const after = readGovernedActionStore(ROOT).requests.find((r) => r.request_id === "gar_1bcb1fcda29235");
  assert.equal(after.status, "invalidated");
  assert.equal(after.result_ref, "tha_9f2937526a6719");
  assert.ok(after.result);
});

await test("merge notification payload matches action type", () => {
  const notice = completionNotificationFor({
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    title: "Merge PR #483 into staging",
    result: mergeResult().action.result,
  }, mergeResult().action.result);
  assert.match(notice.body, /PR #483 merged to staging at 16658ab094bf/);
  assert.equal(notice.body.includes("census"), false);
});

await test("certification notification payload matches action type", () => {
  const notice = completionNotificationFor({
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    title: "Certify promoted staging application",
    result: certResult().action.result,
  }, certResult().action.result);
  assert.match(notice.body, /certified_read_only/);
  assert.match(notice.body, /16 passed/);
});

await test("identity assertion requires requested === executed === evidence", () => {
  const ok = assertGovernedActionIdentity({
    request: { action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING, request_id: "gar_a" },
    action: certResult().action,
    result: certResult().action.result,
    evidence: certResult().action.result,
  });
  assert.equal(ok.ok, true, ok.error);
  const bad = assertGovernedActionIdentity({
    request: { action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING, request_id: "gar_b" },
    action: { actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST, id: "tha_x" },
    result: mergeResult().action.result,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "governed_action_identity_mismatch");
});

await test("loaded-missing certify is not treated as complete", async () => {
  setLoadedRegistryForTests({
    actionKeys: [
      ACTION_TYPES.DATABASE_READ_CENSUS,
      ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    ],
    diskKeys: [
      ACTION_TYPES.DATABASE_READ_CENSUS,
      ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
      ACTION_TYPES.DATABASE_APPLY_MIGRATION,
      ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    ],
  });
  const { mission, run, laneId } = missionLane();
  const out = requestGovernedAction({
    mission_id: mission.mission_id,
    lane_id: laneId,
    run_id: run.run_id,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify",
    reason_worker_cannot_execute: "Lane cannot reach staging secrets.",
    inputs: {
      environment: "staging",
      expected_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
      suite_key: "access_identity_v2",
      write_policy: "read_only",
    },
  }, { root: ROOT, processNow: true });
  assert.notEqual(out.request?.status, "complete");
  assert.ok(["director_registry_stale", "unsupported_action_key"].includes(out.error) || out.request?.status === "awaiting_control_plane_refresh");
});

await test("same lane resumes once after typed certification", async () => {
  const { mission, run, laneId } = missionLane();
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    databaseTarget: "staging",
    actor: "director_policy",
  });
  const resumes = [];
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => {
      resumes.push(id);
      return { ok: true, request_id: id, same_lane: true };
    },
  });
  setGovernedActionExecuteImplForTests(() => certResult());
  const out = requestGovernedAction({
    mission_id: mission.mission_id,
    lane_id: laneId,
    run_id: run.run_id,
    action_key: ACTION_TYPES.APPLICATION_CERTIFY_STAGING,
    target: "staging",
    purpose: "Certify",
    reason_worker_cannot_execute: "Lane cannot reach staging secrets.",
    inputs: {
      environment: "staging",
      expected_sha: "16658ab094bffdc34ac3ababbf1752bdaf8296d4",
      suite_key: "access_identity_v2",
      write_policy: "read_only",
    },
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.request.status, "complete");
  const stored = readGovernedActionStore(ROOT).requests.find((r) => r.request_id === out.request.request_id);
  assert.equal(stored.result.action_key, ACTION_TYPES.APPLICATION_CERTIFY_STAGING);
  await out.resumePromise;
  processGovernedAction(out.request.request_id, { root: ROOT });
  assert.equal(resumes.length, 1);
  const pending = pendingGovernedActionForLane(laneId, ROOT);
  assert.equal(pending == null || pending.status === "complete", true);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
