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
import { deriveMissionPosture } from "../mission-posture.mjs";
import { missionLocalServerVm } from "../mission-local-server.mjs";
import {
  getKickoffState,
  reviewMissionReadiness,
  interpretMissionBrief,
} from "../mission-kickoff.mjs";
import { getCompiledMission } from "../compiled-mission.mjs";
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
import {
  buildDirectorDecisionSummary,
  decisionTimelineCopy,
  resolveRecommendedOption,
} from "./decision-summary.mjs";
import {
  ensureDeliverableReviewsForMission,
  deliverableReviewVm,
  getOpenDeliverableReview,
  getLatestAcceptedDeliverableReview,
} from "../deliverable-review.mjs";
import { composeExecutiveL1 } from "./executive-overview.mjs";


const STATUS_COPY = {
  decision_required: "Decision required",
  awaiting_kickoff_approval: "Waiting for kickoff",
  awaiting_completion_approval: "Ready for your review",
  waiting_for_operator: "Waiting on you",
  completed: "Completed",
  blocked: "Blocked",
  paused: "Paused",
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
  assignment_completed: "Claude completed an assignment",
  deliverable_verified: "Director verified the deliverable",
  deliverable_accepted: "You certified a deliverable",
  deliverable_changes_requested: "You requested changes on a deliverable",
  deliverable_evidence_discrepancy: "Director cannot yet certify this work",
  deliverable_evidence_repair: "Director returned this assignment for evidence repair",
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
  mission_compiled: "Mission compiled",
  compilation_reuse: "Accepted artifacts reused",
  compilation_conflict: "Compilation conflict detected",
  compilation_ready: "Mission ready for approval",
  compilation_blocked: "Mission cannot be compiled",
  compilation_decision: "Compilation decision required",
  director_execution_started: "Director launched execution",
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

  // Stale dispatch lifecycle from a prior run must not override a reopened assignment.
  const dispatchLive = !["ready", "paused", "waiting", "blocked"].includes(status);
  const telSilent = ["unresponsive", "stalled", "failed", "stopped"].includes(telStatus);

  // Dead/silent workers beat stale "running" dispatch labels.
  if ((status === "running" || status === "verification" || (dispatchLive && pl === "running")) && telSilent) {
    return {
      state: "stalled",
      label: "Worker silent",
      explanation: "This assignment is marked in progress, but the worker is not reporting. Nothing is live.",
    };
  }
  if ((status === "running" || status === "verification") && !telStatus && !hasWorker) {
    return {
      state: "stalled",
      label: "Worker silent",
      explanation: "Marked in progress with no live worker attached.",
    };
  }

  // Director dispatch state is authoritative when present AND assignment is still in flight.
  if (dispatchLive && pl === "queued") {
    return { state: "queued", label: "Queued", explanation: "Director queued this deliverable for launch." };
  }
  if (dispatchLive && pl === "launching") {
    return { state: "starting", label: `Launching ${providerLabel}`, explanation: `Director is launching ${providerLabel}.` };
  }
  if (dispatchLive && pl === "acknowledged") {
    return { state: "waiting_ack", label: "Waiting for acknowledgement", explanation: `${providerLabel} accepted the assignment.` };
  }
  if (dispatchLive && pl === "running") {
    return { state: "active", label: "Executing", explanation: `${providerLabel} is executing this deliverable.` };
  }
  if (dispatchLive && pl === "awaiting_decision") {
    return {
      state: "blocked",
      label: "Waiting for approval",
      explanation: `${providerLabel} paused — a product decision is required.`,
    };
  }
  if (dispatchLive && pl === "producing_evidence") {
    return { state: "active", label: "Producing evidence", explanation: "Director is collecting evidence from the worker." };
  }
  if (status === "complete" || (dispatchLive && pl === "completed")) {
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
  if (telStatus === "healthy" || telStatus === "starting" || telStatus === "recovering") {
    return { state: "active", label: "Executing", explanation: "Worker is executing this deliverable." };
  }
  if (status === "running") {
    return {
      state: "stalled",
      label: "Worker silent",
      explanation: "Marked in progress without a healthy worker heartbeat.",
    };
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

/**
 * Operator outcome surface — Director Deliverable Review when present.
 * Never dumps raw worker prose as the primary review.
 */
export function missionOutcomeVm(missionId) {
  const posture = deriveMissionPosture(missionId);
  ensureDeliverableReviewsForMission(missionId);
  const open = getOpenDeliverableReview(missionId);
  const accepted = getLatestAcceptedDeliverableReview(missionId);
  const reviewVm = deliverableReviewVm(missionId);

  // Anything still open for the operator (approve / repair / cannot verify) wins
  // over a prior "you certified" confirmation — otherwise the page contradicts itself.
  if (reviewVm) {
    return {
      ...reviewVm,
      postureId: posture.id,
      choices: reviewVm.certificationState === "accepted" ? (posture.choices || []) : [],
      missionChoices: !open ? (posture.choices || []) : [],
    };
  }

  // Only when nothing is open: celebrate the latest certification.
  if (accepted) {
    const wave = accepted.wave_label
      || (String(accepted.deliverable_title || "").match(/\b(W-\d+)\b/i)?.[1])
      || "deliverable";
    return {
      kind: "deliverable_certified",
      missionId,
      postureId: posture.id,
      waveLabel: wave,
      headline: `You certified ${wave}`,
      summary: "Director recorded your approval and will continue the mission. You do not need to re-review this deliverable.",
      assignmentTitle: accepted.deliverable_title,
      choices: posture.choices || [],
      missionChoices: posture.choices || [],
      actions: {
        primary: posture.primaryAction,
        secondary: posture.secondaryAction,
        certify: posture.certifyAction || null,
      },
    };
  }
  if (!["operator_review", "awaiting_completion", "completed", "deliverable_review"].includes(posture.id)) {
    return null;
  }
  // Fallback only when no review object exists yet (legacy missions).
  return {
    kind: "mission_outcome_legacy",
    missionId,
    postureId: posture.id,
    headline: "Director is preparing the Deliverable Review",
    summary: "Worker completion was recorded. Director verification is required before you approve.",
    assignmentTitle: null,
    choices: posture.choices || [],
    actions: {
      primary: posture.primaryAction,
      secondary: posture.secondaryAction,
      certify: posture.certifyAction || null,
    },
  };
}

/** Mission list card view model */
export function missionListCardVm(row) {
  const r = typeof row === "string" ? projectMissionRow(row) : row;
  const missionId = r.mission_id || r.missionId;
  const posture = deriveMissionPosture(missionId);
  const progress = r.progress || {};
  const phase = r.current_phase;

  const deliverablesLabel = posture.id === "deliverable_review"
    ? posture.label
    : posture.id === "operator_review" || posture.id === "awaiting_completion"
      ? "Director is preparing certification"
      : posture.busy
        ? `${progress.accepted_deliverables ?? 0} of ${progress.total_deliverables ?? 0} deliverables accepted`
        : `${progress.accepted_deliverables ?? 0} of ${progress.total_deliverables ?? 0} assignments closed`;

  return {
    kind: "mission_list_card",
    missionId,
    title: r.title,
    status: posture.status,
    statusLabel: posture.label,
    postureId: posture.id,
    postureDetail: posture.detail,
    phaseLabel: phase
      ? `Phase ${phase.index} of ${phase.total} · ${phase.title}`
      : (posture.busy ? "Active phase" : "No worker running"),
    deliverablesLabel,
    directorState: posture.next,
    workersLine: posture.workersLine,
    openDecisionCount: listDecisions(missionId, { status: "open" }).length,
    latestUpdate: r.latest_update || posture.detail,
    updatedAt: r.updated_at,
    updatedLabel: relTime(r.updated_at),
    primaryAction: posture.primaryAction,
    secondaryAction: posture.secondaryAction,
    needsYou: posture.needsYou,
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
  let explanation = (summary && summary !== headline)
    ? summary
    : (ev.detail?.message || ev.detail?.question || "");

  // Decision events → executive briefing language (never "Decision created/resolved").
  if (type === "decision_requested" || type === "decision_answered") {
    const decisionId = ev.decision_id || ev.decisionId || ev.detail?.decisionId || null;
    const missionId = ev.mission_id || ev.missionId || null;
    const decision = decisionId
      ? (getDecision(missionId, decisionId) || listDecisions(null).find((d) => d.decisionId === decisionId))
      : null;
    const copy = decisionTimelineCopy(decision, {
      answered: type === "decision_answered",
      chosenOptionId: ev.detail?.chosenOptionId || decision?.chosen_option_id || null,
    });
    headline = copy.headline;
    explanation = copy.explanation;
  } else if (!ev.headline) {
    // Rewrite legacy technical summaries into operator language.
    if (type === "mission_created" || /Mission Brief v\d+ ingested/i.test(summary)) {
      headline = "Director reviewed your Mission Brief";
    } else if (type === "mission_started" || /Kickoff approved/i.test(summary)) {
      headline = "You approved execution";
    } else if (type === "phase_started" || /^Phase started/i.test(summary)) {
      headline = TIMELINE_HEADLINES.phase_started;
    } else if (!headline) {
      headline = TIMELINE_HEADLINES[type] || summary || type.replace(/_/g, " ");
    }
  }

  // Strip worker-escalation noise from decision-adjacent headlines.
  if (/^Claude requires|^Raised by|^Execution session|^Worker\b/i.test(headline || "")) {
    headline = TIMELINE_HEADLINES[type] || "Director needs a decision from you";
  }

  // Prefer wave labels over generic “worker completed assignment” language.
  if (type === "assignment_completed") {
    const wave = String(ev.detail?.title || ev.detail?.assignmentTitle || summary || "")
      .match(/\b(W-\d+)\b/i)?.[1];
    if (wave) headline = `Claude completed ${wave}`;
    else if (/Worker completed|assignment completed/i.test(headline || "")) {
      headline = "Claude completed an assignment";
    }
  }
  if (type === "deliverable_verified" && /recommend/i.test(summary || "")) {
    if (!/Director verified|Director recommends|Director cannot/i.test(headline || "")) {
      headline = "Director recommends certification";
    }
  }
  if (type === "deliverable_accepted" && /^You accepted\b/i.test(headline || "")) {
    headline = headline.replace(/^You accepted\b/i, "You certified");
  }

  const actorMap = { operator: "You", director: "Director", system: "Vacilando" };
  const actor = actorMap[ev.actor] || (ev.actor?.startsWith("claude") || ev.actor?.startsWith("cursor")
    ? `Worker (${ev.actor})`
    : ev.actor || "System");
  const technical = ev.detail?.technical || null;
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

/** Decision card / detail — executive briefing over worker reasoning. */
export function decisionCardVm(decision, { missionTitle = null } = {}) {
  const brief = getBrief(decision.missionId);
  const affected = (decision.affectedAssignments || [])
    .map((id) => getAssignment(decision.missionId, id))
    .filter(Boolean);
  const briefing = buildDirectorDecisionSummary(decision);
  const recommended = resolveRecommendedOption(decision);
  const recId = briefing.recommendation_id || recommended?.optionId || decision.recommendation;
  const recLabel = briefing.recommendation_label || optionLabel(decision, recId);

  return {
    kind: "decision_card",
    decisionId: decision.decisionId,
    missionId: decision.missionId,
    missionTitle: missionTitle || brief?.title || decision.missionId,
    urgency: "Needs your decision",
    title: briefing.stop_reason,
    question: briefing.stop_reason,
    situation: briefing.situation_summary,
    whyItMatters: briefing.why_stopped?.lead || decision.whyThisMatters,
    currentPlan: decision.currentPlan,
    discovery: decision.discovery,
    recommendation: briefing.recommendation_summary,
    recommendationId: recId,
    recommendationReason: (briefing.recommendation_why || []).join("; "),
    impactLines: briefing.impact_summary,
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
    afterAnswer: briefing.approval_result,
    briefing,
  };
}

export function decisionDetailVm(missionId, decisionId) {
  const d = getDecision(missionId, decisionId) || listDecisions(null, { status: null }).find((x) => x.decisionId === decisionId);
  if (!d) return null;
  const card = decisionCardVm(d);
  const b = card.briefing;
  return {
    ...card,
    kind: "decision_detail",
    sections: {
      stopReason: b.stop_reason,
      whatHappened: b.situation_summary,
      whyStopped: b.why_stopped,
      recommendation: b.recommendation_summary,
      recommendationWhy: b.recommendation_why,
      recommendedCard: b.recommended_card,
      alternatives: b.alternative_cards,
      impact: b.impact_summary,
      afterApprove: b.approval_steps,
      afterReject: b.rejection_steps,
      approvalResult: b.approval_result,
      rejectionResult: b.rejection_result,
      pausedWork: card.pausedWork,
    },
    technicalDetails: b.technical,
    actions: [
      {
        id: "approve",
        label: "Recommended — continue",
        optionId: b.recommendation_id,
        primary: true,
      },
      ...((b.alternative_cards || []).map((o) => ({
        id: "alternative",
        label: o.title,
        optionId: o.id,
        primary: false,
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
export function needsYouItemVm({ type, missionId, title, body, urgency, action, recommendation, secondaryAction = null }) {
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
    secondaryAction,
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
  const isArchivedMission = (missionId) =>
    Boolean(missionId && getMission(missionId)?.archived === true);
  // 1) Open product / architecture decisions
  for (const d of listDecisions(null, { status: "open" })) {
    if (isArchivedMission(d.missionId)) continue;
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
    if (isArchivedMission(w.missionId)) continue;
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
  // 3) Mission postures that require the operator (kickoff / start / review / certify)
  for (const row of listMissionsV2({ includeArchived: false })) {
    const missionId = row.mission_id || row.missionId;
    if (isArchivedMission(missionId)) continue;
    const posture = deriveMissionPosture(missionId);
    if (!posture.needsYou) continue;
    // Decisions already covered above
    if (posture.id === "decision_required") continue;

    if (posture.id === "deliverable_review") {
      items.push(needsYouItemVm({
        type: "deliverable_review",
        missionId,
        title: posture.label,
        body: posture.detail,
        urgency: "Director certification",
        recommendation: posture.next,
        action: posture.primaryAction,
      }));
      continue;
    }
    if (posture.id === "awaiting_kickoff") {
      items.push(needsYouItemVm({
        type: "kickoff",
        missionId,
        title: "Kickoff approval needed",
        body: posture.detail,
        urgency: "Kickoff",
        recommendation: posture.next,
        action: posture.primaryAction,
      }));
      continue;
    }
    if (posture.id === "ready_to_start" && posture.needsYou) {
      items.push(needsYouItemVm({
        type: "start_work",
        missionId,
        title: "Start work",
        body: posture.detail,
        urgency: "Start",
        recommendation: posture.next,
        action: posture.primaryAction,
      }));
      continue;
    }
    if (posture.id === "ready_to_start") continue;
    if (posture.id === "awaiting_completion") {
      items.push(needsYouItemVm({
        type: "completion",
        missionId,
        title: "Completion approval needed",
        body: posture.detail,
        urgency: "Approval",
        recommendation: posture.next,
        action: posture.primaryAction,
        secondaryAction: posture.secondaryAction,
      }));
      continue;
    }
    if (posture.id === "operator_review" || posture.id === "paused" || posture.id === "idle_after_kickoff" || posture.id === "blocked" || posture.id === "interrupted_idle") {
      items.push(needsYouItemVm({
        type: "operator_review",
        missionId,
        title: posture.label,
        body: posture.detail,
        urgency: "Needs you",
        recommendation: posture.next,
        action: posture.primaryAction,
        secondaryAction: posture.secondaryAction,
      }));
    }
    // worker_silent only escalates after Director auto-resume is exhausted
    if (posture.id === "worker_silent" && posture.needsYou) {
      items.push(needsYouItemVm({
        type: "worker_silent",
        missionId,
        title: posture.label,
        body: posture.detail,
        urgency: "Worker silent",
        recommendation: posture.next,
        action: posture.primaryAction,
        secondaryAction: posture.secondaryAction,
      }));
    }
    if (posture.id === "worker_thrashing" && posture.needsYou) {
      items.push(needsYouItemVm({
        type: "worker_thrashing",
        missionId,
        title: posture.label,
        body: posture.detail,
        urgency: "Worker stuck",
        recommendation: posture.next,
        action: posture.primaryAction,
        secondaryAction: posture.secondaryAction,
      }));
    }
  }
  // Merge / deployment flags (rare)
  for (const row of listMissionsV2({ includeArchived: false })) {
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
  const compiled = state?.compiled || getCompiledMission(brief.missionId || missionId);
  const readiness = state?.readiness || reviewMissionReadiness(brief);
  const interpretation = interpretMissionBrief(brief, readiness);
  const findings = [
    ...(compiled?.compilationErrors || []).map((e) => ({
      severity: "blocking",
      message: e.message,
      kind: "compilation",
      code: e.code,
    })),
    ...(compiled?.compilationWarnings || []).map((w) => ({
      severity: w.severity === "conflict" ? "blocking" : "info",
      message: w.message + (w.recommendation ? ` Recommendation: ${w.recommendation}` : ""),
      kind: "compilation_warning",
      code: w.code,
    })),
    ...(interpretation.findings || readiness.findings || []).map((f) => ({
      severity: f.blocking ? "blocking" : "info",
      message: f.message || f.code || JSON.stringify(f),
      kind: f.kind || (f.blocking ? "gap" : "note"),
    })),
  ];
  const assignments = listAssignments(missionId);
  const reused = compiled?.referencedAcceptedArtifacts || [];
  const toExecute = (compiled?.deliverables || []).filter((d) => d.status === "to_execute");
  const canStart = Boolean(
    compiled?.readyToExecute
    && readiness.ready !== false
    && (state?.kickoff_status === "awaiting_kickoff_approval" || !state?.kickoff_status || !assignments.length),
  );
  return {
    kind: "kickoff",
    mode: !compiled?.readyToExecute
      ? "compilation_blocked"
      : readiness.ready === false && findings.some((f) => f.severity === "blocking")
        ? "readiness_blocked"
        : (state?.kickoff_status === "awaiting_kickoff_approval" || !assignments.length)
          ? "approval"
          : "executing",
    missionId,
    title: compiled?.title || interpretation.title || brief.title,
    objective: compiled?.objective || interpretation.objective,
    expectedOutcomes: (compiled?.acceptanceCriteria || []).map((c) => c.statement).filter(Boolean)
      || interpretation.expectedOutcomes,
    deliverables: (compiled?.deliverables || []).map((d) => ({
      id: d.id,
      title: d.title,
      status: d.status,
      statusLabel: d.status === "reused" ? "Reused" : d.status === "to_execute" ? "To execute" : d.status,
      objective: d.title,
      outputs: d.expectedPath ? [d.expectedPath] : [],
    })),
    recommendedWorkerDisciplines: compiled?.workerDisciplines || interpretation.recommendedWorkerDisciplines,
    directorAssessment: compiled?.readyToExecute
      ? `Ready to execute · confidence ${compiled.compilationConfidence}%`
      : (compiled?.status === "blocked" ? "Mission cannot be compiled" : interpretation.directorAssessment),
    phases: (compiled?.executionPhases || brief.plan || []).map((p) => ({
      id: p.phaseId || p.id,
      title: p.title,
      objective: p.objective,
      outputs: p.requiredOutputs || p.outputs || [],
      kind: p.kind || null,
    })),
    acceptanceCriteria: compiled?.acceptanceCriteria || brief.acceptanceCriteria || [],
    constraints: [
      ...(interpretation.constraints || []),
      ...(compiled?.exclusions || []),
    ],
    sources: (brief.sourceMaterials || []).map((s) => s.ref || s.title || s.id),
    findings,
    assignmentCount: assignments.length || (compiled?.executionPhases || brief.plan || []).length,
    kickoffStatus: state?.kickoff_status || null,
    canStart,
    primaryAction: {
      label: "Start mission",
      disabled: !canStart,
    },
    rawBrief: brief,
    compiled,
    compilationReport: compiled?.report || null,
    reusedArtifacts: reused,
    newWork: toExecute,
    compilationConfidence: compiled?.compilationConfidence ?? null,
    readyToExecute: compiled?.readyToExecute === true,
    expectedDecisions: compiled?.expectedDecisions || [],
    risks: (compiled?.compilationWarnings || []).map((w) => w.message),
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

  const providerRollup = { Claude: { active: 0, waiting: 0, ready: 0 }, Cursor: { active: 0, waiting: 0, ready: 0 } };
  for (const w of currentWork) {
    if (!w.handledBy || !providerRollup[w.handledBy]) continue;
    if (["active", "starting", "waiting_ack", "retrying"].includes(w.lifecycleState)) providerRollup[w.handledBy].active += 1;
    else if (w.status === "ready" || w.lifecycleState === "queued") providerRollup[w.handledBy].ready += 1;
    else if (["waiting", "paused"].includes(w.status) || w.lifecycleState === "waiting_dependency") providerRollup[w.handledBy].waiting += 1;
  }
  if (!Object.values(providerRollup).some((v) => v.active || v.waiting || v.ready)) {
    for (const tel of workers) {
      if (["stopped", "complete", "failed"].includes(tel.status)) continue;
      const p = providerLabel(tel.workerId);
      if (!p) continue;
      if (["healthy", "starting", "recovering"].includes(tel.status)) {
        providerRollup[p].active += 1;
      } else if (["waiting", "idle", "blocked"].includes(tel.status)) {
        providerRollup[p].waiting += 1;
      }
      // unresponsive/stalled without an active assignment are ghosts — omit from rollup
    }
  }
  const providers = Object.entries(providerRollup)
    .filter(([, v]) => v.active || v.waiting || v.ready)
    .map(([name, v]) => {
      const bits = [];
      if (v.active) bits.push(`${v.active} active`);
      if (v.ready) bits.push(`${v.ready} ready`);
      if (v.waiting) bits.push(`${v.waiting} waiting`);
      return { provider: name, active: v.active, waiting: v.waiting, ready: v.ready, label: `${name}: ${bits.join(", ")}` };
    });

  const recovering = workers.filter((w) => {
    if (!["unresponsive", "stalled", "recovering", "failed"].includes(w.status)) return false;
    // Ghost telemetry after assignment closed is not a live recovery.
    const asg = w.assignmentId ? getAssignment(missionId, w.assignmentId) : null;
    if (asg && asg.status === "complete") return false;
    return true;
  });
  const RECENT_RECOVERY_MS = 15 * 60 * 1000;
  const recoveryIsRecent = (w) => {
    const ts = w.last_recovery?.at || w.last_recovery?.updated_at || w.lastHeartbeatAt;
    if (!ts) return false;
    const age = Date.now() - Date.parse(ts);
    return Number.isFinite(age) && age >= 0 && age < RECENT_RECOVERY_MS;
  };
  const directorManagedRecoveries = recovering.filter((w) =>
    !recoveryNeedsOperator(w) && w.status === "recovering" && recoveryIsRecent(w));
  const operatorRecoveries = recovering.filter((w) => recoveryNeedsOperator(w));
  const silentWorkers = recovering.filter((w) =>
    !recoveryNeedsOperator(w) && !(w.status === "recovering" && recoveryIsRecent(w)));

  const posture = deriveMissionPosture(missionId);
  const runningAsg = posture.busy
    ? assignments.filter((a) => ["running", "verification"].includes(a.status))
    : [];
  const directorFocus = posture.busy
    ? runningAsg.map((a) => {
      const tel = workers.find((w) => w.assignmentId === a.assignmentId);
      const who = providerLabel(tel?.workerId || a.workerId, a.provider) || "Worker";
      return `${who} on ${a.title}`;
    })
    : [posture.next];
  if (posture.busy && !directorFocus.length) {
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
  if (posture.id === "worker_silent") {
    risks.push("No live worker — status was stale overnight");
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
    ...silentWorkers.map((w) => {
      const title = getAssignment(missionId, w.assignmentId)?.title || "Worker";
      if (posture.needsYou) {
        return `${title}: Silent — Director could not relaunch. Resume work when ready.`;
      }
      return `${title}: Silent — Director is relaunching (no action needed from you).`;
    }),
  ];

  const assessment = posture.detail;

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
  const workerCountLabel = posture.busy && lifecycleActive.length
    ? `${lifecycleActive.length} active`
    : posture.id === "worker_silent"
      ? "0 active — worker silent"
      : lifecyclePending.length
        ? lifecyclePending[0].lifecycleLabel
        : currentWork.some((w) => w.lifecycleState === "waiting_dependency")
          ? "Waiting on upstream work"
          : posture.busy
            ? `${Math.max(lifecycleActive.length, 1)} active`
            : "0 active";

  const executive = composeExecutiveL1(missionId, {
    posture,
    progress,
    directorSummary: summary,
    missionConfidence: confidence,
  });

  // Prefer explicit recommended decision over vague "Review outcome" on L1 chrome.
  const summaryPrimary = executive.primaryAction
    || (posture.primaryAction?.kind === "review_outcome" && posture.secondaryAction
      ? posture.secondaryAction
      : posture.primaryAction);

  return {
    kind: "mission_dashboard",
    missionId,
    summary: {
      title: card.title,
      statusLabel: posture.label,
      status: posture.status,
      postureId: posture.id,
      postureDetail: posture.detail,
      phase: posture.busy ? phaseTitle : (posture.id === "worker_silent" ? "Worker silent — not live" : "No worker running"),
      phaseLabel: card.phaseLabel,
      deliverablesAccepted: progress.accepted_deliverables ?? 0,
      deliverablesTotal: progress.total_deliverables ?? 0,
      deliverablesLabel: card.deliverablesLabel,
      activeWorkers: posture.busy ? Math.max(lifecycleActive.length, 1) : 0,
      workerCountLabel,
      executionLifecycle: posture.label,
      confidencePercent: confidence.percent,
      confidenceBand: confidence.bandLabel,
      nextCheckpoint: posture.next,
      primaryAction: summaryPrimary,
      secondaryAction: posture.secondaryAction,
      certifyAction: posture.certifyAction || null,
      choices: posture.choices || [],
    },
    director: {
      assessment: posture.detail,
      focus: posture.busy
        ? (directorFocus.length ? directorFocus : ["Worker executing"])
        : directorFocus,
      risks: risks.length ? risks : ["None"],
      recoveries: recoveries.length ? recoveries : ["None"],
      next: posture.next,
      recommendation: posture.next,
    },
    needsMe,
    providers,
    posture,
    localServer: missionLocalServerVm(missionId),
    outcome: ["operator_review", "awaiting_completion", "deliverable_review", "completed"].includes(posture.id)
      || getOpenDeliverableReview(missionId)
      ? missionOutcomeVm(missionId)
      : null,
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
    executive,
    // Compatibility for older clients still reading overview shape
    header: {
      missionId,
      title: card.title,
      statusLabel: card.statusLabel,
      phaseLabel: card.phaseLabel,
      deliverablesLabel: card.deliverablesLabel,
      directorState: card.directorState,
      openDecisionCount: openDecisions.length,
      primaryAction: summaryPrimary || card.primaryAction,
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

/** Fleet-level strip for the Missions landing page. */
export function controlPlaneSummaryVm() {
  const activeRows = listMissionsV2({ includeArchived: false })
    .filter((r) => r.status !== "completed");
  const missionCards = activeRows.map((r) => missionListCardVm(r));
  const needsYou = listNeedsYou();
  const workers = listWorkerTelemetry()
    .filter((w) => {
      if (!w.missionId) return true;
      return getMission(w.missionId)?.archived !== true;
    })
    .map(workerCardVm);

  const byPosture = new Map();
  for (const m of missionCards) {
    const key = m.statusLabel || m.postureId || "Unknown";
    if (!byPosture.has(key)) byPosture.set(key, { label: key, count: 0, postureId: m.postureId });
    byPosture.get(key).count += 1;
  }

  const running = missionCards.filter((m) => m.postureId === "executing").length;
  const ready = missionCards.filter((m) => m.postureId === "ready_to_start").length;
  const waitingOnYou = missionCards.filter((m) => m.needsYou).length;
  const workersActive = workers.filter((w) =>
    ["healthy", "active", "running", "working", "busy"].includes(String(w.health || "").toLowerCase())).length;
  const workersAttention = workers.filter((w) =>
    ["unresponsive", "stalled", "recovering", "failed", "unhealthy"].includes(String(w.health || "").toLowerCase())).length;
  const workersOther = Math.max(0, workers.length - workersActive - workersAttention);

  return {
    kind: "control_plane_summary",
    generatedAt: new Date().toISOString(),
    missions: {
      active: missionCards.length,
      needingYou: waitingOnYou,
      readyToStart: ready,
      running,
      byStatus: [...byPosture.values()].sort((a, b) => b.count - a.count),
    },
    workers: {
      total: workers.length,
      active: workersActive,
      attention: workersAttention,
      idleOrOther: workersOther,
      rows: workers.slice(0, 12).map((w) => ({
        workerId: w.workerId,
        health: w.health,
        healthLabel: w.healthLabel,
        missionId: w.missionId,
        missionTitle: w.missionTitle,
        deliverable: w.deliverable,
        slotLabel: w.slotLabel,
      })),
    },
    needsYouCount: needsYou.length,
    needsYouPreview: needsYou.slice(0, 5).map((n) => ({
      title: n.title,
      missionId: n.missionId,
      missionTitle: n.missionTitle,
      urgency: n.urgency,
      type: n.type,
    })),
  };
}

export function missionsHomeVm({ filter = "active" } = {}) {
  const includeArchived = filter === "archived" || filter === "history" || filter === "all";
  let rows = listMissionsV2({ includeArchived: true });
  if (filter === "active" || !filter) {
    rows = rows.filter((r) => {
      const m = getMission(r.mission_id);
      return m?.archived !== true && r.status !== "completed";
    });
  } else if (filter === "archived" || filter === "history") {
    // History = archived + certified-complete (so closeout never hides a mission).
    rows = rows.filter((r) => {
      const m = getMission(r.mission_id);
      return m?.archived === true || r.status === "completed";
    });
  }
  const activeCount = listMissionsV2({ includeArchived: false })
    .filter((r) => r.status !== "completed").length;
  const archivedCount = listMissionsV2({ includeArchived: true })
    .filter((r) => {
      const m = getMission(r.mission_id || r.missionId);
      return m?.archived === true || r.status === "completed";
    }).length;
  return {
    kind: "missions_home",
    filter: filter || "active",
    activeCount,
    archivedCount,
    summary: controlPlaneSummaryVm(),
    emptyState: activeCount === 0 && (filter === "active" || !filter)
      ? {
          title: "No active missions",
          body: "Create a Mission Brief to start real Alloy product work. Runtime validation history lives under Mission History.",
          primaryAction: { kind: "nav", label: "Create Mission", href: "kickoff" },
        }
      : null,
    missions: rows.map((r) => {
      const card = missionListCardVm(r);
      const m = getMission(r.mission_id);
      return {
        ...card,
        archived: m?.archived === true,
        archiveClass: m?.archive_class || null,
        archiveReason: m?.archive_reason || null,
        readOnly: m?.archive_read_only === true,
      };
    }),
  };
}

export function workersHomeVm() {
  const workers = listWorkerTelemetry()
    .filter((w) => {
      if (!w.missionId) return true;
      const m = getMission(w.missionId);
      return m?.archived !== true;
    })
    .map(workerCardVm);
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
