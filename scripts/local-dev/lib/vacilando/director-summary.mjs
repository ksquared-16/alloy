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

export function deriveMissionStatus(missionId) {
  const mission = getMission(missionId);
  const brief = getBrief(missionId);
  const objective = getObjectiveByMission(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  const assignments = listAssignments(missionId);
  const cert = brief ? canCertifyMission(missionId) : { ready: false };

  if (!brief && !mission) return { status: "unknown", label: "Unknown" };
  if (mission?.kickoff_status === "awaiting_kickoff_approval" || objective?.status === "awaiting_kickoff_approval") {
    return { status: "awaiting_kickoff_approval", label: "Awaiting Kickoff Approval" };
  }
  if (openDecisions.length) return { status: "decision_required", label: "Decision Required" };
  if (assignments.some((a) => a.status === "blocked")) return { status: "blocked", label: "Blocked" };
  if (assignments.some((a) => a.status === "paused")) return { status: "paused", label: "Paused" };
  if (cert.ready && assignments.length && assignments.every((a) => a.status === "complete")) {
    return { status: "awaiting_completion_approval", label: "Awaiting Completion Approval" };
  }
  if (assignments.some((a) => a.status === "verification")) return { status: "validation", label: "Validation" };
  if (assignments.some((a) => ["running", "ready", "waiting"].includes(a.status))) {
    return { status: "executing", label: "Executing" };
  }
  if (objective?.status === "executing" || mission?.kickoff_status === "executing") {
    return { status: "executing", label: "Executing" };
  }
  return { status: "draft", label: "Draft" };
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
  const status = deriveMissionStatus(missionId);
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
  const workers = listWorkerTelemetry().filter((t) => t.missionId === missionId);

  const where = current
    ? `${status.label} · ${current.title} (${progress.accepted_deliverables}/${progress.total_deliverables} deliverables)`
    : `${status.label} · ${progress.percent}% by accepted deliverables`;

  const whatChanged = latest ? latest.summary : "No timeline events yet";
  const areBlocked = blocked.length > 0 || openDecisions.length > 0;
  const blockedDetail = openDecisions.length
    ? `Decision required: ${openDecisions[0].title}`
    : blocked.length
      ? `${blocked.length} assignment(s) blocked/paused`
      : "No";

  const userInputRequired = openDecisions.length > 0
    || status.status === "awaiting_kickoff_approval"
    || status.status === "awaiting_completion_approval";

  let next = "Continue executing ready assignments";
  if (status.status === "awaiting_kickoff_approval") next = "Approve kickoff to begin execution";
  else if (openDecisions.length) next = `Answer decision: ${openDecisions[0].title}`;
  else if (assignments.some((a) => a.status === "verification")) next = "Director validating worker completion";
  else if (assignments.some((a) => a.status === "ready")) {
    const nextAsg = assignments.find((a) => a.status === "ready");
    next = `Start assignment: ${nextAsg.title}`;
  } else if (status.status === "awaiting_completion_approval") next = "Review completion package and certify";
  else if (progress.percent === 100) next = "Mission deliverables complete";

  return {
    schema_version: "vacilando.director_summary.v1",
    missionId,
    title: brief?.title || getMission(missionId)?.title || missionId,
    brief_version: brief?.version || null,
    content_hash: brief?.contentHash || null,
    status,
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

export function listMissionsV2() {
  const missions = readMissions(null, 300);
  const byId = new Map();
  for (const m of missions) {
    if (m.mission_brief_id || getBrief(m.mission_id)) {
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
  return [...byId.values()].sort((a, b) =>
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
