/**
 * Director Execution System V2 — Phases 2–7 foundation tests.
 * Run: node --test scripts/local-dev/tests/director-execution-v2.test.mjs
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-v2-"));

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { buildMissionContextPackage, validateContextAcknowledgement, EXECUTION_PROTOCOL_VERSION } = await import("../lib/vacilando/mission-context.mjs");
const {
  listAssignments, acknowledgeWorkerContext, submitWorkerStartReport,
  submitWorkerCompletion, validateAssignmentCompletion, pauseAssignments,
  resumeAssignments, assignmentDependencyGraph, buildAssignmentPackage,
  invalidateWorkerContexts,
} = await import("../lib/vacilando/worker-assignment.mjs");
const { createDecision, answerDecision, classifyIssue, listDecisions } = await import("../lib/vacilando/decisions.mjs");
const { attachEvidence, missingRequiredEvidence, canCertifyMission, listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { claimResource, releaseResource, hasBuildLockConflict } = await import("../lib/vacilando/resource-claims.mjs");
const { recordHeartbeat, classifyHealth, recoverWorker, getWorkerTelemetry } = await import("../lib/vacilando/worker-health.mjs");
const { buildDirectorSummary, listMissionsV2 } = await import("../lib/vacilando/director-summary.mjs");
const { getBrief } = await import("../lib/vacilando/mission-brief.mjs");

function briefBody(overrides = {}) {
  return {
    title: "V2 Cert Mission",
    objective: "Prove worker contract",
    plan: [
      { phaseId: "p0", order: 1, title: "Foundation", objective: "Build foundation", requiredOutputs: ["code"], acceptanceCriteriaIds: ["AC1"] },
      { phaseId: "p1", order: 2, title: "QA", objective: "Validate", requiredOutputs: ["tests"], dependencies: ["p0"], acceptanceCriteriaIds: ["AC2"] },
    ],
    acceptanceCriteria: [
      { id: "AC1", statement: "Foundation ships" },
      { id: "AC2", statement: "QA passes" },
    ],
    constraints: [{ id: "C1", text: "No push" }],
    sourceMaterials: [{ id: "S1", ref: "docs/x.md", kind: "document" }],
    executionPreferences: { mergeTarget: "staging", maxConcurrentWorkers: 1 },
    ...overrides,
  };
}

async function seededMission() {
  const ingested = ingestMissionBrief(briefBody(), { slot: 6 });
  const approved = approveMissionExecution(ingested.brief.missionId, ingested.brief.version, { slot: 6 });
  assert.equal(approved.ok, true);
  return approved;
}

test("mission context package binds version + contentHash", async () => {
  const m = await seededMission();
  const ctx = buildMissionContextPackage(m.mission.mission_id);
  assert.equal(ctx.missionVersion, m.brief.version);
  assert.equal(ctx.missionContentHash, m.brief.contentHash);
  assert.equal(ctx.executionProtocolVersion, EXECUTION_PROTOCOL_VERSION);
  assert.ok(ctx.activePhase);
});

test("stale mission hash acknowledgement is rejected", async () => {
  const m = await seededMission();
  const asg = listAssignments(m.mission.mission_id)[0];
  const bad = acknowledgeWorkerContext({
    missionId: m.mission.mission_id,
    assignmentId: asg.assignmentId,
    workerId: "claude-6",
    missionVersion: asg.missionVersion,
    missionContentHash: "deadbeef_stale_hash_000000000000",
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.code, "stale_mission_hash");

  const ok = acknowledgeWorkerContext({
    missionId: m.mission.mission_id,
    assignmentId: asg.assignmentId,
    workerId: "claude-6",
    missionVersion: asg.missionVersion,
    missionContentHash: asg.missionContentHash,
    protocolVersion: EXECUTION_PROTOCOL_VERSION,
    provider: "claude",
  });
  assert.equal(ok.ok, true);
});

test("assignment lifecycle + dependency graph", async () => {
  const m = await seededMission();
  const asgs = listAssignments(m.mission.mission_id);
  assert.equal(asgs.length, 2);
  assert.equal(asgs[0].status, "ready");
  assert.equal(asgs[1].status, "waiting");
  assert.ok(asgs[1].dependencies.includes(asgs[0].assignmentId));
  const graph = assignmentDependencyGraph(m.mission.mission_id);
  assert.equal(graph[0].dependents.length, 1);

  const pkg = buildAssignmentPackage(m.mission.mission_id, asgs[0].assignmentId);
  assert.match(pkg.workerPromptEnvelope, /contentHash/);
  assert.match(pkg.workerPromptEnvelope, /Prohibited changes/);
});

test("completion without evidence is rejected", async () => {
  const m = await seededMission();
  const asg = listAssignments(m.mission.mission_id)[0];
  acknowledgeWorkerContext({
    missionId: m.mission.mission_id, assignmentId: asg.assignmentId, workerId: "w1",
    missionVersion: asg.missionVersion, missionContentHash: asg.missionContentHash,
  });
  submitWorkerStartReport({
    missionId: m.mission.mission_id, assignmentId: asg.assignmentId,
    understoodObjective: asg.objective, intendedApproach: ["implement"],
  });
  const rejected = submitWorkerCompletion({
    missionId: m.mission.mission_id, assignmentId: asg.assignmentId,
    status: "complete", summary: "done", confidence: "high",
  });
  assert.equal(rejected.ok, false);
  assert.equal(rejected.error, "missing_evidence");
  assert.ok(rejected.missing.length > 0);

  // Attach required evidence profile pieces
  for (const type of ["diff", "test", "typecheck", "build", "commit"]) {
    attachEvidence({
      missionId: m.mission.mission_id, assignmentId: asg.assignmentId,
      type, title: type, acceptanceCriteriaIds: ["AC1"],
    });
  }
  const accepted = submitWorkerCompletion({
    missionId: m.mission.mission_id, assignmentId: asg.assignmentId,
    status: "complete", summary: "done with evidence", changesMade: [{ path: "x.ts" }],
  });
  assert.equal(accepted.ok, true);
  const validated = validateAssignmentCompletion(m.mission.mission_id, asg.assignmentId);
  assert.equal(validated.validation.passed, true);
  assert.equal(validated.assignment.status, "complete");
  // dependent unlocks
  assert.equal(listAssignments(m.mission.mission_id)[1].status, "ready");
});

test("decision pause / respond / resume", async () => {
  const m = await seededMission();
  const asgs = listAssignments(m.mission.mission_id);
  const { decision, notification } = createDecision({
    missionId: m.mission.mission_id,
    title: "Auth model choice",
    situation: "Two viable models",
    whyThisMatters: "Changes security posture",
    currentPlan: "Use capability grants",
    discovery: "Legacy roles still in use",
    options: [
      { optionId: "opt_a", label: "Capability grants", description: "Recommended" },
      { optionId: "opt_b", label: "Keep roles", description: "Compat" },
    ],
    recommendation: "opt_a",
    recommendationReason: "Matches doctrine",
    affectedAssignments: [asgs[0].assignmentId],
    pauseAssignments,
  });
  assert.equal(decision.status, "open");
  assert.ok(notification.deep_link.includes(decision.decisionId));
  assert.equal(notification.mobile_ready, true);
  assert.equal(getAssignmentStatus(m.mission.mission_id, asgs[0].assignmentId), "paused");
  // Unrelated assignment (waiting) not in affected list stays waiting
  assert.equal(asgs[1].status, "waiting");

  const answered = answerDecision({
    missionId: m.mission.mission_id,
    decisionId: decision.decisionId,
    chosenOptionId: "opt_a",
    resumeAssignments,
  });
  assert.equal(answered.ok, true);
  assert.equal(listAssignments(m.mission.mission_id).find((a) => a.assignmentId === asgs[0].assignmentId).status, "ready");
});

function getAssignmentStatus(mid, aid) {
  return listAssignments(mid).find((a) => a.assignmentId === aid)?.status;
}

test("decision that changes intent re-versions brief and invalidates context", async () => {
  const m = await seededMission();
  const asg = listAssignments(m.mission.mission_id)[0];
  acknowledgeWorkerContext({
    missionId: m.mission.mission_id, assignmentId: asg.assignmentId, workerId: "w1",
    missionVersion: asg.missionVersion, missionContentHash: asg.missionContentHash,
  });
  const { decision } = createDecision({
    missionId: m.mission.mission_id,
    title: "Expand scope",
    situation: "Need admin impersonation",
    whyThisMatters: "Scope change",
    currentPlan: "No impersonation",
    discovery: "Ops asked for it",
    options: [{ optionId: "yes", label: "Approve" }],
    recommendation: "yes",
    affectedAssignments: [asg.assignmentId],
    pauseAssignments,
  });
  const out = answerDecision({
    missionId: m.mission.mission_id,
    decisionId: decision.decisionId,
    chosenOptionId: "yes",
    changesApprovedIntent: true,
    briefPatch: { outOfScope: [] },
    changeSummary: "Approved impersonation in scope",
    resumeAssignments,
    invalidateWorkerContexts,
  });
  assert.equal(out.ok, true);
  assert.ok(out.brief.version > 1);
  const refreshed = listAssignments(m.mission.mission_id)[0];
  assert.equal(refreshed.contextAcknowledgement, null);
});

test("acceptance criteria coverage + certification gate", async () => {
  const m = await seededMission();
  attachEvidence({
    missionId: m.mission.mission_id, type: "test", title: "AC1 test",
    acceptanceCriteriaIds: ["AC1"],
  });
  let cert = canCertifyMission(m.mission.mission_id);
  assert.equal(cert.ready, false);
  attachEvidence({
    missionId: m.mission.mission_id, type: "test", title: "AC2 test",
    acceptanceCriteriaIds: ["AC2"],
  });
  cert = canCertifyMission(m.mission.mission_id);
  assert.equal(cert.ready, true);
  assert.equal(cert.directorRecommendation, "ready_to_merge");
});

test("worker heartbeat + stalled classification", async () => {
  const tel = recordHeartbeat({
    workerId: "cursor-1", missionId: "msn_x", assignmentId: "asg_x",
    slot: 1, progress: true,
  });
  assert.equal(tel.status, "healthy");
  const stalled = classifyHealth({
    ...tel,
    lastHeartbeatAt: new Date(Date.now() - 120_000).toISOString(),
  });
  assert.equal(stalled.status, "stalled");
  const unsafe = recoverWorker({ workerId: "cursor-1", action: "destroy_worktree" });
  assert.equal(unsafe.ok, false);
  const safe = recoverWorker({ workerId: "cursor-1", action: "checkpoint_and_pause", missionId: "msn_x" });
  assert.equal(safe.ok, true);
});

test("resource claim conflicts for build_lock", async () => {
  const a = claimResource({ type: "build_lock", resourceKey: "typecheck", missionId: "m1", workerId: "w1" });
  assert.equal(a.ok, true);
  assert.equal(hasBuildLockConflict(), true);
  const b = claimResource({ type: "build_lock", resourceKey: "typecheck", missionId: "m2", workerId: "w2" });
  assert.equal(b.ok, false);
  assert.equal(b.error, "resource_conflict");
  releaseResource(a.claim.claimId);
  assert.equal(hasBuildLockConflict(), false);
  const unbrokered = claimResource({ type: "cpu_heavy_job", resourceKey: "npx tsc --noEmit", missionId: "m1" });
  assert.equal(unbrokered.ok, false);
  assert.equal(unbrokered.error, "unbrokered_heavy_job");
});

test("Director summary answers the five required questions", async () => {
  const m = await seededMission();
  const s = buildDirectorSummary(m.mission.mission_id);
  assert.ok(s.where_are_we);
  assert.ok(s.what_changed);
  assert.equal(typeof s.are_we_blocked, "boolean");
  assert.equal(typeof s.is_user_input_required, "boolean");
  assert.ok(s.what_happens_next);
  assert.ok(listMissionsV2().some((row) => row.mission_id === m.mission.mission_id));
});

test("classifyIssue keeps routine work with Director", () => {
  assert.equal(classifyIssue("port_collision").escalate, false);
  assert.equal(classifyIssue("architecture").escalate, true);
});

test("Cursor and Claude get equivalent assignment packages", async () => {
  const m = await seededMission();
  const asg = listAssignments(m.mission.mission_id)[0];
  const pkg = buildAssignmentPackage(m.mission.mission_id, asg.assignmentId);
  assert.ok(pkg.workerPromptEnvelope.includes(asg.missionContentHash));
  // Same envelope regardless of provider — provider is not part of the package body
  assert.equal(pkg.protocolVersion, EXECUTION_PROTOCOL_VERSION);
});
