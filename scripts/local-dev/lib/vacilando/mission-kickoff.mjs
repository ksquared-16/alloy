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

  if (!brief.title?.trim()) {
    mission_ambiguities.push({ code: "missing_title", message: "Mission title is required" });
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

  return {
    ready: mission_ambiguities.length === 0,
    operational_gaps,
    mission_ambiguities,
    kickoff_card,
  };
}

/**
 * Ingest a brief for a mission: create draft mission, brief under that id,
 * objective spine, timeline seed. Does NOT start execution.
 */
export function ingestMissionBrief(input = {}, { slot = null, provider = "claude", actor = "operator", nowMs } = {}) {
  const title = String(input.title || "").trim() || "(untitled mission)";
  const objectiveText = String(input.objective || "").trim();
  const mission = createMission({
    slot,
    provider,
    title,
    objective: objectiveText,
    status: "draft",
    actor,
    nowMs,
  });

  const brief = createBrief({
    ...input,
    missionId: mission.mission_id,
    title,
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
    summary: `Mission Brief v${brief.version} ingested — awaiting kickoff approval`,
    visibility: "summary",
    actor,
    detail: {
      mission_brief_version: brief.version,
      mission_content_hash: brief.contentHash,
      phase_count: (brief.plan || []).length,
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
    summary: `Kickoff approved — executing Mission Brief v${brief.version}`,
    visibility: "summary",
    actor,
    detail: {
      mission_brief_version: brief.version,
      mission_content_hash: brief.contentHash,
      phase_ids: (brief.plan || []).map((p) => p.phaseId),
    },
    nowMs,
  });

  const first = (brief.plan || []).slice().sort((a, b) => a.order - b.order)[0];
  if (first) {
    appendTimelineEvent(missionKey, {
      type: "phase_started",
      summary: `Phase started — ${first.title}`,
      visibility: "summary",
      phaseId: first.phaseId,
      actor: "director",
      detail: { order: first.order },
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
