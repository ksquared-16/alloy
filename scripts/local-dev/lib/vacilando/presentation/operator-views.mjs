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
} from "../worker-health.mjs";
import {
  buildDirectorSummary,
  listMissionsV2,
  projectMissionRow,
} from "../director-summary.mjs";
import {
  getKickoffState,
  reviewMissionReadiness,
  interpretMissionBrief,
} from "../mission-kickoff.mjs";
import {
  getMissionConfidence,
  estimateNextCheckpoint,
} from "../mission-confidence.mjs";
import { summarizeUsage, listUsageEvents } from "../usage-ledger.mjs";
import {
  getActiveSessionForAssignment,
  getExecutionSession,
  sessionLiveVm,
} from "../execution-session.mjs";


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
  mission_created: "Director reviewed your Mission Brief",
  mission_started: "You approved execution",
  phase_started: "Director assigned the first workstream",
  phase_completed: "A workstream finished",
  assignment_started: "A worker began the assignment",
  assignment_completed: "A deliverable was accepted",
  progress: "A worker reported progress",
  discovery: "Director surfaced a risk",
  blocker: "Work hit a blocker",
  decision_requested: "Director needs a decision from you",
  decision_answered: "You answered a decision",
  operator_message: "You messaged Director",
  director_response: "Director responded",
  improvement_captured: "You told Director something felt off",
  worker_health: "Worker health changed",
  recovery: "Director attempted recovery",
  evidence_added: "Evidence was attached",
  validation: "Validation ran",
  mission_completed: "Mission completed",
  context_invalidated: "Worker context was refreshed",
  commit: "A commit was recorded",
  resource_claim: "A resource was claimed",
  resource_release: "A resource was released",
};

/** Explicit worker startup / execution lifecycle — shared across dashboard surfaces. */
export function deriveWorkerLifecycle(assignment, telemetry = null) {
  if (!assignment) {
    return { state: "none", label: "No assignment", explanation: "No deliverable is active yet." };
  }
  const status = assignment.status;
  const hasWorker = Boolean(assignment.workerId || telemetry?.workerId);
  const hasAck = Boolean(assignment.contextAcknowledgement);
  const telStatus = telemetry?.status;
  const pl = assignment.dispatch?.providerLifecycle;
  const providerName = assignment.provider || assignment.dispatch?.currentProvider;
  const providerLabel = providerName
    ? String(providerName).charAt(0).toUpperCase() + String(providerName).slice(1)
    : "worker";

  // Director dispatch state is authoritative when present.
  if (pl === "queued") {
    return { state: "queued", label: "Queued", explanation: "Director queued this deliverable for launch." };
  }
  if (pl === "launching") {
    return { state: "starting", label: `Launching ${providerLabel}`, explanation: `Director is launching ${providerLabel}.` };
  }
  if (pl === "acknowledged") {
    return { state: "waiting_ack", label: "Waiting for acknowledgement", explanation: `${providerLabel} accepted the assignment.` };
  }
  if (pl === "running") {
    return { state: "active", label: "Executing", explanation: `${providerLabel} is executing this deliverable.` };
  }
  if (pl === "awaiting_decision") {
    return {
      state: "blocked",
      label: "Waiting for approval",
      explanation: `${providerLabel} paused — a product decision is required.`,
    };
  }
  if (pl === "producing_evidence") {
    return { state: "active", label: "Producing evidence", explanation: "Director is collecting evidence from the worker." };
  }
  if (pl === "completed" || status === "complete") {
    return { state: "complete", label: "Completed", explanation: "Deliverable accepted." };
  }
  if (pl === "retrying") {
    return { state: "retrying", label: "Retrying", explanation: `Director is retrying ${providerLabel}.` };
  }
  if (pl === "unavailable") {
    return { state: "waiting_capacity", label: "Unavailable", explanation: `${providerLabel} is unavailable — Director will try another provider.` };
  }
  if (pl === "failed" || status === "failed" || telStatus === "failed") {
    return { state: "launch_failed", label: "Failed", explanation: "Director could not complete this launch." };
  }

  if (status === "blocked") {
    return { state: "blocked", label: "Blocked", explanation: assignment.blocker?.message || "Work cannot continue until a blocker is cleared." };
  }
  if (status === "paused") {
    return { state: "blocked", label: "Blocked", explanation: "Paused pending a decision or recovery." };
  }
  if (status === "waiting") {
    return { state: "waiting_dependency", label: "Waiting on upstream work", explanation: "This deliverable starts after an earlier workstream finishes." };
  }
  if (status === "verification") {
    return { state: "active", label: "Producing evidence", explanation: "Work is under validation." };
  }
  if (status === "running" || telStatus === "healthy") {
    return { state: "active", label: "Executing", explanation: "Worker is executing this deliverable." };
  }
  if (status === "ready" && !hasWorker) {
    return { state: "queued", label: "Queued", explanation: "Director will launch a worker for this deliverable." };
  }
  if (status === "ready" && hasWorker && !hasAck) {
    return { state: "waiting_ack", label: "Waiting for acknowledgement", explanation: "Worker is assigned and must acknowledge the package before starting." };
  }
  if ((status === "ready" && hasAck) || telStatus === "starting") {
    return { state: "starting", label: `Launching ${providerLabel}`, explanation: "Worker acknowledged the package and is starting." };
  }
  return {
    state: "queued",
    label: "Queued",
    explanation: "Director is preparing execution for this deliverable.",
  };
}

function confidenceWhy(factors = []) {
  const why = [];
  for (const f of factors) {
    const score = Number(f.score) || 0;
    const note = String(f.note || "").toLowerCase();
    if (f.id === "implementation" && score < 40) why.push("Implementation has not begun.");
    else if (f.id === "implementation" && score < 70) why.push("Implementation is only partially complete.");
    if (f.id === "evidence" && (score < 40 || /0 of|no acceptance|not been/.test(note))) {
      why.push("Evidence has not been collected.");
    }
    if (f.id === "qa" && (score < 50 || /no validation|qa evidence/.test(note))) {
      why.push("QA has not started.");
    }
    if (f.id === "dependencies" && score >= 70) why.push("Dependencies are clear.");
    else if (f.id === "dependencies" && score < 50) why.push("Dependencies still create risk.");
    if (f.id === "worker_health" && score < 50) why.push("Worker health needs attention.");
    if (f.id === "architecture" && score >= 70) why.push("The Mission Brief structure looks solid.");
  }
  if (!why.length) why.push("Director is still forming a confidence picture.");
  return [...new Set(why)].slice(0, 5);
}

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

/** Timeline event for operators — story first; technical detail expandable. */
export function timelineEventVm(ev) {
  const type = ev.type || "event";
  let headline = ev.headline || TIMELINE_HEADLINES[type] || null;
  const summary = ev.summary || "";
  // Rewrite legacy technical summaries into operator language.
  if (!ev.headline) {
    if (type === "mission_created" || /Mission Brief v\d+ ingested/i.test(summary)) {
      headline = "Director reviewed your Mission Brief";
    } else if (type === "mission_started" || /Kickoff approved/i.test(summary)) {
      headline = "You approved execution";
    } else if (type === "phase_started" || /^Phase started/i.test(summary)) {
      const m = summary.match(/Phase started — (.+)/i);
      headline = m ? `Director assigned the first workstream` : TIMELINE_HEADLINES.phase_started;
    } else if (!headline) {
      headline = TIMELINE_HEADLINES[type] || summary || type.replace(/_/g, " ");
    }
  }
  const actorMap = { operator: "You", director: "Director", system: "Vacilando" };
  const actor = actorMap[ev.actor] || (ev.actor?.startsWith("claude") || ev.actor?.startsWith("cursor")
    ? `Worker (${ev.actor})`
    : ev.actor || "System");
  const technical = ev.detail?.technical || null;
  const explanation = (summary && summary !== headline)
    ? summary
    : (ev.detail?.message || ev.detail?.question || "");
  return {
    kind: "timeline_event",
    eventId: ev.event_id || ev.eventId,
    type,
    time: ev.at || ev.occurred_at,
    timeLabel: relTime(ev.at || ev.occurred_at),
    headline,
    explanation,
    actor,
    evidenceIds: ev.evidence_ids || ev.evidenceIds || [],
    decisionId: ev.decision_id || ev.decisionId || null,
    assignmentId: ev.assignment_id || ev.assignmentId || null,
    expandable: Boolean(technical || (ev.detail && Object.keys(ev.detail).length)),
    technical,
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
  const provider = providerLabel(tel.workerId, tel.provider);
  const usage = tel.missionId
    ? summarizeUsage({ missionId: tel.missionId })
    : null;
  const workerUsage = usage?.by_worker?.find((b) => b.workerId === workerId) || null;
  return {
    kind: "worker_detail",
    ...card,
    provider: provider || "Unknown",
    model: provider || card.modelLabel || "Unknown",
    runtimeDuration: sessionDurationLabel(tel) || (workerUsage?.runtime_ms
      ? `${Math.round(workerUsage.runtime_ms / 60000)}m recorded`
      : "Unavailable"),
    currentSession: tel.activeCommand || tel.activeTool || "No active command reported",
    assignmentTitle: asg?.title || "No assignment",
    objective: asg?.objective || "No assignment objective",
    currentActivity: tel.activeCommand || tel.activeTool || card.lastProgressSummary,
    requiredOutputs: (asg?.expectedDeliverables || asg?.scope || []).map((o) => (
      typeof o === "string" ? { label: o, done: asg?.status === "complete" } : o
    )),
    evidence,
    nextStep: asg ? workItemVm(asg).nextStep : "Await assignment",
    recovery: tel.last_recovery || null,
    directorManagedRecovery: ["unresponsive", "stalled", "recovering"].includes(tel.status)
      && !recoveryNeedsOperator(tel),
    technical: {
      ...card.technical,
      tokens: "See mission usage when reported by provider",
    },
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

function providerLabel(workerId, provider = null) {
  if (provider === "claude" || workerId?.startsWith("claude")) return "Claude";
  if (provider === "cursor" || workerId?.startsWith("cursor")) return "Cursor";
  return null;
}

function sessionDurationLabel(tel) {
  const start = tel?.sessionStartedAt || tel?.lastProgressAt || tel?.lastHeartbeatAt;
  if (!start) return null;
  const ms = Date.now() - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const mins = Math.round(ms / 60000);
  if (mins < 1) return "just started";
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** True only when operator must act on recovery — not when Director is handling it. */
export function recoveryNeedsOperator(tel) {
  if (!tel) return false;
  if (tel.operatorActionRequired || tel.last_recovery?.requiresOperatorApproval) return true;
  if (tel.status === "failed" && tel.last_recovery?.refused) return true;
  return false;
}

export function listNeedsYou() {
  const items = [];
  // 1) Open product / architecture decisions
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
  // 2) Failed recovery requiring operator action only
  for (const w of listWorkerTelemetry()) {
    if (!recoveryNeedsOperator(w)) continue;
    const card = workerCardVm(w);
    items.push(needsYouItemVm({
      type: "recovery_approval",
      missionId: w.missionId,
      title: `${card.deliverable} — recovery needs your approval`,
      body: "Director refused an unsafe recovery and needs you to authorize next steps.",
      urgency: "Recovery approval",
      recommendation: "Review the worker and approve a safe path — or give explicit discard authority.",
      action: { label: "Open worker", href: `workers/${w.workerId}` },
    }));
  }
  // 3) Kickoff / completion / merge / deployment approvals
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
    // Merge / deployment — reserved when mission flags them (future completion package)
    if (row.merge_approval_required) {
      items.push(needsYouItemVm({
        type: "merge",
        missionId: row.mission_id,
        title: "Merge approval needed",
        body: "Director is ready to merge and needs your authorization.",
        urgency: "Merge approval",
        recommendation: "Review the completion package, then approve merge",
        action: { label: "Open mission", href: `missions/${row.mission_id}` },
      }));
    }
    if (row.deployment_approval_required) {
      items.push(needsYouItemVm({
        type: "deployment",
        missionId: row.mission_id,
        title: "Deployment approval needed",
        body: "Director is ready to deploy and needs your authorization.",
        urgency: "Deployment approval",
        recommendation: "Review evidence, then approve deployment",
        action: { label: "Open mission", href: `missions/${row.mission_id}` },
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
  const interpretation = interpretMissionBrief(brief, readiness);
  const findings = (interpretation.findings || readiness.findings || []).map((f) => ({
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
    title: interpretation.title || brief.title,
    objective: interpretation.objective,
    expectedOutcomes: interpretation.expectedOutcomes,
    deliverables: interpretation.deliverables,
    recommendedWorkerDisciplines: interpretation.recommendedWorkerDisciplines,
    directorAssessment: interpretation.directorAssessment,
    phases: (brief.plan || []).map((p) => ({
      id: p.phaseId,
      title: p.title,
      objective: p.objective,
      outputs: p.requiredOutputs || [],
    })),
    acceptanceCriteria: brief.acceptanceCriteria || [],
    constraints: interpretation.constraints,
    sources: (brief.sourceMaterials || []).map((s) => s.ref || s.title || s.id),
    findings,
    assignmentCount: assignments.length || (brief.plan || []).length,
    kickoffStatus: state?.kickoff_status || null,
    canStart: readiness.ready !== false && (state?.kickoff_status === "awaiting_kickoff_approval" || !state?.kickoff_status),
    primaryAction: {
      label: "Start mission",
      disabled: readiness.ready === false,
    },
    rawBrief: brief,
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
    const tel = workers.find((w) => w.assignmentId === a.assignmentId)
      || workers.find((w) => w.workerId && w.workerId === a.workerId);
    const handledBy = providerLabel(tel?.workerId || a.workerId, a.provider || tel?.provider);
    const lifecycle = deriveWorkerLifecycle(a, tel);
    const statusLabel = lifecycle.label;
    const sessionId = a.dispatch?.sessionId || null;
    const session = (sessionId && getExecutionSession(sessionId))
      || getActiveSessionForAssignment(missionId, a.assignmentId);
    const live = sessionLiveVm(session);
    let handledByLabel;
    if (handledBy && ["active", "starting", "waiting_ack", "retrying"].includes(lifecycle.state)) {
      handledByLabel = `Handled by ${handledBy}`;
    } else if (lifecycle.state === "assigning" || lifecycle.state === "waiting_capacity") {
      handledByLabel = lifecycle.label;
    } else if (lifecycle.state === "waiting_dependency") {
      handledByLabel = "Waiting on upstream work";
    } else if (handledBy) {
      handledByLabel = `Handled by ${handledBy}`;
    } else {
      handledByLabel = lifecycle.explanation;
    }
    const progressSummary = live?.activity
      ? [
          live.activity,
          live.filesInspected ? `${live.filesInspected} files inspected` : null,
          live.percent ? `${live.percent}% complete` : null,
        ].filter(Boolean).join(" · ")
      : ((a.progress || []).slice(-1)[0]?.summary || lifecycle.explanation);
    return {
      kind: "current_work",
      title: a.title,
      objective: a.objective,
      status: a.status,
      statusLabel,
      lifecycleState: lifecycle.state,
      lifecycleLabel: lifecycle.label,
      lifecycleExplanation: lifecycle.explanation,
      handledBy,
      handledByLabel,
      progressSummary,
      healthLabel: tel ? (WORKER_HEALTH_COPY[tel.status] || tel.status) : lifecycle.label,
      liveActivity: live,
    };
  });

  const lifecycleActive = currentWork.filter((w) => ["active", "starting", "waiting_ack", "retrying"].includes(w.lifecycleState));
  const lifecyclePending = currentWork.filter((w) => ["assigning", "waiting_capacity"].includes(w.lifecycleState));

  const providerRollup = { Claude: { active: 0, waiting: 0 }, Cursor: { active: 0, waiting: 0 } };
  for (const w of currentWork) {
    if (!w.handledBy || !providerRollup[w.handledBy]) continue;
    if (["running", "verification"].includes(w.status)) providerRollup[w.handledBy].active += 1;
    else if (["waiting", "ready", "paused"].includes(w.status)) providerRollup[w.handledBy].waiting += 1;
  }
  if (!Object.values(providerRollup).some((v) => v.active || v.waiting)) {
    for (const tel of workers) {
      const p = providerLabel(tel.workerId);
      if (!p) continue;
      if (["healthy", "starting", "recovering", "unresponsive", "stalled"].includes(tel.status)) {
        providerRollup[p].active += 1;
      } else if (["waiting", "idle", "blocked"].includes(tel.status)) {
        providerRollup[p].waiting += 1;
      }
    }
  }
  const providers = Object.entries(providerRollup)
    .filter(([, v]) => v.active || v.waiting)
    .map(([name, v]) => {
      const bits = [];
      if (v.active) bits.push(`${v.active} active`);
      if (v.waiting) bits.push(`${v.waiting} waiting`);
      return { provider: name, active: v.active, waiting: v.waiting, label: `${name}: ${bits.join(", ")}` };
    });

  const recovering = workers.filter((w) => ["unresponsive", "stalled", "recovering", "failed"].includes(w.status));
  const directorManagedRecoveries = recovering.filter((w) => !recoveryNeedsOperator(w));
  const operatorRecoveries = recovering.filter((w) => recoveryNeedsOperator(w));
  const runningAsg = assignments.filter((a) => a.status === "running");
  const directorFocus = runningAsg.map((a) => {
    const tel = workers.find((w) => w.assignmentId === a.assignmentId);
    const who = providerLabel(tel?.workerId || a.workerId, a.provider) || "Worker";
    return `${who} on ${a.title}`;
  });
  if (!directorFocus.length) {
    const ready = assignments.find((a) => a.status === "ready" || a.status === "paused");
    if (ready) {
      const who = providerLabel(ready.workerId, ready.provider);
      directorFocus.push(who ? `Next up: ${ready.title} (${who})` : `Next up: ${ready.title}`);
    }
  }

  const risks = [];
  if (openDecisions.length) risks.push(`Decision required: ${openDecisions[0].title}`);
  for (const a of assignments.filter((x) => x.status === "blocked")) {
    risks.push(`Blocked: ${a.title}`);
  }
  for (const w of recovering) {
    const who = providerLabel(w.workerId) || "Worker";
    risks.push(`${who} unhealthy on ${(getAssignment(missionId, w.assignmentId)?.title) || "assignment"}`);
  }

  const recoveries = [
    ...directorManagedRecoveries.map((w) => {
      const action = w.last_recovery?.action
        ? String(w.last_recovery.action).replace(/_/g, " ")
        : "preparing safe recovery";
      const title = getAssignment(missionId, w.assignmentId)?.title || "Worker";
      return `${title}: Director handling (${action}) — no action needed from you`;
    }),
    ...operatorRecoveries.map((w) => {
      const title = getAssignment(missionId, w.assignmentId)?.title || "Worker";
      return `${title}: Recovery needs your approval`;
    }),
  ];

  const assessment = (() => {
    if (openDecisions.length) return "I need a product call from you before this work can continue.";
    if (operatorRecoveries.length) return "I need your approval before a recovery can proceed.";
    if (directorManagedRecoveries.length) return "I am intervening on an unhealthy worker and preserving uncommitted work.";
    if (lifecyclePending.length && !lifecycleActive.length) {
      return `I am ${lifecyclePending[0].lifecycleLabel.toLowerCase()} for ${lifecyclePending[0].title}.`;
    }
    if (currentWork.some((w) => w.lifecycleState === "waiting_ack")) {
      return "A worker is assigned and waiting to acknowledge the package before work begins.";
    }
    if (currentWork.some((w) => w.lifecycleState === "starting")) {
      return "A worker is starting — you should see progress shortly.";
    }
    if (runningAsg.length || lifecycleActive.length) return "Everything is progressing normally.";
    if (assignments.some((a) => a.status === "verification")) return "I am validating completed work.";
    if (card.status === "awaiting_kickoff_approval") return "Waiting for you to approve kickoff.";
    if (assignments.every((a) => a.status === "complete") && assignments.length) {
      return "Deliverables are complete — ready for your review.";
    }
    return summary.questions?.find((q) => q.id === "where")?.answer || card.directorState;
  })();

  const usageSummary = summarizeUsage({ missionId });
  const usageEvents = listUsageEvents({ missionId, limit: 50 });
  const usageByProvider = ["Claude", "Cursor"].map((name) => {
    const key = name.toLowerCase();
    const relatedWorkers = workers.filter((w) => providerLabel(w.workerId) === name);
    const events = usageEvents.filter((e) => providerLabel(e.workerId, e.model) === name || e.model === key);
    const runtimeMs = events.reduce((a, e) => a + (e.runtime_ms || 0), 0);
    const tokens = events.reduce((a, e) => a + (e.tokens?.total || 0), 0);
    const costParts = events.map((e) => e.estimated_cost_usd).filter((c) => c != null);
    const active = relatedWorkers.filter((w) => !["stopped", "complete", "failed"].includes(w.status)).length;
    return {
      provider: name,
      activeWorkers: active,
      sessionDuration: runtimeMs
        ? `${Math.max(1, Math.round(runtimeMs / 60000))}m recorded`
        : (relatedWorkers[0] ? (sessionDurationLabel(relatedWorkers[0]) || "Unavailable") : "Unavailable"),
      tokens: tokens > 0 ? tokens : "Unavailable",
      estimatedCost: costParts.length
        ? `$${costParts.reduce((a, c) => a + c, 0).toFixed(4)}`
        : "Unavailable",
    };
  }).filter((r) => r.activeWorkers > 0 || r.tokens !== "Unavailable" || r.estimatedCost !== "Unavailable"
    || usageEvents.some((e) => providerLabel(e.workerId, e.model) === r.provider));

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
  const confFactors = Object.entries(confidence.factors || {}).map(([id, f]) => ({
    id,
    label: id.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    score: f.score,
    note: f.note,
    weight: Math.round((confidence.weights?.[id] || 0) * 100),
  }));
  const workerCountLabel = lifecycleActive.length
    ? `${lifecycleActive.length} active`
    : lifecyclePending.length
      ? lifecyclePending[0].lifecycleLabel
      : currentWork.some((w) => w.lifecycleState === "waiting_dependency")
        ? "Waiting on upstream work"
        : `${activeWorkers.length} active`;

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
      activeWorkers: lifecycleActive.length,
      workerCountLabel,
      executionLifecycle: lifecyclePending[0]?.lifecycleLabel
        || lifecycleActive[0]?.lifecycleLabel
        || (currentWork[0]?.lifecycleLabel || "No workers yet"),
      confidencePercent: confidence.percent,
      confidenceBand: confidence.bandLabel,
      nextCheckpoint: checkpoint.label,
      primaryAction: card.primaryAction,
    },
    director: {
      assessment,
      focus: directorFocus.length
        ? directorFocus
        : (lifecyclePending.length
          ? [`${lifecyclePending[0].lifecycleLabel}: ${lifecyclePending[0].title}`]
          : ["Monitoring mission state"]),
      risks: risks.length ? risks : ["None"],
      recoveries: recoveries.length ? recoveries : ["None"],
      next: summary.questions?.find((q) => q.id === "next")?.answer || checkpoint.label,
      recommendation: openDecisions[0]
        ? `Recommend: ${openDecisions[0].recommendation}`
        : (summary.questions?.find((q) => q.id === "next")?.answer || "Continue as planned"),
    },
    needsMe,
    providers,
    resourcesUsage: {
      byProvider: usageByProvider.length ? usageByProvider : [
        { provider: "Claude", activeWorkers: 0, sessionDuration: "Unavailable", tokens: "Unavailable", estimatedCost: "Unavailable" },
        { provider: "Cursor", activeWorkers: 0, sessionDuration: "Unavailable", tokens: "Unavailable", estimatedCost: "Unavailable" },
      ],
      note: "Tokens and cost show Unavailable unless the provider reported them — never estimated blindly.",
      events: usageSummary.events || 0,
    },
    currentWork,
    recentProgress,
    timeline: timelineAll.slice(-12).reverse(),
    confidence: {
      percent: confidence.percent,
      bandLabel: confidence.bandLabel,
      change: confidence.change,
      changes: confidence.changes || [],
      why: confidenceWhy(confFactors),
      factors: confFactors,
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
