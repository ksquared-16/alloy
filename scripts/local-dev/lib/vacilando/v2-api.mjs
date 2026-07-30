/**
 * Vacilando V2 HTTP handlers — Mission Brief execution surface.
 * Kept as one module so vacilando-server stays a thin dispatcher.
 */
import {
  ingestMissionBrief,
  reviewMissionReadiness,
  approveMissionExecution,
  getKickoffState,
} from "./mission-kickoff.mjs";
import { getBrief, getBriefVersion, listBriefVersions, proposeBriefRevision, createBrief } from "./mission-brief.mjs";
import { readTimelineSummary, summarizeFromTimeline, readTimeline } from "./timeline.mjs";
import {
  listAssignments,
  getAssignment,
  buildAssignmentPackage,
  acknowledgeWorkerContext,
  submitWorkerStartReport,
  reportWorkerProgress,
  reportWorkerBlocker,
  submitWorkerCompletion,
  validateAssignmentCompletion,
  pauseAssignments,
  resumeAssignments,
  invalidateWorkerContexts,
  assignmentDependencyGraph,
} from "./worker-assignment.mjs";
import {
  createDecision,
  answerDecision,
  listDecisions,
  getDecision,
  classifyIssue,
} from "./decisions.mjs";
import {
  attachEvidence,
  listEvidence,
  listValidationRuns,
  recordValidationRun,
  acceptanceEvidenceCoverage,
  canCertifyMission,
  buildMissionCompletionPackage,
  listAllEvidenceGalleries,
} from "./evidence.mjs";
import {
  claimResource,
  releaseResource,
  listResourceClaims,
  hasBuildLockConflict,
} from "./resource-claims.mjs";
import {
  recordHeartbeat,
  getWorkerTelemetry,
  listWorkerTelemetry,
  recoverWorker,
  detectStaleWorkers,
} from "./worker-health.mjs";
import {
  buildDirectorSummary,
  listMissionsV2,
  getMissionDetailProjection,
} from "./director-summary.mjs";
import { buildMissionContextPackage } from "./mission-context.mjs";

export async function handleV2Post(path, body) {
  const v = body || {};

  if (path === "/api/v2/missions/brief/ingest") {
    try {
      return { status: 201, body: ingestMissionBrief(v, { slot: v.slot ?? null, provider: v.provider || "claude", actor: v.actor || "operator" }) };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/missions/brief/approve") {
    const out = approveMissionExecution(v.brief_id || v.mission_brief_id || v.mission_id, v.version, {
      actor: v.actor || "operator",
      slot: v.slot ?? null,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/missions/brief/review") {
    const brief = (v.version != null ? getBriefVersion(v.brief_id || v.mission_id, v.version) : null)
      || getBrief(v.brief_id || v.mission_id);
    if (!brief) return { status: 404, body: { ok: false, error: "brief_not_found" } };
    return { status: 200, body: { ok: true, brief, readiness: reviewMissionReadiness(brief) } };
  }
  if (path === "/api/v2/missions/brief/revise") {
    try {
      const brief = proposeBriefRevision(v.brief_id || v.mission_id, v.patch || v, {
        actor: v.actor || "operator",
        changeSummary: v.change_summary || v.changeSummary,
        approvalSource: v.approval_source || "operator_edit",
      });
      return { status: 200, body: { ok: true, brief, readiness: reviewMissionReadiness(brief) } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }

  if (path === "/api/v2/assignments/ack") {
    return { status: 200, body: acknowledgeWorkerContext(v) };
  }
  if (path === "/api/v2/assignments/start-report") {
    return { status: 200, body: submitWorkerStartReport(v) };
  }
  if (path === "/api/v2/assignments/progress") {
    return { status: 200, body: reportWorkerProgress(v) };
  }
  if (path === "/api/v2/assignments/blocker") {
    return { status: 200, body: reportWorkerBlocker(v) };
  }
  if (path === "/api/v2/assignments/complete") {
    const out = submitWorkerCompletion(v);
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/assignments/validate") {
    return { status: 200, body: validateAssignmentCompletion(v.mission_id || v.missionId, v.assignment_id || v.assignmentId, { actor: v.actor || "director" }) };
  }
  if (path === "/api/v2/assignments/pause") {
    return { status: 200, body: { ok: true, assignments: pauseAssignments(v.mission_id, v.assignment_ids || [], { reason: v.reason, decisionId: v.decision_id }) } };
  }
  if (path === "/api/v2/assignments/resume") {
    return { status: 200, body: { ok: true, assignments: resumeAssignments(v.mission_id, v.assignment_ids || [], { reason: v.reason }) } };
  }

  if (path === "/api/v2/decisions") {
    const out = createDecision({
      ...v,
      missionId: v.mission_id || v.missionId,
      pauseAssignments,
    });
    return { status: 201, body: { ok: true, ...out } };
  }
  if (path === "/api/v2/decisions/answer") {
    const out = answerDecision({
      ...v,
      missionId: v.mission_id || v.missionId,
      decisionId: v.decision_id || v.decisionId,
      chosenOptionId: v.chosen_option_id || v.chosenOptionId,
      changesApprovedIntent: Boolean(v.changes_approved_intent || v.changesApprovedIntent),
      briefPatch: v.brief_patch || v.briefPatch,
      changeSummary: v.change_summary || v.changeSummary,
      resumeAssignments,
      invalidateWorkerContexts,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/issues/classify") {
    return { status: 200, body: { ok: true, ...classifyIssue(v.kind) } };
  }

  if (path === "/api/v2/evidence") {
    try {
      const art = attachEvidence({
        ...v,
        missionId: v.mission_id || v.missionId,
        assignmentId: v.assignment_id || v.assignmentId,
        acceptanceCriteriaIds: v.acceptance_criteria_ids || v.acceptanceCriteriaIds || [],
      });
      return { status: 201, body: { ok: true, artifact: art } };
    } catch (e) {
      return { status: 400, body: { ok: false, error: String(e && e.message || e) } };
    }
  }
  if (path === "/api/v2/validation-runs") {
    return { status: 201, body: { ok: true, run: recordValidationRun({
      ...v,
      missionId: v.mission_id || v.missionId,
      assignmentId: v.assignment_id || v.assignmentId,
      exitStatus: v.exit_status ?? v.exitStatus,
      commitSha: v.commit_sha || v.commitSha,
    }) } };
  }

  if (path === "/api/v2/resources/claim") {
    const out = claimResource({
      ...v,
      missionId: v.mission_id || v.missionId,
      assignmentId: v.assignment_id || v.assignmentId,
      workerId: v.worker_id || v.workerId,
      resourceKey: v.resource_key || v.resourceKey,
    });
    return { status: out.ok ? 200 : 409, body: out };
  }
  if (path === "/api/v2/resources/release") {
    return { status: 200, body: releaseResource(v.claim_id || v.claimId, { actor: v.actor || "director" }) };
  }

  if (path === "/api/v2/workers/heartbeat") {
    return { status: 200, body: { ok: true, telemetry: recordHeartbeat({
      ...v,
      workerId: v.worker_id || v.workerId,
      assignmentId: v.assignment_id || v.assignmentId,
      missionId: v.mission_id || v.missionId,
      processId: v.process_id || v.processId,
      cpuPercent: v.cpu_percent ?? v.cpuPercent,
      memoryMb: v.memory_mb ?? v.memoryMb,
      activeCommand: v.active_command || v.activeCommand,
    }) } };
  }
  if (path === "/api/v2/workers/recover") {
    return { status: 200, body: recoverWorker({
      ...v,
      workerId: v.worker_id || v.workerId,
      missionId: v.mission_id || v.missionId,
      assignmentId: v.assignment_id || v.assignmentId,
    }) };
  }

  return null; // not a V2 route
}

export function handleV2Get(path, url) {
  const q = (k) => url.searchParams.get(k);

  if (path === "/api/v2/missions") {
    return { status: 200, body: { ok: true, missions: listMissionsV2() } };
  }
  if (path === "/api/v2/mission") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    return { status: 200, body: { ok: true, ...getMissionDetailProjection(id) } };
  }
  if (path === "/api/v2/mission/summary") {
    const id = q("id") || q("mission_id");
    if (!id) return { status: 400, body: { ok: false, error: "missing_id" } };
    return { status: 200, body: { ok: true, summary: buildDirectorSummary(id) } };
  }
  if (path === "/api/v2/mission/context") {
    const id = q("id") || q("mission_id");
    const ctx = buildMissionContextPackage(id, { phaseId: q("phase_id") });
    if (!ctx) return { status: 404, body: { ok: false, error: "context_unavailable" } };
    return { status: 200, body: { ok: true, context: ctx } };
  }
  if (path === "/api/v2/mission/kickoff") {
    return { status: 200, body: getKickoffState(q("id") || q("mission_id")) };
  }
  if (path === "/api/v2/mission/timeline") {
    const id = q("id") || q("mission_id");
    return { status: 200, body: { ok: true, timeline: readTimelineSummary(id, { limit: 100 }), summary: summarizeFromTimeline(id), full: q("full") === "1" ? readTimeline(id) : undefined } };
  }
  if (path === "/api/v2/mission/brief") {
    const id = q("id") || q("mission_id");
    const ver = q("version");
    const brief = (ver != null ? getBriefVersion(id, Number(ver)) : null) || getBrief(id);
    if (!brief) return { status: 404, body: { ok: false, error: "brief_not_found" } };
    return { status: 200, body: { ok: true, brief, versions: listBriefVersions(id), readiness: reviewMissionReadiness(brief) } };
  }
  if (path === "/api/v2/assignments") {
    const mid = q("mission_id") || q("id");
    return { status: 200, body: { ok: true, assignments: listAssignments(mid || null), graph: mid ? assignmentDependencyGraph(mid) : null } };
  }
  if (path === "/api/v2/assignment") {
    const mid = q("mission_id");
    const aid = q("assignment_id") || q("id");
    const pkg = buildAssignmentPackage(mid, aid);
    if (!pkg) return { status: 404, body: { ok: false, error: "assignment_not_found" } };
    return { status: 200, body: { ok: true, ...pkg } };
  }
  if (path === "/api/v2/decisions") {
    const mid = q("mission_id");
    const status = q("status");
    return { status: 200, body: { ok: true, decisions: listDecisions(mid || null, { status: status || null }) } };
  }
  if (path === "/api/v2/decision") {
    const d = getDecision(q("mission_id"), q("id") || q("decision_id"));
    if (!d) return { status: 404, body: { ok: false, error: "decision_not_found" } };
    return { status: 200, body: { ok: true, decision: d } };
  }
  if (path === "/api/v2/evidence") {
    const mid = q("mission_id");
    if (!mid) return { status: 200, body: { ok: true, galleries: listAllEvidenceGalleries() } };
    return {
      status: 200,
      body: {
        ok: true,
        artifacts: listEvidence(mid, { assignmentId: q("assignment_id"), type: q("type") }),
        coverage: acceptanceEvidenceCoverage(mid),
        validation_runs: listValidationRuns(mid),
        certification: canCertifyMission(mid),
        completion_package: q("cert") === "1" ? buildMissionCompletionPackage(mid) : undefined,
      },
    };
  }
  if (path === "/api/v2/resources") {
    return { status: 200, body: { ok: true, claims: listResourceClaims({ type: q("type"), missionId: q("mission_id") }), build_lock_held: hasBuildLockConflict() } };
  }
  if (path === "/api/v2/workers") {
    return { status: 200, body: { ok: true, workers: listWorkerTelemetry(), stale: detectStaleWorkers() } };
  }
  if (path === "/api/v2/worker") {
    const id = q("id") || q("worker_id");
    const tel = getWorkerTelemetry(id);
    if (!tel) return { status: 404, body: { ok: false, error: "worker_not_found" } };
    const assignment = tel.missionId && tel.assignmentId
      ? getAssignment(tel.missionId, tel.assignmentId)
      : null;
    const evidence = tel.missionId
      ? listEvidence(tel.missionId, { assignmentId: tel.assignmentId })
      : [];
    return { status: 200, body: { ok: true, telemetry: tel, assignment, evidence } };
  }

  return null;
}
