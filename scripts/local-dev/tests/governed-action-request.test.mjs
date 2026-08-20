#!/usr/bin/env node
/**
 * Governed-action handoff — worker request → Director/trusted-host → same-lane resume.
 * Isolated runtime only. Does not attach to live Claude or the deployed tenant.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = mkdtempSync(join(tmpdir(), "vac-gar-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const Q15 = "docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json";
const MUTATION = "scripts/local-dev/tests/fixtures/governed-mutation-census.json";

const {
  requestGovernedAction,
  approveGovernedAction,
  denyGovernedAction,
  pendingGovernedActionForLane,
  pendingGovernedActionForMission,
  continuationTextForGovernedAction,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
  Q15_CENSUS_ARTIFACT,
  DIRECTOR_GOVERNED_RESOURCE_KEY,
  governedPayloadHasSecrets,
  tickGovernedActions,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  activeRunForLane,
  resetExecutionRunsForTests,
  publicExecutionRun,
  listExecutionRunsForLane,
} = await import("../lib/vacilando/execution-run.mjs");
const { grantMissionAuthorization } = await import("../lib/vacilando/trusted-host-authz.mjs");
const { createMission } = await import("../lib/vacilando/commands/missions.mjs");
const { deriveMissionPosture } = await import("../lib/vacilando/mission-posture.mjs");
const {
  classifyMissionComposerIntent,
  composeMissionDirectorResponse,
} = await import("../lib/vacilando/mission-conversation-director.mjs");
const { validateReadOnlySql } = await import("../lib/vacilando/trusted-host-sql-readonly.mjs");
const { getActionDefinition, ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");

let pass = 0;
let fail = 0;
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

function q15WorkerProof() {
  return {
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    purpose: "Verify legacy fallback and capability coverage before removing Access authority compatibility paths.",
    artifact_refs: [Q15],
    requested_mode: "read_only",
    reason_worker_cannot_execute: [
      "no hosted credentials",
      "VACILANDO_* token absent",
      "alloy-ro has network=false, credential_access=false",
      "/api/trusted-host/actions returns 401 from the lane",
    ].join("; "),
  };
}

function executingRun() {
  const queued = createQueuedRun({
    laneId: "alloy-identity",
    instruction: "Continue Access & Identity V2 Q15/W-20",
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

function fakeCensusResult(rec) {
  return {
    ok: true,
    action: {
      id: "tha_testcensus",
      state: "completed",
      actionType: rec.action_key,
      inputs: { queryHash: "abc", databaseTarget: rec.target },
      result: {
        census: { org_count: 2, census_run_at: "2026-08-19T00:00:00Z", database: "postgres" },
        evidencePath: join(ROOT, "vacilando", "trusted-host-actions", "census.json"),
      },
    },
  };
}

await test("worker requests governed action and lane waits on Director", () => {
  const run = executingRun();
  const mission = createMission({
    slot: 1,
    title: "Access & Identity V2",
    objective: "Q15 census",
    status: "running",
  });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.deduped, undefined);
  assert.ok(out.request.request_id);
  assert.equal(out.request.status, "awaiting_operator");
  const waiting = activeRunForLane("alloy-identity", ROOT);
  assert.equal(waiting.state, "WAITING_RESOURCE");
  assert.equal(waiting.resource_wait.resource_key, DIRECTOR_GOVERNED_RESOURCE_KEY);
  assert.equal(waiting.governed_action.status, "awaiting_operator");
  const pub = publicExecutionRun(waiting);
  assert.equal(pub.governed_action.action_key, "database.read_census");
  const pending = pendingGovernedActionForLane("alloy-identity", ROOT);
  assert.equal(pending.request_id, out.request.request_id);
});

await test("automatic Director execution when authorization already exists", async () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    databaseTarget: "alloy_deployed_primary",
    actor: "operator",
  });
  const sends = [];
  setGovernedActionExecuteImplForTests(fakeCensusResult);
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => ({ ok: true, request_id: id, same_lane: true }),
    sendLaneInstruction: async (laneId, text) => {
      sends.push({ laneId, text });
      return { ok: true, status: "delivered" };
    },
  });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.request.status, "complete");
  assert.equal(out.awaiting_operator, undefined);
});

await test("operator approval-required path does not idle the mission", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(out.request.status, "awaiting_operator");
  const posture = deriveMissionPosture(mission.mission_id);
  assert.equal(posture.needsYou, true);
  assert.match(posture.label, /Needs approval/i);
  assert.notEqual(posture.id, "mission_idle");
  assert.notEqual(posture.label, "Idle");
  assert.match(JSON.stringify(posture), /Authorize census/);
});

await test("operator denial persists and does not bounce the lane to retry", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Q15", status: "running" });
  const req = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  const denied = denyGovernedAction(req.request.request_id, {
    actor: "operator",
    code: "approval_denied",
    reason: "Operator denied production reads.",
    root: ROOT,
  });
  assert.equal(denied.ok, true);
  assert.equal(denied.request.status, "failed");
  assert.equal(denied.request.failure_code, "approval_denied");
  assert.equal(pendingGovernedActionForLane("alloy-identity", ROOT), null);
  const runs = listExecutionRunsForLane("alloy-identity", ROOT);
  assert.equal(runs[0].state, "FAILED");
  assert.match(runs[0].state_reason || "", /denied|production/i);
  const posture = deriveMissionPosture(mission.mission_id);
  assert.match(posture.label, /Blocked/i);
});

await test("trusted-host failure is persisted without asking the lane to retry", async () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    actor: "operator",
  });
  const sends = [];
  setGovernedActionExecuteImplForTests(() => ({ ok: false, error: "connection_failed" }));
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async (laneId, text) => {
      sends.push({ laneId, text });
      return { ok: true, status: "delivered" };
    },
    startLaneAgentSession: async () => ({ ok: true }),
  });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.request.status, "failed");
  assert.equal(out.request.failure_code, "execution_failed");
  assert.equal(pendingGovernedActionForMission(mission.mission_id, ROOT)?.status, undefined);
  if (out.resumePromise) await out.resumePromise;
  const open = activeRunForLane("alloy-identity", ROOT);
  assert.equal(open.state, "NEEDS_INPUT");
  assert.equal(open.governed_action.status, "failed");
  assert.equal(open.resource_wait, null);
  assert.equal(sends.length, 1);
  assert.match(sends[0].text, /GOVERNED ACTION FAILED/);
});

await test("result routes back to the same lane", async () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    actor: "operator",
  });
  const sends = [];
  setGovernedActionExecuteImplForTests(fakeCensusResult);
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async (laneId, text) => {
      sends.push({ laneId, text });
      return { ok: true, status: "delivered" };
    },
    startLaneAgentSession: async () => ({ ok: true }),
  });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(out.request.status, "complete");
  await new Promise((r) => setTimeout(r, 20));
  const resumed = activeRunForLane("alloy-identity", ROOT);
  assert.equal(resumed.lane_id, "alloy-identity");
  const text = continuationTextForGovernedAction(out.request, fakeCensusResult(out.request).action);
  assert.match(text, /GOVERNED ACTION COMPLETE/);
  assert.match(text, /alloy-identity|Continue/);
  assert.equal(governedPayloadHasSecrets(text), false);
  assert.doesNotMatch(text, /DATABASE_URL/);
});

await test("exhausted Claude context resumes with a fresh session in the same lane", async () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.DATABASE_READ_CENSUS,
    actor: "operator",
  });
  const starts = [];
  const sends = [];
  setGovernedActionExecuteImplForTests(fakeCensusResult);
  setGovernedActionResumeImplForTests({
    sendLaneInstruction: async (laneId, text, opts = {}) => {
      sends.push({ laneId, fresh: Boolean(opts.fresh_session) });
      if (!opts.fresh_session) return { ok: false, error: "pane_unavailable" };
      return { ok: true, status: "delivered" };
    },
    startLaneAgentSession: async ({ laneId }) => {
      starts.push(laneId);
      return { ok: true, laneId };
    },
  });
  const { resumeLaneAfterGovernedAction } = await import("../lib/vacilando/governed-action-request.mjs");
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  const resumed = await resumeLaneAfterGovernedAction(out.request.request_id, { root: ROOT });
  assert.equal(resumed.same_lane, true);
  assert.equal(resumed.same_worktree, true);
  assert.equal(starts[0], "alloy-identity");
  assert.equal(sends.some((s) => s.fresh), true);
});

await test("duplicate governed requests dedupe", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  const first = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  const second = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(second.deduped, true);
  assert.equal(second.request.request_id, first.request.request_id);
});

await test("no credential leakage into worker continuation", () => {
  const text = continuationTextForGovernedAction({
    request_id: "gar_x",
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    result_ref: "/tmp/census.json",
    continuation_intent: "Continue W-15/W-20",
  }, {
    id: "tha_x",
    result: {
      census: { org_count: 2, database: "postgresql://user:secret@host/db" },
      leaked: "postgresql://user:secret@host/db",
    },
  });
  assert.doesNotMatch(text, /postgresql:\/\//);
  assert.doesNotMatch(text, /secret@host/);
  assert.doesNotMatch(text, /DATABASE_URL/);
  assert.match(text, /\[redacted\]/);
});

await test("unauthorized action key rejected", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    action_key: "shell.exec",
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
  }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "unsupported_action_key");
});

await test("target allowlist enforced", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    target: "someone_elses_db",
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
  }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.request.failure_code, "target_unavailable");
});

await test("read-only census rejects mutation SQL", () => {
  assert.equal(validateReadOnlySql("DELETE FROM public.user_roles").ok, false);
  const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
  const validated = def.validateInputs({
    queryArtifactPath: MUTATION,
    databaseTarget: "alloy_deployed_primary",
  });
  assert.equal(validated.ok, false);
  executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  const out = requestGovernedAction({
    ...q15WorkerProof(),
    artifact_refs: [MUTATION],
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
  }, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.request.failure_code, "policy_denied");
});

await test("Q15 artifact validates as read-only census SQL", () => {
  assert.equal(Q15_CENSUS_ARTIFACT, Q15);
  assert.equal(existsSync(join(REPO, Q15)), true);
  const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);
  const validated = def.validateInputs({
    queryArtifactPath: Q15,
    databaseTarget: "alloy_deployed_primary",
  });
  assert.equal(validated.ok, true, validated.detail || validated.code);
});

await test("operator conversation: approve / deny / why", () => {
  const pending = {
    request_id: "gar_convo",
    action_key: "database.read_census",
    target: "alloy_deployed_primary",
    purpose: "Verify legacy fallback.",
    reason_worker_cannot_execute: "Lane has no credentials by design.",
    lane_id: "alloy-identity",
    status: "awaiting_operator",
  };
  const ctx = { missionId: "msn_test", pendingGovernedAction: pending, primaryAction: { label: "Approve" } };
  const why = composeMissionDirectorResponse(ctx, { operatorText: "why does this need access?", intent: { mode: "question" } });
  assert.match(why.summary, /no credentials by design/i);
  const approveIntent = classifyMissionComposerIntent("approve the census");
  assert.equal(approveIntent.mode, "action");
  const approve = composeMissionDirectorResponse(ctx, { operatorText: "run the read-only census", intent: approveIntent });
  assert.equal(approve.autoApproveGoverned, true);
  const deny = composeMissionDirectorResponse(ctx, { operatorText: "don't allow production reads", intent: { mode: "action" } });
  assert.equal(deny.autoDenyGoverned, true);
  const cert = composeMissionDirectorResponse(ctx, { operatorText: "use cert only", intent: { mode: "action" } });
  assert.equal(cert.denyCode, "policy_denied");
});

await test("approval then execute resumes the originating run", async () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  const req = requestGovernedAction({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
  }, { root: ROOT });
  assert.equal(req.request.status, "awaiting_operator");
  setGovernedActionExecuteImplForTests(fakeCensusResult);
  setGovernedActionResumeImplForTests({
    resumeLane: async () => ({ ok: true, same_lane: true, same_worktree: true }),
  });
  const approved = await approveGovernedAction(req.request.request_id, { actor: "operator", root: ROOT });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.request.status, "complete");
});

await test("operator conversation: approve the merge / staging migrations / deny this", () => {
  const mergePending = {
    request_id: "gar_merge",
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    target: "staging",
    purpose: "Merge PR 475 into staging.",
    reason_worker_cannot_execute: "Lane has no GitHub credentials by design.",
    lane_id: "alloy-identity",
    status: "awaiting_operator",
    approve_label: "Authorize merge",
  };
  const ctx = { missionId: "msn_ai", pendingGovernedAction: mergePending, primaryAction: { label: "Authorize merge" } };
  const why = composeMissionDirectorResponse(ctx, { operatorText: "why does this need approval?", intent: { mode: "question" } });
  assert.match(why.summary, /no GitHub credentials/i);
  assert.equal(classifyMissionComposerIntent("approve the merge").mode, "action");
  const approve = composeMissionDirectorResponse(ctx, { operatorText: "approve the merge", intent: { mode: "action" } });
  assert.equal(approve.autoApproveGoverned, true);
  const deny = composeMissionDirectorResponse(ctx, { operatorText: "deny this", intent: { mode: "action" } });
  assert.equal(deny.autoDenyGoverned, true);
  assert.match(deny.summary, /merge is denied/i);
  const migCtx = {
    ...ctx,
    pendingGovernedAction: {
      ...mergePending,
      request_id: "gar_mig",
      action_key: ACTION_TYPES.DATABASE_APPLY_MIGRATION,
      approve_label: "Authorize staging migrations",
    },
  };
  const approveMig = composeMissionDirectorResponse(migCtx, { operatorText: "approve the staging migrations", intent: { mode: "action" } });
  assert.equal(approveMig.autoApproveGoverned, true);
});

await test("unauthorized shell and raw SQL action keys are rejected", () => {
  executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Promote", status: "running" });
  for (const action_key of ["shell.exec", "gh pr merge", "database.execute_sql", "repository.run_command"]) {
    const out = requestGovernedAction({
      action_key,
      target: "staging",
      purpose: "not allowed",
      reason_worker_cannot_execute: "lane has no credentials",
      mission_id: mission.mission_id,
      lane_id: "alloy-identity",
    }, { root: ROOT });
    assert.equal(out.ok, false, action_key);
    assert.equal(out.error === "unsupported_action_key" || out.request?.failure_code === "action_unavailable" || out.error === "unauthorized_action_key", true, `${action_key} ${out.error}`);
  }
});

await test("merge then migration continuation waits for one batch approval", async () => {
  const repo = mkdtempSync(join(tmpdir(), "gar-mig-"));
  mkdirSync(join(repo, "supabase", "migrations"), { recursive: true });
  const v1 = "20260818170000_w13_collapse_portal_eligible.sql";
  const v2 = "20260818180000_w61_role_key_fk_restrict_no_cascade.sql";
  writeFileSync(join(repo, "supabase", "migrations", v1), "-- one\nselect 1;\n");
  writeFileSync(join(repo, "supabase", "migrations", v2), "-- two\nselect 2;\n");
  const git = (args) => {
    const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" });
    if (r.status !== 0) throw new Error(r.stderr || r.stdout || args.join(" "));
    return String(r.stdout || "").trim();
  };
  git(["init"]);
  git(["config", "user.email", "vacilando@example.test"]);
  git(["config", "user.name", "Vacilando"]);
  git(["add", "."]);
  git(["commit", "-m", "migrations"]);
  const sha = git(["rev-parse", "HEAD"]);
  git(["update-ref", "refs/remotes/origin/staging", sha]);
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Promote", status: "running" });
  const req = requestGovernedAction({
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    target: "staging",
    purpose: "Merge PR 475 into staging",
    reason_worker_cannot_execute: "Development Lane has no GitHub token by design.",
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
    worktree_path: repo,
    inputs: {
      repository: "ksquared-16/alloy",
      pull_request_number: 475,
      target_branch: "staging",
      expected_head_sha: sha,
      merge_method: "merge",
    },
    continuation_plan: {
      kind: "staging_schema_promotion",
      migrations: [
        { version: "20260818170000", path: `supabase/migrations/${v1}` },
        { version: "20260818180000", path: `supabase/migrations/${v2}` },
      ],
    },
  }, { root: ROOT });
  assert.equal(req.ok, true, req.error || req.request?.failure_reason);
  assert.equal(req.request.status, "awaiting_operator");
  assert.match(req.request.mission_need || req.request.wait_label || "", /Merge PR #475|staging merge/i);
  const waiting = activeRunForLane("alloy-identity", ROOT);
  assert.equal(waiting.state, "WAITING_RESOURCE");
  assert.equal(String(waiting.state_reason || waiting.resource_wait?.summary || "").includes("Ready for instruction"), false);
  setGovernedActionExecuteImplForTests((rec) => ({
    ok: true,
    action: {
      id: `tha_${rec.action_key}`,
      state: "completed",
      actionType: rec.action_key,
      inputs: rec.inputs,
      result: rec.action_key === ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST
        ? { merge_sha: sha, staging_sha: sha, credentials_exposed: false }
        : { environment: "staging", stopped: false, migrations: [{ ok: true }], credentials_exposed: false },
    },
  }));
  const approved = await approveGovernedAction(req.request.request_id, { actor: "operator", root: ROOT });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(approved.request.status, "complete");
  const pending = pendingGovernedActionForLane("alloy-identity", ROOT);
  assert.ok(pending, "expected migration continuation");
  assert.equal(pending.action_key, ACTION_TYPES.DATABASE_APPLY_MIGRATION);
  assert.equal(pending.status, "awaiting_operator");
  assert.match(pending.mission_need || pending.wait_label || pending.title || "", /staging schema|staging migrations|Access & Identity/i);
  const stillWaiting = activeRunForLane("alloy-identity", ROOT);
  assert.equal(stillWaiting.state, "WAITING_RESOURCE");
  assert.equal(JSON.stringify(pending).includes("DATABASE_URL"), false);
  const dup = requestGovernedAction({
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    target: "staging",
    purpose: "Merge PR 475 into staging",
    reason_worker_cannot_execute: "Development Lane has no GitHub token by design.",
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
    inputs: {
      repository: "ksquared-16/alloy",
      pull_request_number: 475,
      target_branch: "staging",
      expected_head_sha: sha,
      merge_method: "merge",
    },
  }, { root: ROOT });
  assert.equal(dup.deduped === true || dup.request?.status === "complete" || dup.request?.request_id === req.request.request_id, true);
});

await test("prior merge authorization for SHA A does not auto-execute SHA B", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Access & Identity V2", objective: "Promote", status: "running" });
  const shaA = "c3a88b874435938b973d297a2c855d5c39a76197";
  const shaB = "f1cb105e01deeb64de933c13a83999962f1457da";
  grantMissionAuthorization({
    missionId: mission.mission_id,
    actionType: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    databaseTarget: "staging",
    queryHash: shaA,
    actor: "operator",
  });
  const out = requestGovernedAction({
    action_key: ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST,
    target: "staging",
    purpose: "Merge PR 475 into staging",
    reason_worker_cannot_execute: "Development Lane has no GitHub token by design.",
    mission_id: mission.mission_id,
    lane_id: "alloy-identity",
    run_id: run.run_id,
    inputs: {
      repository: "ksquared-16/alloy",
      pull_request_number: 475,
      target_branch: "staging",
      expected_head_sha: shaB,
      merge_method: "merge",
    },
  }, { root: ROOT });
  assert.equal(out.ok, true, out.error || out.request?.failure_reason);
  assert.equal(out.request.status, "awaiting_operator");
  assert.notEqual(out.request.status, "complete");
  assert.notEqual(out.request.status, "executing");
  assert.equal(pendingGovernedActionForLane("alloy-identity", ROOT)?.request_id, out.request.request_id);
});

await test("CLI governed-action report", () => {
  const run = executingRun();
  const mission = createMission({ slot: 1, title: "Identity", objective: "Q15", status: "running" });
  const payload = JSON.stringify({
    ...q15WorkerProof(),
    mission_id: mission.mission_id,
  });
  const cli = spawnSync(process.execPath, [
    join(HERE, "..", "vac-session-report.mjs"),
    "governed-action",
    "--run", run.run_id,
    "--lane", "alloy-identity",
    "--json", payload,
  ], {
    env: { ...process.env, ALLOY_RUNTIME_ROOT: ROOT },
    encoding: "utf8",
  });
  assert.equal(cli.status, 0, cli.stderr);
  assert.match(cli.stdout, /governed-action requested/);
  tickGovernedActions({ root: ROOT });
  assert.equal(pendingGovernedActionForLane("alloy-identity", ROOT).status, "awaiting_operator");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
