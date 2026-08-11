/**
 * Vacilando — Mission health (durable Mission vs current work register).
 *
 * Register completion must never alias Mission completion.
 * Waiting-on-you must never mean "register empty."
 */
import { getMission } from "../commands/missions.mjs";
import { getBrief } from "../mission-brief.mjs";
import { listAssignments } from "../worker-assignment.mjs";
import { listDecisions } from "../decisions.mjs";
import { getOpenDeliverableReview } from "../deliverable-review.mjs";
import {
  peekNextImplementationPhase,
  isBeyondRegisterObjective,
} from "../mission-advance.mjs";
import { deriveMissionPosture } from "../mission-posture.mjs";

const MISSION_DISPLAY_TITLES = Object.freeze({
  msn_f74ed02c126c88d7ff: "Identity Platform",
});

function displayTitle(missionId, fallback) {
  return MISSION_DISPLAY_TITLES[missionId] || fallback || missionId;
}

function clip(s, n = 160) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const TERMINAL = new Set(["complete", "accepted", "cancelled"]);

/**
 * @param {string} missionId
 * @param {{ posture?: object|null }} [opts]
 */
export function missionHealthVm(missionId, { posture: postureIn = null } = {}) {
  if (!missionId) return null;
  const mission = getMission(missionId);
  const brief = getBrief(missionId);
  const posture = postureIn || deriveMissionPosture(missionId);
  const assignments = listAssignments(missionId) || [];
  const openDecisions = listDecisions(missionId, { status: "open" }) || [];
  const openReview = (() => {
    try { return getOpenDeliverableReview(missionId); } catch { return null; }
  })();
  const nextPhase = (() => {
    try { return peekNextImplementationPhase(missionId); } catch { return null; }
  })();

  const done = assignments.filter((a) => TERMINAL.has(String(a.status || "").toLowerCase())).length;
  const total = assignments.length;
  const registerComplete = total > 0 && done === total;
  const closed = Boolean(
    mission?.status === "completed"
    || mission?.kickoff_status === "completed"
    || mission?.completion_certified_at
    || posture?.id === "completed",
  );

  const lastDone = [...assignments].reverse().find((a) =>
    TERMINAL.has(String(a.status || "").toLowerCase())) || null;
  const running = assignments.find((a) =>
    ["running", "verification", "active", "dispatched"].includes(String(a.status || "").toLowerCase())) || null;
  const ready = assignments.find((a) => String(a.status || "").toLowerCase() === "ready") || null;

  const currentObjective = clip(
    running?.title
    || ready?.title
    || lastDone?.title
    || brief?.title
    || mission?.title
    || "Current objective",
    120,
  );

  const topDecision = openDecisions[0] || null;
  const needsOperatorDecision = Boolean(topDecision)
    || posture?.id === "awaiting_kickoff"
    || (openReview
      && openReview.certification_state === "ready_for_review"
      && openReview.recommendation === "approve"
      && openReview.operator_may_approve !== false
      && !nextPhase);

  let lifecycle = "working";
  if (closed) lifecycle = "closed";
  else if (needsOperatorDecision && topDecision) lifecycle = "needs_decision";
  else if (needsOperatorDecision && openReview) lifecycle = "reviewing";
  else if (posture?.busy || running) lifecycle = "waiting_on_worker";
  else if (posture?.id === "director_reconciling") lifecycle = "reviewing";
  else if (posture?.id === "mission_idle" || (registerComplete && !nextPhase && !topDecision)) {
    lifecycle = "idle";
  } else if (openReview) lifecycle = "reviewing";
  else if (ready) lifecycle = "working";
  else if (!total) lifecycle = "idle";

  let objectiveStatus = "in_progress";
  if (closed) objectiveStatus = "mission_closed";
  else if (topDecision) objectiveStatus = "blocked_on_decision";
  else if (openReview && lifecycle === "reviewing") objectiveStatus = "ready_for_director_review";
  else if (registerComplete && nextPhase) objectiveStatus = "register_complete_next_queued";
  else if (registerComplete && !nextPhase) objectiveStatus = "current_work_complete";
  else if (running || posture?.busy) objectiveStatus = "worker_executing";
  else if (ready) objectiveStatus = "ready_to_dispatch";

  const knownRemaining = [];
  if (nextPhase?.title) {
    knownRemaining.push({ id: nextPhase.phaseId, label: nextPhase.title, kind: "plan_phase" });
  } else if (registerComplete && !closed) {
    knownRemaining.push({
      id: "beyond_register",
      label: "Broader mission work may remain beyond the current register — ask Director to continue or name the next outcome",
      kind: "durable_mission",
    });
  }

  let directorNext = null;
  if (topDecision) {
    directorNext = `Waiting on your decision: ${topDecision.title || "open decision"}`;
  } else if (lifecycle === "waiting_on_worker") {
    directorNext = `Worker is executing ${currentObjective}`;
  } else if (nextPhase) {
    directorNext = `Next plan phase available: ${nextPhase.title}`;
  } else if (lifecycle === "reviewing" || posture?.id === "director_reconciling") {
    directorNext = "Director is reconciling the completed work and determining what should happen next";
  } else if (lifecycle === "idle") {
    directorNext = "Mission is idle and ongoing — message Director to continue, or leave it until you need this area again";
  } else if (lifecycle === "closed") {
    directorNext = "Mission is closed";
  } else {
    directorNext = posture?.next || posture?.detail || "Director is supervising current work";
  }

  const registerPct = total > 0 ? Math.round((done / total) * 1000) / 10 : null;

  return {
    kind: "mission_health_vm",
    missionId,
    title: displayTitle(missionId, brief?.title || mission?.title),
    lifecycle,
    lifecycleLabel: ({
      working: "Working",
      waiting_on_worker: "Waiting on worker",
      reviewing: "Director reviewing",
      needs_decision: "Needs decision",
      idle: "Idle",
      closed: "Closed",
    })[lifecycle] || lifecycle,
    missionOngoing: !closed,
    missionProgressLabel: closed ? "Closed" : "Ongoing",
    // Never fabricate an overall Mission percentage from register denominator.
    missionPercent: null,
    currentObjective,
    objectiveStatus,
    objectiveStatusLabel: ({
      in_progress: "In progress",
      worker_executing: "Worker executing",
      ready_to_dispatch: "Ready to dispatch",
      ready_for_director_review: "Ready for Director review",
      register_complete_next_queued: "Current register complete — next phase available",
      current_work_complete: "Current work complete",
      blocked_on_decision: "Blocked on operator decision",
      mission_closed: "Mission closed",
    })[objectiveStatus] || objectiveStatus,
    register: {
      done,
      total,
      complete: registerComplete,
      percent: registerPct,
      label: "Current work",
      line: total
        ? `${done} / ${total} assignments complete${registerComplete ? "" : ""}`
        : "No assignments instantiated",
    },
    needsOperatorDecision: Boolean(needsOperatorDecision && (topDecision || openReview)),
    waitingOnYou: Boolean(topDecision || posture?.id === "awaiting_kickoff"),
    decision: topDecision
      ? {
          decisionId: topDecision.decisionId || topDecision.id,
          title: topDecision.title || "Decision required",
          why: clip(topDecision.situation || topDecision.whyThisMatters || topDecision.summary, 220),
          recommendation: clip(topDecision.recommendation, 160),
        }
      : null,
    nextPhase: nextPhase
      ? { phaseId: nextPhase.phaseId, title: nextPhase.title }
      : null,
    knownRemaining,
    directorNext,
    lastFinished: lastDone
      ? { title: lastDone.title, assignmentId: lastDone.assignmentId || lastDone.id, phaseId: lastDone.phaseId }
      : null,
    beyondRegisterHint: registerComplete && !nextPhase && !closed
      ? isBeyondRegisterObjective("Director objective promotion certification remaining plan")
      : false,
    postureId: posture?.id || null,
    postureLabel: posture?.label || null,
  };
}
