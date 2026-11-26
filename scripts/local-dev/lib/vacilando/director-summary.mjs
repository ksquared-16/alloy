/**
 * Vacilando — Director summary from structured mission state (V2 §16.2 / §23).
 *
 * Always answers: Where are we? What changed? Are we blocked?
 * Is user input required? What happens next?
 * Never relies on worker chat prose as system of record.
 */
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { getBrief } from "./mission-brief.mjs";
import { getObjectiveByMission } from "./objective.mjs";
import { listAssignments, phaseDeliverableGroups, assignmentDependencyGraph } from "./worker-assignment.mjs";
import { listDecisions } from "./decisions.mjs";
import { acceptanceEvidenceCoverage, canCertifyMission } from "./evidence.mjs";
import { readTimelineSummary } from "./timeline.mjs";
import { getMission, readMissions } from "./commands/missions.mjs";
import { listWorkerTelemetry } from "./worker-health.mjs";
import { deriveMissionPosture } from "./mission-posture.mjs";

export function deriveMissionStatus(missionId) {
  const posture = deriveMissionPosture(missionId);
  return { status: posture.status, label: posture.label, posture };
}

export function missionProgress(missionId) {
  const assignments = listAssignments(missionId);
  if (!assignments.length) {
    const obj = getObjectiveByMission(missionId);
    const phases = obj?.phases || [];
    const done = phases.filter((p) => p.status === "done").length;
    return {
      accepted_deliverables: done,
      total_deliverables: phases.length,
      percent: phases.length ? Math.round((done / phases.length) * 100) : 0,
      basis: "phases",
    };
  }
  const done = assignments.filter((a) => a.status === "complete").length;
  return {
    accepted_deliverables: done,
    total_deliverables: assignments.length,
    percent: Math.round((done / assignments.length) * 100),
    basis: "assignments",
  };
}

/** Structured Director summary — five required answers. */
export function buildDirectorSummary(missionId) {
  const brief = getBrief(missionId);
  const posture = deriveMissionPosture(missionId);
  const status = { status: posture.status, label: posture.label };
  const progress = missionProgress(missionId);
  const groups = phaseDeliverableGroups(missionId);
  const current = groups.find((g) => g.status === "running")
    || groups.find((g) => g.status === "ready" || g.status === "blocked")
    || groups.find((g) => g.status !== "complete")
    || null;
  const openDecisions = listDecisions(missionId, { status: "open" });
  const assignments = listAssignments(missionId);
  const blocked = assignments.filter((a) => a.status === "blocked" || a.status === "paused");
  const timeline = readTimelineSummary(missionId, { limit: 8 });
  const latest = timeline[timeline.length - 1] || null;
  const coverage = acceptanceEvidenceCoverage(missionId);
  const workers = listWorkerTelemetry().filter((t) => t.missionId === missionId && !["stopped", "complete", "failed"].includes(t.status));

  const where = posture.busy && current
    ? `${posture.label} · ${current.title}`
    : posture.detail;

  const whatChanged = latest ? latest.summary : "No timeline events yet";
  const areBlocked = blocked.length > 0 || openDecisions.length > 0 || posture.id === "operator_review";
  const blockedDetail = openDecisions.length
    ? `Decision required: ${openDecisions[0].title}`
    : posture.id === "operator_review"
      ? "Waiting on your direction — worker is idle"
      : blocked.length
        ? `${blocked.length} assignment(s) blocked/paused`
        : "No";

  const userInputRequired = posture.needsYou;
  const next = posture.next;

  return {
    schema_version: "vacilando.director_summary.v1",
    missionId,
    title: brief?.title || getMission(missionId)?.title || missionId,
    brief_version: brief?.version || null,
    content_hash: brief?.contentHash || null,
    status,
    posture,
    progress,
    current_phase: current,
    open_decisions: openDecisions,
    workers: workers.map((w) => ({
      workerId: w.workerId,
      status: w.status,
      assignmentId: w.assignmentId,
      slot: w.slot,
    })),
    evidence_coverage: {
      passed: coverage.filter((c) => c.status === "passed").length,
      total: coverage.length,
    },
    answers: {
      where_are_we: where,
      what_changed: whatChanged,
      are_we_blocked: areBlocked,
      blocked_detail: blockedDetail,
      is_user_input_required: userInputRequired,
      what_happens_next: next,
    },
    where_are_we: where,
    what_changed: whatChanged,
    are_we_blocked: areBlocked,
    blocked_detail: blockedDetail,
    is_user_input_required: userInputRequired,
    what_happens_next: next,
    timeline_tail: timeline.slice(-5),
    generated_at: new Date().toISOString(),
  };
}

export function projectMissionRow(missionId, mission = null) {
  const brief = getBrief(missionId);
  const status = deriveMissionStatus(missionId);
  const progress = missionProgress(missionId);
  const summary = buildDirectorSummary(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  const workers = listWorkerTelemetry().filter((t) => t.missionId === missionId);
  const m = mission || getMission(missionId);
  const groups = phaseDeliverableGroups(missionId);
  const current = groups.find((g) => g.status !== "complete") || null;
  const assignments = listAssignments(missionId);

  return {
    mission_id: missionId,
    title: brief?.title || m?.title || missionId,
    status: status.status,
    status_label: status.label,
    brief_version: brief?.version || m?.mission_brief_version || null,
    current_phase: current
      ? { id: current.phaseId, title: current.title, index: current.order, total: groups.length }
      : null,
    progress,
    director_state: summary.what_happens_next,
    workers: {
      running: workers.filter((w) => w.status === "healthy" || w.status === "starting").length,
      validating: assignments.filter((a) => a.status === "verification").length,
      waiting: assignments.filter((a) => a.status === "waiting" || a.status === "paused").length,
      total: workers.length,
    },
    decision_required: openDecisions.length > 0,
    latest_update: summary.what_changed,
    updated_at: m?.updated_at || brief?.revisedAt || brief?.createdAt || null,
  };
}

export function listMissionsV2({ includeArchived = false } = {}) {
  const missions = readMissions(null, 300);
  const byId = new Map();
  for (const m of missions) {
    // Active Mission Control list requires a durable brief — except archived history,
    // which must remain inspectable even when the brief was never retained.
    const hasBrief = Boolean(getBrief(m.mission_id) || (m.mission_brief_id && getBrief(m.mission_brief_id)));
    if (hasBrief || (includeArchived && m.archived === true)) {
      byId.set(m.mission_id, projectMissionRow(m.mission_id, m));
    }
  }
  const root = process.env.ALLOY_RUNTIME_ROOT?.trim()
    || join(os.homedir(), ".local", "state", "alloy-dev");
  const briefDir = join(root, "vacilando", "mission-briefs");
  if (existsSync(briefDir)) {
    for (const name of readdirSync(briefDir).filter((n) => n.endsWith(".json"))) {
      const id = name.replace(/\.json$/, "");
      if (!byId.has(id)) byId.set(id, projectMissionRow(id, getMission(id)));
    }
  }
  return [...byId.values()]
    .filter((row) => {
      const id = row.mission_id || row.missionId;
      const m = getMission(id);
      const hasBrief = Boolean(getBrief(id));
      if (includeArchived) {
        // History: brief-backed rows plus any archived mission (brief optional).
        return hasBrief || m?.archived === true;
      }
      return hasBrief && m?.archived !== true;
    })
    .sort((a, b) =>
      String(b.updated_at || "").localeCompare(String(a.updated_at || "")));
}

export function getMissionDetailProjection(missionId) {
  const brief = getBrief(missionId);
  const summary = buildDirectorSummary(missionId);
  const mission = getMission(missionId);
  const objective = getObjectiveByMission(missionId);
  return {
    mission_id: missionId,
    mission,
    brief,
    objective,
    summary,
    status: deriveMissionStatus(missionId),
    progress: missionProgress(missionId),
    phases: phaseDeliverableGroups(missionId),
    assignments: listAssignments(missionId),
    graph: assignmentDependencyGraph(missionId),
    decisions: listDecisions(missionId),
    open_decisions: listDecisions(missionId, { status: "open" }),
    evidence: acceptanceEvidenceCoverage(missionId),
    certification: canCertifyMission(missionId),
    timeline: readTimelineSummary(missionId, { limit: 50 }),
    workers: listWorkerTelemetry().filter((t) => t.missionId === missionId),
    row: projectMissionRow(missionId, mission),
  };
}
