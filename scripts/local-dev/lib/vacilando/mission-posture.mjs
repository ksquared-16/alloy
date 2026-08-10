/**
 * Vacilando — Mission posture (operator-facing truth).
 *
 * One posture drives status pill, subtitle, Needs You, and the primary button.
 * Derived runtime signals (assignment complete, cert heuristics, stale workers)
 * must not contradict each other on the surface.
 *
 * Hard rule: assignment.status === "running" alone is NOT proof of live work.
 * Busy requires a live session or a healthy/starting worker heartbeat.
 */
import { getBrief } from "./mission-brief.mjs";
import { getObjectiveByMission } from "./objective.mjs";
import { listAssignments } from "./worker-assignment.mjs";
import { listDecisions } from "./decisions.mjs";
import { canCertifyMission } from "./evidence.mjs";
import { getMission } from "./commands/missions.mjs";
import { listWorkerTelemetry } from "./worker-health.mjs";
import { getActiveSessionForAssignment, listExecutionSessions } from "./execution-session.mjs";
import { canAdvanceToImplementation, peekNextImplementationPhase, shouldAutoContinueImplementation, scheduleImplementationChainContinue } from "./mission-advance.mjs";
import { silentRecoveryState } from "./silent-worker-recover.mjs";
import {
  ensureDeliverableReviewsForMission,
  getOpenDeliverableReview,
} from "./deliverable-review.mjs";

const LIVE_SESSION = new Set([
  "running", "starting", "recovering", "recovered", "producing_evidence", "waiting_for_operator",
]);
const LIVE_WORKER = new Set(["healthy", "starting", "recovering"]);
const GHOST_WORKER = new Set(["unresponsive", "stalled", "failed", "stopped", "complete"]);

function thrashingOnAssignment(missionId, assignmentId) {
  if (!assignmentId) return { thrashing: false, failedRecent: 0 };
  const since = Date.now() - 3 * 60 * 60 * 1000;
  let failedRecent = 0;
  try {
    const sessions = listExecutionSessions({ missionId, assignmentId, limit: 40 }) || [];
    for (const s of sessions) {
      if (!["failed", "lost"].includes(s.status)) continue;
      const at = Date.parse(s.updated_at || s.completed_at || s.created_at || 0);
      if (Number.isFinite(at) && at >= since) failedRecent += 1;
    }
  } catch { /* */ }
  return { thrashing: failedRecent >= 3, failedRecent };
}

function hasLiveSession(missionId, assignments) {
  for (const a of assignments) {
    // Only in-flight assignment rows can own a live session. A leftover session
    // attached to ready/waiting must not fake "In progress".
    if (!["running", "verification"].includes(a.status)) continue;
    const session = getActiveSessionForAssignment(missionId, a.assignmentId);
    if (session && LIVE_SESSION.has(session.status)) return true;
  }
  return false;
}

function liveWorkers(missionId, assignments) {
  const asgIds = new Set(assignments.filter((a) => ["running", "verification"].includes(a.status)).map((a) => a.assignmentId));
  return listWorkerTelemetry().filter((w) => {
    if (w.missionId !== missionId) return false;
    if (GHOST_WORKER.has(w.status)) return false;
    if (!LIVE_WORKER.has(w.status)) return false;
    // Ignore healthy telemetry attached to already-complete assignments.
    if (w.assignmentId && !asgIds.has(w.assignmentId) && !assignments.some((a) => a.assignmentId === w.assignmentId && ["running", "verification", "ready"].includes(a.status))) {
      return false;
    }
    return true;
  });
}

function ghostWorkersOnClaimedWork(missionId, claimedRunning) {
  const ids = new Set(claimedRunning.map((a) => a.assignmentId));
  return listWorkerTelemetry().filter((w) => {
    if (w.missionId !== missionId) return false;
    if (!GHOST_WORKER.has(w.status) || w.status === "complete") return false;
    if (w.assignmentId && ids.has(w.assignmentId)) return true;
    return claimedRunning.some((a) => a.workerId && a.workerId === w.workerId);
  });
}

function silenceLabel(workers) {
  let oldest = null;
  for (const w of workers) {
    const ts = w.lastHeartbeatAt || w.lastProgressAt;
    if (!ts) continue;
    const ms = Date.now() - Date.parse(ts);
    if (!Number.isFinite(ms) || ms < 0) continue;
    if (oldest == null || ms > oldest) oldest = ms;
  }
  if (oldest == null) return "with no recent heartbeat";
  const mins = Math.round(oldest / 60000);
  if (mins < 60) return `for ~${Math.max(1, mins)}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `for ~${hours}h`;
  return `for ~${Math.round(hours / 24)}d`;
}

function action(kind, label, extra = {}) {
  return { kind, label, ...extra };
}

/**
 * @returns {{
 *   id: string,
 *   status: string,
 *   label: string,
 *   detail: string,
 *   next: string,
 *   needsYou: boolean,
 *   busy: boolean,
 *   primaryAction: object,
 *   secondaryAction: object|null,
 *   workersLine: string,
 * }}
 */
export function deriveMissionPosture(missionId) {
  const mission = getMission(missionId);
  const brief = getBrief(missionId);
  const objective = getObjectiveByMission(missionId);
  const openDecisions = listDecisions(missionId, { status: "open" });
  const assignments = listAssignments(missionId);
  if (assignments.some((a) => a.status === "complete" || a.completionReport)) {
    try { ensureDeliverableReviewsForMission(missionId); } catch { /* best-effort */ }
  }
  const cert = brief ? canCertifyMission(missionId) : { ready: false };
  const topDecision = openDecisions[0] || null;
  const ready = assignments.filter((a) => a.status === "ready");
  const claimedRunning = assignments.filter((a) => ["running", "verification"].includes(a.status));
  const allComplete = assignments.length > 0 && assignments.every((a) => a.status === "complete");
  const live = liveWorkers(missionId, assignments);
  const sessionLive = hasLiveSession(missionId, assignments);
  // Never treat a stale "running" row as live work.
  const busy = sessionLive || live.length > 0;
  const ghosts = ghostWorkersOnClaimedWork(missionId, claimedRunning);
  const stalledClaim = claimedRunning.length > 0 && !busy;
  const missionInterrupted = mission?.status === "interrupted" || mission?.status === "failed";

  const workersLine = (() => {
    if (busy) {
      const n = Math.max(live.length, sessionLive ? 1 : 0);
      return `${n} worker${n === 1 ? "" : "s"} active`;
    }
    if (stalledClaim || ghosts.length) {
      return `0 active — last worker silent ${silenceLabel(ghosts)}`;
    }
    if (ready.length) return "Worker ready to start — not running yet";
    return "No active workers";
  })();

  const base = {
    needsYou: false,
    busy: false,
    secondaryAction: null,
    workersLine,
  };

  if (!brief && !mission) {
    return {
      ...base,
      id: "unknown",
      status: "unknown",
      label: "Unknown",
      detail: "Mission record not found.",
      next: "Create or open a Mission Brief",
      primaryAction: action("open_mission", "Open mission", { href: `missions/${missionId}`, missionId }),
    };
  }

  if (
    mission?.status === "completed"
    || mission?.kickoff_status === "completed"
    || mission?.completion_certified_at
    || objective?.status === "completed"
  ) {
    return {
      ...base,
      id: "completed",
      status: "completed",
      label: "Completed",
      detail: "You certified completion. This mission is closed.",
      next: "No further action — review Mission History if needed",
      primaryAction: action("open_mission", "View completed mission", { href: `missions/${missionId}`, missionId }),
    };
  }

  if (mission?.kickoff_status === "awaiting_kickoff_approval" || objective?.status === "awaiting_kickoff_approval") {
    return {
      ...base,
      id: "awaiting_kickoff",
      status: "awaiting_kickoff_approval",
      label: "Waiting for kickoff",
      detail: "Director prepared an execution plan and needs you to start the mission.",
      next: "Review kickoff and start the mission",
      needsYou: true,
      primaryAction: action("open_kickoff", "Review kickoff", { href: `kickoff/${missionId}`, missionId }),
    };
  }

  if (topDecision) {
    return {
      ...base,
      id: "decision_required",
      status: "decision_required",
      label: "Decision required",
      detail: topDecision.title || "Director needs a product call before work can continue.",
      next: `Answer decision: ${topDecision.title}`,
      needsYou: true,
      primaryAction: action("open_decision", "Open decision", {
        href: `decisions/${topDecision.decisionId}`,
        decisionId: topDecision.decisionId,
        missionId,
      }),
    };
  }

  // Director-owned Deliverable Review — before generic cert copy.
  // Implementation chain: do not park the operator between waves when auto-continue is allowed.
  const openReview = getOpenDeliverableReview(missionId);
  if (openReview && ["ready_for_review", "cannot_verify", "evidence_discrepancy", "evidence_repair", "director_verifying"].includes(openReview.certification_state)) {
    const state = openReview.certification_state;
    const repair = state === "evidence_repair" || state === "evidence_discrepancy";
    const cannot = state === "cannot_verify";
    const verifying = state === "director_verifying";
    const ready = state === "ready_for_review" && openReview.recommendation === "approve";
    const wave = openReview.wave_label
      || (String(openReview.deliverable_title || "").match(/\b(W-\d+)\b/i)?.[1])
      || "this deliverable";
    const autoGate = shouldAutoContinueImplementation(missionId);
    const nextPhase = peekNextImplementationPhase(missionId);
    const canChain = autoGate.ok && nextPhase && !repair && !verifying;
    if (canChain) {
      scheduleImplementationChainContinue(missionId, {
        fromAssignmentId: openReview.assignment_id,
        actor: "director",
      });
      return {
        ...base,
        id: "executing",
        status: "auto_continuing",
        label: "Continuing",
        detail: `Director accepted ${wave} and is opening ${nextPhase.title}.`,
        next: `Running ${nextPhase.title}`,
        needsYou: false,
        primaryAction: action("open_mission", "Open mission", { href: `missions/${missionId}`, missionId }),
        deliverableReviewId: openReview.review_id,
      };
    }
    return {
      ...base,
      id: "deliverable_review",
      status: repair
        ? "evidence_repair"
        : verifying
          ? "director_verifying"
          : cannot
            ? "deliverable_unverified"
            : "deliverable_ready_for_approval",
      label: repair
        ? `Director returned ${wave} for evidence repair`
        : verifying
          ? "Director is verifying this deliverable"
          : cannot
            ? `Director cannot certify ${wave}`
            : `Director recommends certifying ${wave}`,
      detail: repair
        ? (openReview.recommendation_detail
          || "Director is reconciling evidence before recommending certification.")
        : cannot
          ? (openReview.recommendation_detail || `Director cannot yet certify ${wave}.`)
          : `Director verified ${wave}. You are approving Director’s certification — not reviewing implementation.`,
      next: repair
        ? "Have Director re-check, or request a worker repair"
        : cannot
          ? "Have Director re-check — or request a specific fix"
          : "Read Director’s recommendation, then certify or request changes",
      needsYou: ready || cannot || repair,
      primaryAction: action(
        ready ? "review_deliverable" : "recheck_deliverable",
        ready ? "Open certification" : "Have Director re-check",
        {
          href: `missions/${missionId}`,
          missionId,
          reviewId: openReview.review_id,
        },
      ),
      secondaryAction: action("ask_director_deliverable", "Ask Director", {
        missionId,
        reviewId: openReview.review_id,
      }),
      deliverableReviewId: openReview.review_id,
    };
  }

  if (assignments.some((a) => a.status === "blocked")) {
    return {
      ...base,
      id: "blocked",
      status: "blocked",
      label: "Blocked",
      detail: "An assignment is blocked. Work cannot continue until the blocker clears.",
      next: "Open the mission and clear the blocker",
      needsYou: true,
      primaryAction: action("open_mission", "Open mission", { href: `missions/${missionId}`, missionId }),
    };
  }

  // Claimed-running with no live session/heartbeat — overnight death, restart orphans, etc.
  // Director auto-resumes; escalate to Needs You only after recovery is exhausted.
  if (stalledClaim || (missionInterrupted && claimedRunning.length > 0 && !busy)) {
    const titles = claimedRunning.map((a) => a.title).filter(Boolean);
    const titleBit = titles.length === 1 ? titles[0] : (titles[0] ? `${titles[0]} (+${titles.length - 1})` : "the current assignment");
    const recovery = silentRecoveryState(missionId);
    const escalate = recovery.exhausted === true;
    return {
      ...base,
      id: "worker_silent",
      status: "interrupted",
      label: escalate ? "Worker went silent" : "Director recovering",
      detail: escalate
        ? `Nothing is running. ${titleBit} is still marked in-progress in storage, but the worker stopped reporting ${silenceLabel(ghosts)}. Director could not relaunch after ${recovery.tries || 3} attempts.`
        : `Nothing is running. ${titleBit} stopped reporting ${silenceLabel(ghosts)}. Director is relaunching — you do not need to click Resume.`,
      next: escalate
        ? "Resume work to relaunch — or open the mission to inspect what stopped"
        : "Director is relaunching the silent worker",
      needsYou: escalate,
      busy: false,
      workersLine,
      primaryAction: escalate
        ? action("resume_stalled", "Resume work", { missionId })
        : action("open_mission", "Watch progress", { href: `missions/${missionId}`, missionId }),
      secondaryAction: escalate
        ? action("open_mission", "Inspect mission", { href: `missions/${missionId}`, missionId })
        : action("resume_stalled", "Resume now", { missionId }),
      stalledAssignmentIds: claimedRunning.map((a) => a.assignmentId),
      silentRecovery: recovery,
    };
  }

  // Live work wins — only when something is actually running.
  if (busy) {
    const runningAsg = claimedRunning[0];
    const thrash = thrashingOnAssignment(missionId, runningAsg?.assignmentId);
    if (thrash.thrashing) {
      return {
        ...base,
        id: "worker_thrashing",
        status: "executing",
        label: "Worker keeps restarting",
        detail: `A worker is reporting activity, but this deliverable has failed or been lost ${thrash.failedRecent} times in the last few hours. You can relaunch cleanly if it looks stuck.`,
        next: "Relaunch the worker — or open the mission to inspect progress",
        needsYou: true,
        busy: true,
        workersLine,
        primaryAction: action("resume_stalled", "Relaunch worker", { missionId }),
        secondaryAction: action("open_mission", "Inspect mission", { href: `missions/${missionId}`, missionId }),
        thrashCount: thrash.failedRecent,
      };
    }
    return {
      ...base,
      id: "executing",
      status: "executing",
      label: "In progress",
      detail: "A worker is actively executing. Watch Current Work and Timeline for live updates.",
      next: "Wait for the worker — or relaunch if progress looks stuck",
      busy: true,
      primaryAction: action("open_mission", "Watch progress", { href: `missions/${missionId}`, missionId }),
      // Always offer an escape hatch — auto-resume is invisible to operators.
      secondaryAction: action("resume_stalled", "Relaunch worker", { missionId }),
    };
  }

  if (ready.length) {
    const autoDispatch = process.env.VACILANDO_AUTO_DISPATCH !== "0";
    return {
      ...base,
      id: "ready_to_start",
      status: "executing",
      label: autoDispatch ? "Director starting" : "Ready to start",
      detail: autoDispatch
        ? "Work is queued. Director is launching the worker — you do not need to click Start."
        : "Work is queued. Nothing is running until you start it.",
      next: autoDispatch
        ? "Director is launching the worker"
        : "Start work to launch the worker",
      needsYou: !autoDispatch,
      workersLine: autoDispatch
        ? "Director launching worker"
        : "Worker ready to start — not running yet",
      primaryAction: autoDispatch
        ? action("open_mission", "Watch progress", { href: `missions/${missionId}`, missionId })
        : action("dispatch_ready", "Start work", { missionId }),
      secondaryAction: autoDispatch
        ? action("dispatch_ready", "Start now", { missionId })
        : undefined,
    };
  }

  if (assignments.some((a) => a.status === "paused")) {
    return {
      ...base,
      id: "paused",
      status: "paused",
      label: "Paused",
      detail: "Assignments are paused. Nothing is running.",
      next: "Open the mission and choose the next direction",
      needsYou: true,
      primaryAction: action("open_mission", "Open mission", { href: `missions/${missionId}`, missionId }),
    };
  }

  // Worker finished (or compiler closed the lane) — not certified by you.
  if (allComplete) {
    const rejected = Boolean(mission?.completion_rejected_at);
    const advance = canAdvanceToImplementation(missionId);
    if (rejected || !cert.ready || advance?.ok) {
      const choices = [
        advance?.ok
          ? {
              id: "advance",
              kind: "advance_implementation",
              label: "Advance to implementation",
              explanation:
                "Keep this same mission. Accept discovery as the basis and open the next implementation phases (Wave 0 first). Nothing closes.",
              missionId,
            }
          : null,
        {
          id: "more_work",
          kind: "reopen_work",
          label: "Need more discovery work",
          explanation: "Reopen discovery if the package is incomplete or wrong. Does not start implementation.",
          missionId,
        },
        {
          id: "park",
          kind: "park_outcome",
          label: "Park for later",
          explanation: "Stay open and idle. No worker launches.",
          missionId,
        },
        {
          id: "close",
          kind: "certify_completion",
          label: "Close mission (no implementation)",
          explanation:
            "End this mission without implementing. Only use if you truly do not want continuation here.",
          missionId,
        },
      ].filter(Boolean);

      return {
        ...base,
        id: "operator_review",
        status: "waiting_for_operator",
        label: "Waiting on you",
        detail: advance?.ok
          ? "Discovery finished. Advance this same mission into implementation — or park / request more discovery."
          : "A worker finished. Read the outcome, then choose one next step — reviewing alone does not change anything.",
        next: advance?.ok
          ? "Recommended: Advance to implementation on this mission"
          : "Choose: more discovery, park, or close",
        needsYou: true,
        primaryAction: action("review_outcome", "Review outcome", { missionId }),
        secondaryAction: advance?.ok
          ? action("advance_implementation", "Advance to implementation", { missionId })
          : null,
        choices,
      };
    }
    return {
      ...base,
      id: "awaiting_completion",
      status: "awaiting_completion_approval",
      label: "Ready for your review",
      detail: "A worker finished and Director thinks it may be certifiable. Read the outcome, then choose deliberately.",
      next: "Choose next step on the outcome panel",
      needsYou: true,
      primaryAction: action("review_outcome", "Review outcome", { missionId }),
      secondaryAction: null,
      choices: [
        {
          id: "close",
          kind: "certify_completion",
          label: "Accept and close",
          explanation: "Certify completion and close the mission.",
          missionId,
        },
        {
          id: "more_work",
          kind: "reopen_work",
          label: "Need more work",
          explanation: "Reopen so a worker can continue.",
          missionId,
        },
        {
          id: "park",
          kind: "park_outcome",
          label: "Park for later",
          explanation: "Stay open without launching anyone.",
          missionId,
        },
      ],
    };
  }

  if (assignments.some((a) => a.status === "waiting")) {
    return {
      ...base,
      id: "waiting_dependency",
      status: "executing",
      label: "Waiting on upstream work",
      detail: "A deliverable is waiting on an earlier workstream. Nothing needs you yet.",
      next: "Wait for upstream work to finish",
      primaryAction: action("open_mission", "Open mission", { href: `missions/${missionId}`, missionId }),
    };
  }

  if (objective?.status === "executing" || mission?.kickoff_status === "executing" || missionInterrupted) {
    return {
      ...base,
      id: missionInterrupted ? "interrupted_idle" : "idle_after_kickoff",
      status: missionInterrupted ? "interrupted" : "executing",
      label: missionInterrupted ? "Interrupted" : "Idle",
      detail: missionInterrupted
        ? "Execution was interrupted and nothing is running now."
        : "Mission is open but no assignment is ready or running.",
      next: "Open the mission — resume, recompile, or choose the next assignment",
      needsYou: true,
      primaryAction: action("open_mission", "Open mission", { href: `missions/${missionId}`, missionId }),
    };
  }

  return {
    ...base,
    id: "draft",
    status: "draft",
    label: "Draft",
    detail: "Mission is not executing yet.",
    next: "Review kickoff or compile the Mission Brief",
    primaryAction: action("open_kickoff", "Review kickoff", { href: `kickoff/${missionId}`, missionId }),
  };
}

/** Back-compat status shape used by older projections. */
export function postureToStatus(posture) {
  return { status: posture.status, label: posture.label };
}
