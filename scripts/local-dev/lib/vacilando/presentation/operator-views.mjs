/**
 * Vacilando — Operator presentation adapters (Mission Control productization).
 *
 * Translates V2 runtime truth into plain-language view models.
 * Pages must bind to these — never raw persistence schemas.
 */
import { getBrief } from "../mission-brief.mjs";
import { getMission } from "../commands/missions.mjs";
import {
  listAssignments,
  getAssignment,
} from "../worker-assignment.mjs";
import { listDecisions, getDecision } from "../decisions.mjs";
import {
  listEvidence,
  acceptanceEvidenceCoverage,
  canCertifyMission,
} from "../evidence.mjs";
import { readTimelineSummary, readTimeline } from "../timeline.mjs";
import {
  listWorkerTelemetry,
  getWorkerTelemetry,
  detectStaleWorkers,
} from "../worker-health.mjs";
import {
  buildDirectorSummary,
  listMissionsV2,
  projectMissionRow,
} from "../director-summary.mjs";
import { getKickoffState, reviewMissionReadiness } from "../mission-kickoff.mjs";
import {
  getMissionConfidence,
  estimateNextCheckpoint,
} from "../mission-confidence.mjs";


const STATUS_COPY = {
  decision_required: "Decision required",
  awaiting_kickoff_approval: "Waiting for kickoff approval",
  awaiting_completion_approval: "Ready for your completion review",
  blocked: "Blocked",
  paused: "Paused — waiting on a decision",
  executing: "In progress",
  validation: "Validating work",
  draft: "Draft",
  unknown: "Status unknown",
};

const WORKER_HEALTH_COPY = {
  healthy: "Working normally",
  starting: "Starting up",
  idle: "Idle",
  waiting: "Waiting",
  blocked: "Blocked",
  stalled: "Stalled — no recent progress",
  constrained: "Constrained by host resources",
  unresponsive: "Unresponsive — Director is intervening",
  recovering: "Director is recovering this worker",
  failed: "Failed",
  stopped: "Stopped",
  complete: "Complete",
};

const TIMELINE_HEADLINES = {
  mission_created: "Mission created",
  mission_started: "Mission started",
  phase_started: "Phase started",
  phase_completed: "Phase completed",
  assignment_started: "Worker began work",
  assignment_completed: "Deliverable completed",
  progress: "Progress update",
  discovery: "Risk discovered",
  blocker: "Work blocked",
  decision_requested: "Decision requested",
  decision_answered: "Decision answered",
  worker_health: "Worker health changed",
  recovery: "Director recovery attempted",
  evidence_added: "Evidence added",
  validation: "Validation run",
  mission_completed: "Mission completed",
  context_invalidated: "Worker context refreshed",
  commit: "Commit recorded",
  resource_claim: "Resource claimed",
  resource_release: "Resource released",
};

function relTime(iso) {
  if (!iso) return "";
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const sec = Math.round((Date.now() - t) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

function assignmentStatusLabel(status) {
  return ({
    ready: "Ready to start",
    running: "In progress",
    waiting: "Waiting on dependency",
    verification: "Under validation",
    complete: "Accepted",
    blocked: "Blocked",
    paused: "Paused",
    failed: "Failed",
    superseded: "Superseded",
  })[status] || status;
}

function optionLabel(decision, optionId) {
  const opt = (decision.options || []).find((o) => o.optionId === optionId || o.id === optionId);
  return opt?.label || optionId || "Recommendation";
}

/** Mission list card view model */
export function missionListCardVm(row) {
  const r = typeof row === "string" ? projectMissionRow(row) : row;
  const openDecisions = listDecisions(r.mission_id, { status: "open" });
  const top = openDecisions[0] || null;
  const workers = listWorkerTelemetry().filter((w) => w.missionId === r.mission_id);
  const unhealthy = workers.filter((w) => ["unresponsive", "stalled", "failed", "recovering"].includes(w.status));
  const paused = (r.workers?.waiting || 0);
  const phase = r.current_phase;
  const progress = r.progress || {};
  const primaryAction = top
    ? { kind: "open_decision", label: "Open decision", href: `decisions/${top.decisionId}`, decisionId: top.decisionId }
    : r.status === "awaiting_kickoff_approval"
      ? { kind: "open_kickoff", label: "Review kickoff", href: `kickoff/${r.mission_id}` }
      : { kind: "open_mission", label: "Open mission", href: `missions/${r.mission_id}` };

  return {
    kind: "mission_list_card",
    missionId: r.mission_id,
    title: r.title,
    status: r.status,
    statusLabel: STATUS_COPY[r.status] || r.status_label || r.status,
    phaseLabel: phase
      ? `Phase ${phase.index} of ${phase.total} · ${phase.title}`
      : "No active phase yet",
    deliverablesLabel: `${progress.accepted_deliverables ?? 0} of ${progress.total_deliverables ?? 0} deliverables accepted`,
    directorState: r.director_state || "Director is monitoring this mission",
    workersLine: (() => {
      const bits = [];
      if (unhealthy.length) bits.push(`${unhealthy.length} worker${unhealthy.length === 1 ? "" : "s"} need attention`);
      if (paused) bits.push(`${paused} paused`);
      if ((r.workers?.running || 0) > 0) bits.push(`${r.workers.running} working`);
      return bits.join(" · ") || "No active workers";
    })(),
    openDecisionCount: openDecisions.length,
    latestUpdate: r.latest_update || "No updates yet",
    updatedAt: r.updated_at,
    updatedLabel: relTime(r.updated_at),
    primaryAction,
  };
}

/** Director five-question summary for operators */
export function directorSummaryVm(missionId) {
  const s = buildDirectorSummary(missionId);
  return {
    kind: "director_summary",
    questions: [
      { id: "where", label: "Where are we?", answer: s.where_are_we || s.answers?.where_are_we },
      { id: "changed", label: "What changed?", answer: s.what_changed || s.answers?.what_changed },
      {
        id: "blocked",
        label: "Are we blocked?",
        answer: (s.are_we_blocked || s.answers?.are_we_blocked)
          ? (s.blocked_detail || s.answers?.blocked_detail || "Yes")
          : "No — work can continue",
      },
      {
        id: "needs_you",
        label: "Does Director need something from me?",
        answer: (s.is_user_input_required || s.answers?.is_user_input_required)
          ? "Yes — see the decision or approval below"
          : "Not right now",
      },
      { id: "next", label: "What happens next?", answer: s.what_happens_next || s.answers?.what_happens_next },
    ],
    raw: s,
  };
}

/** Work item / deliverable card */
export function workItemVm(assignment) {
  const progress = (assignment.progress || []).slice(-1)[0];
  return {
    kind: "work_item",
    assignmentId: assignment.assignmentId,
    title: assignment.title,
    objective: assignment.objective,
    owner: assignment.workerId || assignment.provider || "Unassigned",
    status: assignment.status,
    statusLabel: assignmentStatusLabel(assignment.status),
    progressSummary: progress?.summary || (assignment.status === "complete" ? "Deliverable accepted" : "No progress reported yet"),
    blocker: assignment.status === "paused"
      ? "Paused pending a decision"
      : assignment.status === "blocked"
        ? (assignment.blocker?.message || "Blocked")
        : null,
    nextStep: assignment.status === "ready"
      ? "Waiting for a worker to start"
      : assignment.status === "running"
        ? "Continue required outputs"
        : assignment.status === "paused"
          ? "Resume after the decision is answered"
          : assignment.status === "waiting"
            ? "Waiting on an upstream deliverable"
            : assignment.status === "complete"
              ? "Done"
              : "See Timeline",
    requiredOutputs: assignment.expectedDeliverables || assignment.scope || [],
  };
}

/** Timeline event for operators */
export function timelineEventVm(ev) {
  const type = ev.type || "event";
  const headline = TIMELINE_HEADLINES[type] || ev.headline || ev.summary || type.replace(/_/g, " ");
  const actorMap = { operator: "You", director: "Director", system: "Vacilando" };
  const actor = actorMap[ev.actor] || (ev.actor?.startsWith("claude") || ev.actor?.startsWith("cursor")
    ? `Worker (${ev.actor})`
    : ev.actor || "System");
  return {
    kind: "timeline_event",
    eventId: ev.event_id || ev.eventId,
    type,
    time: ev.at || ev.occurred_at,
    timeLabel: relTime(ev.at || ev.occurred_at),
    headline,
    explanation: ev.summary && ev.summary !== headline ? ev.summary : (ev.detail?.message || ""),
    actor,
    evidenceIds: ev.evidence_ids || ev.evidenceIds || [],
    decisionId: ev.decision_id || ev.decisionId || null,
    assignmentId: ev.assignment_id || ev.assignmentId || null,
    expandable: Boolean(ev.detail && Object.keys(ev.detail).length),
    detail: ev.detail || null,
  };
}

/** Decision card / detail */
export function decisionCardVm(decision, { missionTitle = null } = {}) {
  const brief = getBrief(decision.missionId);
  const affected = (decision.affectedAssignments || [])
    .map((id) => getAssignment(decision.missionId, id))
    .filter(Boolean);
  const recId = decision.recommendation;
  const recLabel = optionLabel(decision, recId);
  const impact = decision.impact || {};
  const impactBits = [];
  if (impact.data) impactBits.push(`Data: ${impact.data}`);
  if (impact.schedule) impactBits.push(`Schedule: ${impact.schedule}`);
  if (impact.security) impactBits.push(`Security: ${impact.security}`);
  if (impact.product) impactBits.push(`Product: ${impact.product}`);

  return {
    kind: "decision_card",
    decisionId: decision.decisionId,
    missionId: decision.missionId,
    missionTitle: missionTitle || brief?.title || decision.missionId,
    urgency: impact.security || impact.data === "possible" || impact.data === "high" ? "High impact" : "Needs your call",
    title: decision.title,
    question: decision.title,
    situation: decision.situation,
    whyItMatters: decision.whyThisMatters,
    currentPlan: decision.currentPlan,
    discovery: decision.discovery,
    recommendation: recLabel,
    recommendationId: recId,
    recommendationReason: decision.recommendationReason,
    impactLines: impactBits.length ? impactBits : ["Impact details were not provided — review carefully"],
    options: (decision.options || []).map((o) => ({
      id: o.optionId || o.id,
      label: o.label,
      description: o.description || "",
      isRecommended: (o.optionId || o.id) === recId,
    })),
    pausedWork: affected.map((a) => ({
      title: a.title,
      statusLabel: assignmentStatusLabel(a.status),
      assignmentId: a.assignmentId,
    })),
    evidence: decision.evidence || [],
    requestedAt: decision.created_at,
    requestedLabel: relTime(decision.created_at),
    status: decision.status,
    statusLabel: decision.status === "open" ? "Waiting for you" : decision.status === "answered" ? "Answered" : decision.status,
    primaryAction: decision.status === "open"
      ? { label: "Review and decide", href: `decisions/${decision.decisionId}` }
      : null,
    afterAnswer: "Director will record your choice, refresh affected worker context if needed, and resume paused work.",
  };
}

export function decisionDetailVm(missionId, decisionId) {
  const d = getDecision(missionId, decisionId) || listDecisions(null, { status: null }).find((x) => x.decisionId === decisionId);
  if (!d) return null;
  return {
    kind: "decision_detail",
    ...decisionCardVm(d),
    sections: {
      whatHappened: d.discovery || d.situation,
      whyItMatters: d.whyThisMatters,
      recommendation: `${optionLabel(d, d.recommendation)}${d.recommendationReason ? ` — ${d.recommendationReason}` : ""}`,
      impact: decisionCardVm(d).impactLines,
      alternatives: (d.options || []).map((o) => `${o.label}: ${o.description || ""}`.trim()),
      evidence: d.evidence?.length ? d.evidence : ["No attached evidence previews yet"],
      pausedWork: decisionCardVm(d).pausedWork,
      afterAnswer: decisionCardVm(d).afterAnswer,
    },
    actions: [
      { id: "approve", label: "Approve recommendation", optionId: d.recommendation },
      ...((d.options || []).filter((o) => (o.optionId || o.id) !== d.recommendation).map((o) => ({
        id: "alternative",
        label: `Choose: ${o.label}`,
        optionId: o.optionId || o.id,
      }))),
      { id: "ask", label: "Ask Director", optionId: null },
      { id: "reject", label: "Reject and provide direction", optionId: null },
    ],
  };
}

/** Evidence card */
export function evidenceCardVm(artifact, coverageMap = null) {
  const typeLabels = {
    screenshot: "Screenshot",
    video: "Recording",
    test: "Test results",
    build: "Build",
    typecheck: "Typecheck",
    browser: "Browser QA",
    database: "Database",
    migration: "Migration",
    diff: "Change summary",
    log: "Log",
    performance: "Performance",
    security: "Security check",
    commit: "Commit",
    document: "Document",
  };
  const proves = artifact.description
    || (artifact.acceptanceCriteriaIds?.length
      ? `Supports ${artifact.acceptanceCriteriaIds.join(", ")}`
      : `Documents ${typeLabels[artifact.type] || artifact.type}`);
  const path = artifact.fileUri || artifact.externalUri || "";
  const fileName = path.split("/").pop() || null;

  return {
    kind: "evidence_card",
    evidenceId: artifact.evidenceId,
    type: artifact.type,
    typeLabel: typeLabels[artifact.type] || artifact.type,
    title: artifact.title || typeLabels[artifact.type] || "Evidence",
    proves,
    acceptanceCriteriaIds: artifact.acceptanceCriteriaIds || [],
    producedBy: artifact.createdBy === "operator" ? "You"
      : artifact.createdBy === "director" ? "Director"
        : artifact.createdBy || "Worker",
    when: artifact.createdAt,
    whenLabel: relTime(artifact.createdAt),
    environment: artifact.environment || artifact.branch || null,
    commit: artifact.repositorySha ? String(artifact.repositorySha).slice(0, 8) : null,
    previewLabel: fileName ? `Open ${fileName}` : (artifact.command ? `Command: ${artifact.command}` : "View details"),
    technicalPath: path || null,
    command: artifact.command || null,
    exitCode: artifact.exitCode,
    presentation: artifact.type === "screenshot" || artifact.type === "video" ? "media"
      : artifact.type === "test" || artifact.type === "typecheck" || artifact.type === "build" ? "result"
        : artifact.type === "diff" ? "diff"
          : artifact.type === "migration" ? "migration"
            : "document",
  };
}

/** Worker card / detail */
export function workerCardVm(tel) {
  const asg = tel.missionId && tel.assignmentId
    ? getAssignment(tel.missionId, tel.assignmentId)
    : null;
  const brief = tel.missionId ? getBrief(tel.missionId) : null;
  const issue = (tel.detectedIssues || [])[0];
  return {
    kind: "worker_card",
    workerId: tel.workerId,
    missionId: tel.missionId,
    missionTitle: brief?.title || tel.missionId || "Unassigned",
    deliverable: asg?.title || "No deliverable assigned",
    health: tel.status,
    healthLabel: WORKER_HEALTH_COPY[tel.status] || tel.status,
    lastProgress: tel.lastProgressAt ? relTime(tel.lastProgressAt) : "No progress yet",
    lastProgressSummary: asg?.progress?.slice?.(-1)?.[0]?.summary || tel.activeCommand || "—",
    directorAction: ["unresponsive", "stalled", "recovering"].includes(tel.status)
      ? (tel.last_recovery?.action
        ? `Director recovery: ${String(tel.last_recovery.action).replace(/_/g, " ")}`
        : "Director is preparing a safe recovery")
      : "Director is monitoring",
    decisionState: asg?.status === "paused" ? "Paused for a decision" : null,
    slotLabel: tel.slot != null ? `Slot ${tel.slot}` : null,
    modelLabel: tel.workerId?.startsWith("claude") ? "Claude" : tel.workerId?.startsWith("cursor") ? "Cursor" : null,
    primaryAction: { label: "View details", href: `workers/${tel.workerId}` },
    issueDetail: issue?.detail || null,
    technical: {
      workerId: tel.workerId,
      assignmentId: tel.assignmentId,
      processId: tel.processId,
      branch: tel.branch,
      port: tel.port,
      slot: tel.slot,
    },
  };
}

export function workerDetailVm(workerId) {
  const tel = getWorkerTelemetry(workerId);
  if (!tel) return null;
  const card = workerCardVm(tel);
  const asg = tel.missionId && tel.assignmentId
    ? getAssignment(tel.missionId, tel.assignmentId)
    : null;
  const evidence = tel.missionId
    ? listEvidence(tel.missionId, { assignmentId: tel.assignmentId }).map((a) => evidenceCardVm(a))
    : [];
  return {
    kind: "worker_detail",
    ...card,
    objective: asg?.objective || "No assignment objective",
    currentActivity: tel.activeCommand || tel.activeTool || card.lastProgressSummary,
    requiredOutputs: (asg?.expectedDeliverables || asg?.scope || []).map((o) => (
      typeof o === "string" ? { label: o, done: asg?.status === "complete" } : o
    )),
    evidence,
    nextStep: asg ? workItemVm(asg).nextStep : "Await assignment",
    recovery: tel.last_recovery || null,
  };
}

/** Needs You item */
export function needsYouItemVm({ type, missionId, title, body, urgency, action, recommendation }) {
  const brief = getBrief(missionId);
  return {
    kind: "needs_you_item",
    type,
    missionId,
    missionTitle: brief?.title || missionId,
    title,
    body,
    urgency: urgency || "Attention needed",
    recommendation: recommendation || null,
    primaryAction: action,
  };
}

export function listNeedsYou() {
  const items = [];
  for (const d of listDecisions(null, { status: "open" })) {
    const vm = decisionCardVm(d);
    items.push(needsYouItemVm({
      type: "decision",
      missionId: d.missionId,
      title: vm.title,
      body: vm.situation,
      urgency: vm.urgency,
      recommendation: vm.recommendation,
      action: { label: "Review and decide", href: `decisions/${d.decisionId}` },
    }));
  }
  const unhealthy = listWorkerTelemetry().filter((w) =>
    ["unresponsive", "failed", "stalled", "recovering"].includes(w.status));
  for (const w of unhealthy) {
    const card = workerCardVm(w);
    items.push(needsYouItemVm({
      type: "recovery",
      missionId: w.missionId,
      title: `${card.deliverable} — worker needs attention`,
      body: card.directorAction + (card.issueDetail ? ` (${card.issueDetail})` : ""),
      urgency: "Worker recovery",
      recommendation: "Let Director finish recovery, or open Workers for details",
      action: { label: "Open worker", href: `workers/${w.workerId}` },
    }));
  }
  for (const stale of detectStaleWorkers()) {
    const tel = stale.telemetry;
    const asg = stale.assignment;
    if (!asg || unhealthy.some((u) => u.workerId === asg.workerId)) continue;
    items.push(needsYouItemVm({
      type: "recovery",
      missionId: asg.missionId,
      title: `${asg.title} — no recent worker heartbeat`,
      body: "Director has not received a recent heartbeat for this assignment.",
      urgency: "Worker recovery",
      recommendation: "Open Workers so Director can attempt a safe recovery",
      action: { label: "Open workers", href: "workers" },
    }));
  }
  for (const row of listMissionsV2()) {
    if (row.status === "awaiting_completion_approval") {
      items.push(needsYouItemVm({
        type: "completion",
        missionId: row.mission_id,
        title: "Completion approval needed",
        body: "Director believes deliverables are ready for your review.",
        urgency: "Approval",
        recommendation: "Review evidence and accept or send back",
        action: { label: "Open mission", href: `missions/${row.mission_id}` },
      }));
    }
    if (row.status === "awaiting_kickoff_approval") {
      items.push(needsYouItemVm({
        type: "kickoff",
        missionId: row.mission_id,
        title: "Kickoff approval needed",
        body: "Director prepared an execution plan and is waiting for you to start the mission.",
        urgency: "Kickoff",
        recommendation: "Review readiness and start the mission",
        action: { label: "Review kickoff", href: `kickoff/${row.mission_id}` },
      }));
    }
  }
  return items;
}

/** Kickoff / readiness view model */
export function kickoffVm(missionId) {
  if (!missionId) {
    return {
      kind: "kickoff",
      mode: "empty",
      title: "Start a mission",
      emptyActions: [
        { id: "paste", label: "Paste Mission Brief" },
        { id: "import", label: "Import Markdown" },
      ],
    };
  }
  const state = getKickoffState(missionId);
  const brief = state?.brief || getBrief(missionId);
  if (!brief) {
    return {
      kind: "kickoff",
      mode: "empty",
      title: "Start a mission",
      emptyActions: [
        { id: "paste", label: "Paste Mission Brief" },
        { id: "import", label: "Import Markdown" },
      ],
    };
  }
  const readiness = state?.readiness || reviewMissionReadiness(brief);
  const findings = (readiness.findings || []).map((f) => ({
    severity: f.blocking ? "blocking" : "info",
    message: f.message || f.code || JSON.stringify(f),
    kind: f.kind || (f.blocking ? "gap" : "note"),
  }));
  const assignments = listAssignments(missionId);
  return {
    kind: "kickoff",
    mode: readiness.ready === false && findings.some((f) => f.severity === "blocking")
      ? "readiness_blocked"
      : (state?.kickoff_status === "awaiting_kickoff_approval" || !assignments.length)
        ? "approval"
        : "executing",
    missionId,
    title: brief.title,
    objective: brief.objective,
    phases: (brief.plan || []).map((p) => ({
      id: p.phaseId,
      title: p.title,
      objective: p.objective,
      outputs: p.requiredOutputs || [],
    })),
    acceptanceCriteria: brief.acceptanceCriteria || [],
    constraints: (brief.constraints || []).map((c) => (typeof c === "string" ? c : c.text)),
    sources: (brief.sourceMaterials || []).map((s) => s.ref || s.title || s.id),
    findings,
    assignmentCount: assignments.length || (brief.plan || []).length,
    kickoffStatus: state?.kickoff_status || null,
    canStart: readiness.ready !== false && (state?.kickoff_status === "awaiting_kickoff_approval" || !state?.kickoff_status),
    primaryAction: {
      label: "Start mission",
      disabled: readiness.ready === false,
    },
  };
}

/** Full Mission Dashboard composition (replaces Mission Overview). */
export function missionDashboardVm(missionId) {
  const brief = getBrief(missionId);
  const mission = getMission(missionId);
  if (!brief && !mission) return null;

  const row = projectMissionRow(missionId, mission);
  const card = missionListCardVm(row);
  const confidence = getMissionConfidence(missionId);
  const checkpoint = estimateNextCheckpoint(missionId);
  const summary = directorSummaryVm(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" }).map((d) => decisionCardVm(d, { missionTitle: card.title }));
  const assignments = listAssignments(missionId);
  const workers = listWorkerTelemetry().filter((w) => w.missionId === missionId);
  const activeWorkers = workers.filter((w) => !["stopped", "complete", "failed"].includes(w.status));

  const needsMe = listNeedsYou().filter((n) => n.missionId === missionId);

  const currentWork = assignments.map((a) => {
    const tel = workers.find((w) => w.assignmentId === a.assignmentId);
    const model = tel?.workerId?.startsWith("claude") ? "Claude"
      : tel?.workerId?.startsWith("cursor") ? "Cursor"
        : a.provider === "claude" ? "Claude"
          : a.provider === "cursor" ? "Cursor"
            : a.workerId ? "Worker" : null;
    return {
      kind: "current_work",
      title: a.title,
      objective: a.objective,
      status: a.status,
      statusLabel: ({
        ready: "Ready",
        running: "Implementing",
        waiting: "Waiting",
        verification: "Validating",
        complete: "Accepted",
        blocked: "Blocked",
        paused: "Paused",
        failed: "Failed",
      })[a.status] || a.status,
      handledBy: model,
      progressSummary: (a.progress || []).slice(-1)[0]?.summary || null,
      healthLabel: tel ? (WORKER_HEALTH_COPY[tel.status] || tel.status) : null,
    };
  });

  const recovering = workers.filter((w) => ["unresponsive", "stalled", "recovering", "failed"].includes(w.status));
  const runningAsg = assignments.filter((a) => a.status === "running");
  const directorFocus = runningAsg.map((a) => {
    const tel = workers.find((w) => w.assignmentId === a.assignmentId);
    const who = tel?.workerId?.startsWith("claude") ? "Claude"
      : tel?.workerId?.startsWith("cursor") ? "Cursor"
        : "Worker";
    return `${who} on ${a.title}`;
  });
  if (!directorFocus.length) {
    const ready = assignments.find((a) => a.status === "ready");
    if (ready) directorFocus.push(`Next up: ${ready.title}`);
  }

  const risks = [];
  if (openDecisions.length) risks.push(`Decision required: ${openDecisions[0].title}`);
  for (const a of assignments.filter((x) => x.status === "blocked")) {
    risks.push(`Blocked: ${a.title}`);
  }
  for (const w of recovering) {
    risks.push(`${w.workerId?.startsWith("claude") ? "Claude" : w.workerId?.startsWith("cursor") ? "Cursor" : "Worker"} unhealthy on ${(getAssignment(missionId, w.assignmentId)?.title) || "assignment"}`);
  }

  const recoveries = recovering.map((w) => {
    const action = w.last_recovery?.action
      ? String(w.last_recovery.action).replace(/_/g, " ")
      : "preparing safe recovery";
    const title = getAssignment(missionId, w.assignmentId)?.title || "Worker";
    return `${title}: Director ${action}`;
  });

  const assessment = (() => {
    if (openDecisions.length) return "I need a product call from you before this work can continue.";
    if (recovering.length) return "I am intervening on an unhealthy worker and preserving uncommitted work.";
    if (runningAsg.length) return "Everything is progressing normally.";
    if (assignments.some((a) => a.status === "verification")) return "I am validating completed work.";
    if (card.status === "awaiting_kickoff_approval") return "Waiting for you to approve kickoff.";
    if (assignments.every((a) => a.status === "complete") && assignments.length) {
      return "Deliverables are complete — ready for your review.";
    }
    return summary.questions?.find((q) => q.id === "where")?.answer || card.directorState;
  })();

  const MILESTONE_TYPES = new Set([
    "mission_started", "phase_started", "phase_completed", "assignment_started",
    "assignment_completed", "decision_requested", "decision_answered",
    "evidence_added", "validation", "recovery", "progress",
  ]);
  const timelineAll = readTimelineSummary(missionId, { limit: 40 }).map(timelineEventVm);
  const recentProgress = [...timelineAll].reverse()
    .filter((e) => MILESTONE_TYPES.has(e.type))
    .slice(0, 8)
    .map((e) => ({
      headline: e.headline,
      explanation: e.explanation,
      timeLabel: e.timeLabel,
      actor: e.actor,
    }));

  const progress = row.progress || {};
  const phaseTitle = row.current_phase?.title || "No active phase yet";

  return {
    kind: "mission_dashboard",
    missionId,
    summary: {
      title: card.title,
      statusLabel: card.statusLabel,
      status: card.status,
      phase: phaseTitle,
      phaseLabel: card.phaseLabel,
      deliverablesAccepted: progress.accepted_deliverables ?? 0,
      deliverablesTotal: progress.total_deliverables ?? 0,
      deliverablesLabel: `${progress.accepted_deliverables ?? 0} / ${progress.total_deliverables ?? 0} accepted`,
      activeWorkers: activeWorkers.length,
      confidencePercent: confidence.percent,
      confidenceBand: confidence.bandLabel,
      nextCheckpoint: checkpoint.label,
      primaryAction: card.primaryAction,
    },
    director: {
      assessment,
      focus: directorFocus.length ? directorFocus : ["Monitoring mission state"],
      risks: risks.length ? risks : ["None"],
      recoveries: recoveries.length ? recoveries : ["None"],
      next: summary.questions?.find((q) => q.id === "next")?.answer || checkpoint.label,
      recommendation: openDecisions[0]
        ? `Recommend: ${openDecisions[0].recommendation}`
        : (summary.questions?.find((q) => q.id === "next")?.answer || "Continue as planned"),
    },
    needsMe,
    currentWork,
    recentProgress,
    timeline: timelineAll.slice(-12).reverse(),
    confidence: {
      percent: confidence.percent,
      bandLabel: confidence.bandLabel,
      change: confidence.change,
      changes: confidence.changes || [],
      factors: Object.entries(confidence.factors || {}).map(([id, f]) => ({
        id,
        label: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
        score: f.score,
        note: f.note,
        weight: Math.round((confidence.weights?.[id] || 0) * 100),
      })),
    },
    // Compatibility for older clients still reading overview shape
    header: {
      missionId,
      title: card.title,
      statusLabel: card.statusLabel,
      phaseLabel: card.phaseLabel,
      deliverablesLabel: card.deliverablesLabel,
      directorState: card.directorState,
      openDecisionCount: openDecisions.length,
      primaryAction: card.primaryAction,
    },
    directorSummary: summary,
    topDecision: openDecisions[0] || null,
    workInProgress: assignments.map(workItemVm),
    productComplete: false,
  };
}

/** @deprecated Use missionDashboardVm — kept as alias during cutover. */
export function missionOverviewVm(missionId) {
  const dash = missionDashboardVm(missionId);
  if (!dash) return null;
  return { ...dash, kind: "mission_overview" };
}

export function missionsHomeVm() {
  return {
    kind: "missions_home",
    missions: listMissionsV2().map(missionListCardVm),
  };
}

export function workersHomeVm() {
  const workers = listWorkerTelemetry().map(workerCardVm);
  const byMission = new Map();
  for (const w of workers) {
    const key = w.missionId || "_unassigned";
    if (!byMission.has(key)) byMission.set(key, { missionId: w.missionId, missionTitle: w.missionTitle, workers: [] });
    byMission.get(key).workers.push(w);
  }
  return {
    kind: "workers_home",
    groups: [...byMission.values()],
    workers,
  };
}

export function timelinePageVm(missionId) {
  const events = (readTimeline(missionId, { limit: 200 }) || readTimelineSummary(missionId, { limit: 100 }))
    .map(timelineEventVm)
    .reverse();
  return {
    kind: "timeline_page",
    missionId,
    title: getBrief(missionId)?.title || missionId,
    events,
    empty: events.length === 0,
  };
}

export function evidenceGalleryVm(missionId) {
  return {
    kind: "evidence_gallery",
    missionId,
    title: getBrief(missionId)?.title || missionId,
    artifacts: listEvidence(missionId).map((a) => evidenceCardVm(a)),
    coverage: acceptanceEvidenceCoverage(missionId).map((c) => ({
      id: c.id,
      statement: c.statement,
      statusLabel: c.status === "passed" ? "Covered" : "Outstanding",
    })),
    certification: canCertifyMission(missionId),
  };
}

export { STATUS_COPY, WORKER_HEALTH_COPY, relTime };
