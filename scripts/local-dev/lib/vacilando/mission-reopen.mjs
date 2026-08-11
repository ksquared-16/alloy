/**
 * Operator actions after reviewing a finished worker pass.
 */
import { getMission, updateMission } from "./commands/missions.mjs";
import { getBrief } from "./mission-brief.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import {
  reopenAssignmentsForMoreWork,
  resetStalledRunningAssignments,
} from "./worker-assignment.mjs";
import { deriveMissionPosture } from "./mission-posture.mjs";

/**
 * Park after review — stay open, no worker launch.
 */
export function parkMissionOutcome(missionId, {
  actor = "operator",
  response = null,
  nowMs,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  if (!getMission(missionId) && !getBrief(missionId)) return { ok: false, error: "mission_not_found" };

  const at = new Date(nowMs ?? Date.now()).toISOString();
  updateMission(missionId, {
    status: "idle",
    kickoff_status: "executing",
    outcome_reviewed_at: at,
    outcome_reviewed_by: actor,
    outcome_parked_at: at,
    // Park ≠ reject — do not set completion_rejected_* (that forced Waiting on you).
    pending_question: null,
    pending_approval: null,
  }, { nowMs });

  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "Mission idle",
      summary: response || "Mission left idle — durable responsibility remains open; nothing launches.",
      visibility: "summary",
      actor,
      nowMs,
    });
  } catch { /* optional */ }

  return { ok: true, mission: getMission(missionId), posture: deriveMissionPosture(missionId) };
}

/**
 * Send mission back for more work: reopen assignments to ready, clear false completion.
 */
export function reopenMissionForMoreWork(missionId, {
  actor = "operator",
  response = null,
  nowMs,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  if (!getMission(missionId) && !getBrief(missionId)) return { ok: false, error: "mission_not_found" };

  const reason = response || "Operator reviewed the outcome and sent work back for another pass";
  const reopened = reopenAssignmentsForMoreWork(missionId, { reason, nowMs });

  updateMission(missionId, {
    status: "executing",
    kickoff_status: "executing",
    completed_at: null,
    completion_certified_at: null,
    completion_certified_by: null,
    completion_response: null,
    completion_rejected_at: null,
    completion_rejected_by: null,
    completion_rejection_reason: null,
    pending_approval: null,
    pending_question: null,
    archived: false,
    archived_at: null,
    archive_reason: null,
    archive_class: null,
    archive_read_only: false,
  }, { nowMs });

  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: "You sent work back for another pass",
      summary: reason,
      visibility: "summary",
      actor,
      detail: { reopened: reopened.reopened },
      nowMs,
    });
  } catch { /* optional */ }

  return {
    ok: true,
    mission: getMission(missionId),
    reopened: reopened.reopened,
    assignments: reopened.assignments,
  };
}

/**
 * Honest resume after a silent/dead worker: reset claimed-running rows to ready,
 * then optionally dispatch. Does not pretend the old process is still live.
 */
export async function resumeStalledMission(missionId, {
  actor = "operator",
  response = null,
  dispatch = true,
  nowMs,
} = {}) {
  if (!missionId) return { ok: false, error: "missing_mission_id" };
  if (!getMission(missionId) && !getBrief(missionId)) return { ok: false, error: "mission_not_found" };

  const posture = deriveMissionPosture(missionId);
  const { listAssignments } = await import("./worker-assignment.mjs");
  const claimed = listAssignments(missionId)
    .filter((a) => ["running", "verification"].includes(a.status));
  const resetIds = posture.stalledAssignmentIds?.length
    ? posture.stalledAssignmentIds
    : claimed.map((a) => a.assignmentId);

  if (posture.id !== "worker_silent" && !claimed.length) {
    return {
      ok: false,
      error: "not_stalled",
      detail: "No silent in-progress assignment to resume.",
      posture,
    };
  }

  const reason = response || (actor === "director"
    ? "Director resumed after the worker went silent"
    : "Operator resumed after worker went silent");
  const reset = resetStalledRunningAssignments(missionId, {
    assignmentIds: resetIds,
    reason,
    nowMs,
  });

  if (!reset.reset?.length) {
    return {
      ok: false,
      error: "nothing_reset",
      detail: "Could not reset a stalled assignment for relaunch.",
      posture,
    };
  }
  updateMission(missionId, {
    status: "executing",
    kickoff_status: "executing",
    error_code: null,
    error_message: null,
    pending_question: null,
    pending_approval: null,
  }, { nowMs });

  try {
    appendTimelineEvent(missionId, {
      type: "progress",
      headline: actor === "director"
        ? "Director resumed after the worker went silent"
        : "You resumed after the worker went silent",
      summary: reason,
      visibility: "summary",
      actor,
      detail: { reset: reset.reset },
      nowMs,
    });
  } catch { /* optional */ }

  let dispatched = null;
  if (dispatch && reset.reset?.length) {
    const { dispatchReadyAssignments } = await import("./assignment-dispatch.mjs");
    dispatched = await dispatchReadyAssignments(missionId, { actor: "director" });
  }

  return {
    ok: true,
    mission: getMission(missionId),
    reset: reset.reset,
    dispatched,
    nextAction: dispatched?.ok
      ? { kind: "open_mission", label: "Watch progress", href: `missions/${missionId}`, missionId }
      : { kind: "dispatch_ready", label: "Start work", missionId },
  };
}
