/**
 * Vacilando — Mission kickoff (Director Execution System V2 §4 Phase 1).
 *
 * Ingest an approved Mission Brief, review readiness (operational vs mission
 * ambiguity), and approve execution — binding brief version + contentHash onto
 * mission + objective spine copied from the brief's phases.
 *
 * Legacy capability-roadmap objectives (Access & Roles) are untouched: this
 * module only creates/updates brief-origin objectives keyed by mission id.
 */
import { createBrief, getBrief, getBriefVersion, computeContentHash } from "./mission-brief.mjs";
import { appendTimelineEvent, readTimeline, readTimelineSummary, summarizeFromTimeline } from "./timeline.mjs";
import {
  createBriefObjective,
  getObjectiveByMission,
  markObjectiveExecuting,
} from "./objective.mjs";
import { createMission, getMission, updateMission } from "./commands/missions.mjs";
import { createAssignmentsFromBrief } from "./worker-assignment.mjs";

/**
 * Distinguish operational gaps (Director can resolve) from mission-level
 * ambiguity (requires user before changing intent/scope/risk).
 */
export function reviewMissionReadiness(brief, { slotsAvailable = null, repositoryOk = true } = {}) {
  if (!brief) {
    return {
      ready: false,
      operational_gaps: [{ code: "no_brief", message: "No Mission Brief provided" }],
      mission_ambiguities: [],
      kickoff_card: null,
    };
  }

  const operational_gaps = [];
  const mission_ambiguities = [];

  const titleTrim = String(brief.title || "").trim();
  if (!titleTrim || /^untitled(\s+mission)?$/i.test(titleTrim)) {
    mission_ambiguities.push({
      code: "missing_title",
      message: "Please confirm a mission title — Director could not infer one from the brief",
    });
  }
  if (!brief.objective?.trim()) {
    mission_ambiguities.push({ code: "missing_objective", message: "Mission objective is required" });
  }
  if (!Array.isArray(brief.plan) || brief.plan.length === 0) {
    mission_ambiguities.push({ code: "missing_plan", message: "At least one phase is required" });
  }
  if (!Array.isArray(brief.acceptanceCriteria) || brief.acceptanceCriteria.length === 0) {
    mission_ambiguities.push({
      code: "missing_acceptance_criteria",
      message: "Acceptance criteria are required before kickoff",
    });
  }

  const byId = new Map((brief.plan || []).map((p) => [p.phaseId, p]));
  for (const phase of brief.plan || []) {
    for (const dep of phase.dependencies || []) {
      const d = byId.get(dep);
      if (!d) {
        mission_ambiguities.push({
          code: "unknown_dependency",
          message: `Phase "${phase.title}" depends on unknown phase ${dep}`,
          phaseId: phase.phaseId,
        });
      } else if (d.order >= phase.order) {
        mission_ambiguities.push({
          code: "impossible_dependency_order",
          message: `Phase "${phase.title}" depends on "${d.title}" which is not earlier in order`,
          phaseId: phase.phaseId,
        });
      }
    }
  }

  const acIds = new Set((brief.acceptanceCriteria || []).map((c) => c.id));
  for (const phase of brief.plan || []) {
    for (const acId of phase.acceptanceCriteriaIds || []) {
      if (!acIds.has(acId)) {
        mission_ambiguities.push({
          code: "dangling_acceptance_ref",
          message: `Phase "${phase.title}" references unknown acceptance criterion ${acId}`,
          phaseId: phase.phaseId,
        });
      }
    }
  }

  if (repositoryOk === false) {
    operational_gaps.push({ code: "missing_repository", message: "Repository path not resolved yet" });
  }
  if (Array.isArray(slotsAvailable) && slotsAvailable.length === 0) {
    operational_gaps.push({ code: "no_worker_slot", message: "No worker slot available — Director will wait or ask" });
  }
  if (!brief.executionPreferences?.mergeTarget) {
    operational_gaps.push({
      code: "unclear_branch_target",
      message: "Merge target not set — Director will default to staging unless told otherwise",
      resolvable: true,
    });
  }

  const prefs = brief.executionPreferences || {};
  const planChanges = []; // Phase 1: Director must not invent plan changes
  const kickoff_card = {
    title: brief.title,
    plan_received: true,
    phase_count: (brief.plan || []).length,
    acceptance_criteria_count: (brief.acceptanceCriteria || []).length,
    source_document_count: (brief.sourceMaterials || []).length,
    constraint_count: (brief.constraints || []).length,
    director_execution_plan: {
      max_concurrent_workers: prefs.maxConcurrentWorkers ?? 1,
      preferred_slots: prefs.preferredSlots || [],
      merge_requires_user_approval: prefs.requireUserApprovalBeforeMerge !== false,
      migration_requires_user_approval: prefs.requireUserApprovalBeforeMigration !== false,
      required_validation_profiles: prefs.requiredValidationProfiles || [],
      estimated_risk: mission_ambiguities.length ? "High" : operational_gaps.some((g) => !g.resolvable) ? "Medium" : "Low",
    },
    plan_changes_by_director: planChanges.length ? planChanges : "None",
    ready_to_begin: mission_ambiguities.length === 0,
    mission_brief_version: brief.version,
    mission_content_hash: brief.contentHash,
  };

  const findings = [
    ...mission_ambiguities.map((a) => ({
      blocking: true,
      message: a.message,
      code: a.code,
      kind: "ambiguity",
      phaseId: a.phaseId || null,
    })),
    ...operational_gaps.map((g) => ({
      blocking: g.resolvable === false,
      message: g.message,
      code: g.code,
      kind: "operational",
      resolvable: g.resolvable !== false,
    })),
  ];

  return {
    ready: mission_ambiguities.length === 0,
    operational_gaps,
    mission_ambiguities,
    findings,
    directorAssessment: mission_ambiguities.length === 0 ? "Ready" : "Needs clarification",
    kickoff_card,
  };
}

/** Infer a human mission title — never leave "Untitled Mission". */
export function inferMissionTitle({ title = "", objective = "", plan = [] } = {}) {
  const raw = String(title || "").trim();
  if (raw && !/^untitled(\s+mission)?$/i.test(raw) && raw !== "(untitled mission)") {
    return raw;
  }
  const obj = String(objective || "").trim();
  if (obj) {
    const first = obj.split(/[.!\n]/)[0].trim();
    if (first.length >= 8) {
      return first.length > 72 ? `${first.slice(0, 69)}…` : first;
    }
  }
  const phase = (plan || [])[0]?.title;
  if (phase && String(phase).trim()) return String(phase).trim();
  return null;
}

/** Operator-facing Mission Brief interpretation (raw document stays collapsed). */
export function interpretMissionBrief(brief, readiness = null) {
  const r = readiness || reviewMissionReadiness(brief);
  const title = inferMissionTitle(brief) || brief?.title || null;
  const outcomes = (brief?.acceptanceCriteria || []).map((c) => c.statement || c).filter(Boolean);
  const deliverables = (brief?.plan || []).map((p) => ({
    title: p.title,
    objective: p.objective,
    outputs: p.requiredOutputs || [],
  }));
  const constraints = (brief?.constraints || []).map((c) => (typeof c === "string" ? c : c.text)).filter(Boolean);
  const disciplines = [];
  const blob = `${brief?.objective || ""} ${(brief?.plan || []).map((p) => p.title).join(" ")}`.toLowerCase();
  if (/auth|identity|role|permission|access/.test(blob)) disciplines.push("Platform / Access");
  if (/ui|drawer|queue|dashboard|operator/.test(blob)) disciplines.push("Operator experience");
  if (/schema|migration|rls|database/.test(blob)) disciplines.push("Data / Schema");
  if (/workflow|director|runtime|worker/.test(blob)) disciplines.push("Runtime / Workflow");
  if (!disciplines.length) disciplines.push("General engineering");

  return {
    title,
    titleInferred: Boolean(title && title !== brief?.title),
    objective: brief?.objective || "",
    expectedOutcomes: outcomes,
    deliverables,
    constraints,
    acceptanceCriteria: outcomes,
    recommendedWorkerDisciplines: disciplines,
    directorAssessment: r.directorAssessment || (r.ready ? "Ready" : "Needs clarification"),
    findings: r.findings || [],
    canStart: r.ready !== false,
    rawBrief: brief,
  };
}

/**
 * Ingest a brief for a mission: create draft mission, brief under that id,
 * objective spine, timeline seed. Does NOT start execution.
 */
export function ingestMissionBrief(input = {}, { slot = null, provider = "claude", actor = "operator", nowMs } = {}) {
  const objectiveText = String(input.objective || "").trim();
  const inferred = inferMissionTitle({
    title: input.title,
    objective: objectiveText,
    plan: input.plan || [],
  });
  const title = inferred || String(input.title || "").trim() || "";
  const mission = createMission({
    slot,
    provider,
    title: title || "Mission title needed",
    objective: objectiveText,
    status: "draft",
    actor,
    nowMs,
  });

  const brief = createBrief({
    ...input,
    missionId: mission.mission_id,
    title: title || "",
    objective: objectiveText,
    createdBy: input.createdBy || actor,
  }, { actor, nowMs });

  updateMission(mission.mission_id, {
    mission_brief_id: brief.missionId,
    mission_brief_version: brief.version,
    mission_content_hash: brief.contentHash,
    kickoff_status: "awaiting_kickoff_approval",
  }, { nowMs });

  const objective = createBriefObjective({
    missionId: mission.mission_id,
    brief,
    status: "awaiting_kickoff_approval",
  });

  appendTimelineEvent(mission.mission_id, {
    type: "mission_created",
    summary: `Director reviewed your Mission Brief (v${brief.version}) and is waiting for kickoff approval`,
    headline: "Director reviewed your Mission Brief",
    visibility: "summary",
    actor,
    detail: {
      mission_brief_version: brief.version,
      mission_content_hash: brief.contentHash,
      phase_count: (brief.plan || []).length,
      technical: `Mission Brief v${brief.version} ingested`,
    },
    nowMs,
  });

  const readiness = reviewMissionReadiness(brief);
  return {
    ok: true,
    brief,
    mission: getMission(mission.mission_id),
    objective,
    readiness,
    interpretation: interpretMissionBrief(brief, readiness),
  };
}

/**
 * Approve execution of the user-owned plan. Objective spine from brief phases;
 * Director may not change phase titles without a new brief version.
 */
export function approveMissionExecution(briefId, version, { actor = "operator", slot = null, nowMs } = {}) {
  const ver = version != null ? Number(version) : null;
  let brief = ver != null ? getBriefVersion(briefId, ver) : getBrief(briefId);
  if (!brief) brief = getBrief(briefId);
  if (!brief) return { ok: false, error: "brief_not_found" };

  if (ver != null && Number(brief.version) !== ver) {
    return { ok: false, error: "brief_version_mismatch", detail: `requested v${ver}, found v${brief.version}` };
  }

  let mission = getMission(brief.missionId);
  if (!mission) {
    mission = createMission({
      slot,
      provider: "claude",
      title: brief.title,
      objective: brief.objective,
      status: "ready",
      actor,
      nowMs,
    });
    // Brief stays keyed by brief.missionId; bind mission fields to brief identity.
  }

  const readiness = reviewMissionReadiness(brief);
  if (!readiness.ready) {
    return {
      ok: false,
      error: "not_ready",
      readiness,
      detail: "Resolve mission-level ambiguities before approving execution",
    };
  }

  const missionKey = mission.mission_id;
  const objective = createBriefObjective({
    missionId: missionKey,
    brief,
    status: "executing",
  });
  markObjectiveExecuting(missionKey);

  updateMission(missionKey, {
    mission_brief_id: brief.missionId,
    mission_brief_version: brief.version,
    mission_content_hash: brief.contentHash,
    kickoff_status: "executing",
    status: mission.status === "draft" ? "ready" : mission.status,
    title: brief.title,
    objective: brief.objective,
  }, { nowMs });

  appendTimelineEvent(missionKey, {
    type: "mission_started",
    summary: `You approved execution of Mission Brief v${brief.version}`,
    headline: "You approved execution",
    visibility: "summary",
    actor,
    detail: {
      mission_brief_version: brief.version,
      mission_content_hash: brief.contentHash,
      phase_ids: (brief.plan || []).map((p) => p.phaseId),
      technical: `Kickoff approved — executing Mission Brief v${brief.version}`,
    },
    nowMs,
  });

  const first = (brief.plan || []).slice().sort((a, b) => a.order - b.order)[0];
  if (first) {
    appendTimelineEvent(missionKey, {
      type: "phase_started",
      summary: `Director assigned the first workstream: ${first.title}`,
      headline: "Director assigned the first workstream",
      visibility: "summary",
      phaseId: first.phaseId,
      actor: "director",
      detail: { order: first.order, technical: `Phase started — ${first.title}` },
      nowMs,
    });
  }

  // Create bounded worker assignments from the brief spine (not capability invent).
  let assignments = [];
  try {
    assignments = createAssignmentsFromBrief(missionKey, brief, {
      slot,
      actor,
      nowMs,
    });
  } catch (e) {
    return {
      ok: false,
      error: "assignment_create_failed",
      detail: String(e && e.message || e),
      brief,
      mission: getMission(missionKey),
      objective,
    };
  }

  return {
    ok: true,
    brief,
    mission: getMission(missionKey),
    objective: getObjectiveByMission(missionKey) || objective,
    assignments,
    readiness,
    kickoff_card: readiness.kickoff_card,
    timeline: readTimelineSummary(missionKey),
  };
}

/** Build §4.4 kickoff card + readiness for an existing brief/mission. */
export function getKickoffState(missionId) {
  const mission = getMission(missionId);
  const briefId = mission?.mission_brief_id || missionId;
  const brief = (mission?.mission_brief_version != null
    ? getBriefVersion(briefId, mission.mission_brief_version)
    : null) || getBrief(briefId) || getBrief(missionId);
  if (!brief) return { ok: false, error: "brief_not_found" };
  const readiness = reviewMissionReadiness(brief);
  const objective = getObjectiveByMission(missionId) || getObjectiveByMission(brief.missionId);
  return {
    ok: true,
    brief,
    mission,
    objective,
    readiness,
    kickoff_card: readiness.kickoff_card,
    kickoff_status: mission?.kickoff_status || objective?.status || null,
    timeline: readTimelineSummary(missionId || brief.missionId),
    timeline_summary: summarizeFromTimeline(missionId || brief.missionId),
  };
}

export { computeContentHash, readTimeline, readTimelineSummary, summarizeFromTimeline };
