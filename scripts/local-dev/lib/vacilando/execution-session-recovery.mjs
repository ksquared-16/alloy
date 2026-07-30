/**
 * Vacilando — Execution Session recovery after control-plane / app restart.
 *
 * Reconciles durable sessions with live OS processes. Never accepts a
 * deliverable merely because a process exited. Never duplicates dispatch.
 */
import { existsSync } from "node:fs";
import { appendTimelineEvent } from "./timeline.mjs";
import {
  listExecutionSessions,
  updateExecutionSession,
  getExecutionSession,
} from "./execution-session.mjs";
import { getAssignment } from "./worker-assignment.mjs";

function pidAlive(pid) {
  if (!pid || !Number.isFinite(Number(pid))) return false;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch {
    return false;
  }
}

function story(missionId, fields) {
  if (!missionId) return;
  appendTimelineEvent(missionId, {
    visibility: "summary",
    actor: "director",
    ...fields,
  });
}

/**
 * Reconcile all non-terminal sessions on boot.
 * @returns {{ recovered: object[], lost: object[], interrupted: object[], orphaned: object[] }}
 */
export function reconcileExecutionSessionsOnBoot({ nowMs } = {}) {
  const activeish = listExecutionSessions({ limit: 200 }).filter((s) =>
    ["queued", "starting", "running", "recovering", "producing_evidence", "retrying", "paused"].includes(s.status));

  const result = { recovered: [], lost: [], interrupted: [], orphaned: [] };

  for (const session of activeish) {
    const assignment = getAssignment(session.missionId, session.assignmentId);
    const alive = pidAlive(session.pid);

    if (alive) {
      const next = updateExecutionSession(session.sessionId, {
        status: "recovered",
        progress: {
          activity: session.progress?.activity || "Recovered after restart",
          detail: "Claude process still running — Director reattached heartbeat tracking",
        },
        recovery: {
          ...(session.recovery || {}),
          lastError: null,
          recoveredAt: new Date(nowMs ?? Date.now()).toISOString(),
          mode: "process_alive",
        },
      }, { nowMs });
      // Immediately mark running so dispatch does not re-launch.
      updateExecutionSession(session.sessionId, { status: "running" }, { nowMs });
      result.recovered.push(next || session);
      story(session.missionId, {
        type: "worker_health",
        headline: "Execution session recovered",
        summary: `Director recovered Claude session for ${assignment?.title || session.assignmentId} — process still running`,
        assignmentId: session.assignmentId,
        phaseId: assignment?.phaseId,
        detail: { sessionId: session.sessionId, pid: session.pid, mode: "process_alive" },
        nowMs,
      });
      continue;
    }

    // Process gone — do not treat as completion.
    if (session.status === "producing_evidence" && session.completionPackage) {
      // Evidence path already had a package — leave for Director validation; mark interrupted.
      updateExecutionSession(session.sessionId, {
        status: "interrupted",
        recovery: {
          ...(session.recovery || {}),
          lastError: "process_exited_during_evidence",
          interruptedAt: new Date(nowMs ?? Date.now()).toISOString(),
        },
      }, { nowMs });
      result.interrupted.push(session);
      story(session.missionId, {
        type: "blocker",
        headline: "Execution interrupted during evidence",
        summary: `Claude exited while collecting evidence for ${assignment?.title || "assignment"}. Director will not auto-accept.`,
        assignmentId: session.assignmentId,
        phaseId: assignment?.phaseId,
        detail: { sessionId: session.sessionId },
        nowMs,
      });
      continue;
    }

    if (session.connectorSessionId) {
      updateExecutionSession(session.sessionId, {
        status: "interrupted",
        progress: {
          activity: "Interrupted",
          detail: "Claude process gone after restart — session id preserved for resume",
        },
        recovery: {
          ...(session.recovery || {}),
          lastError: "process_lost_session_resumable",
          interruptedAt: new Date(nowMs ?? Date.now()).toISOString(),
          resumable: true,
        },
      }, { nowMs });
      result.interrupted.push(session);
      story(session.missionId, {
        type: "worker_health",
        headline: "Execution session interrupted",
        summary: `Claude for ${assignment?.title || session.assignmentId} stopped during restart. Director can resume the prior session.`,
        assignmentId: session.assignmentId,
        phaseId: assignment?.phaseId,
        detail: { sessionId: session.sessionId, connectorSessionId: session.connectorSessionId },
        nowMs,
      });
      continue;
    }

    updateExecutionSession(session.sessionId, {
      status: "lost",
      progress: {
        activity: "Lost",
        detail: "No live process and no resumable Claude session id",
      },
      recovery: {
        ...(session.recovery || {}),
        lastError: "session_lost",
        lostAt: new Date(nowMs ?? Date.now()).toISOString(),
      },
      completed_at: new Date(nowMs ?? Date.now()).toISOString(),
    }, { nowMs });
    result.lost.push(session);
    story(session.missionId, {
      type: "blocker",
      headline: "Execution session lost",
      summary: `Director could not recover Claude for ${assignment?.title || session.assignmentId}. No duplicate dispatch was started.`,
      assignmentId: session.assignmentId,
      phaseId: assignment?.phaseId,
      detail: { sessionId: session.sessionId },
      nowMs,
    });
  }

  // Orphans: completed/failed without assignment
  for (const session of listExecutionSessions({ limit: 50 })) {
    if (!["running", "starting"].includes(session.status)) continue;
    if (!getAssignment(session.missionId, session.assignmentId)) {
      updateExecutionSession(session.sessionId, {
        status: "lost",
        recovery: { ...(session.recovery || {}), lastError: "orphaned_no_assignment" },
      }, { nowMs });
      result.orphaned.push(session);
    }
  }

  return result;
}

/** True if an assignment already has a non-terminal session — skip re-dispatch. */
export function hasActiveOrRecoverableSession(missionId, assignmentId) {
  return listExecutionSessions({ missionId, assignmentId }).some((s) =>
    ["queued", "starting", "running", "recovering", "recovered", "awaiting_decision",
      "awaiting_operator", "producing_evidence", "retrying", "interrupted", "paused"].includes(s.status));
}

export function getResumableSession(missionId, assignmentId) {
  return listExecutionSessions({ missionId, assignmentId }).find((s) =>
    ["interrupted", "awaiting_decision", "awaiting_operator", "paused"].includes(s.status)
    && (s.connectorSessionId || s.decisionRequest)) || null;
}
