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
  isSessionActuallyLive,
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
      // Orphaned Claude after control-plane death: the new server does not own the
      // stream / completion promise. Stop the orphan and resume via connectorSessionId
      // rather than pretending we reattached (which would hang forever).
      const orphanPid = Number(session.pid);
      if (orphanPid === process.pid) {
        // Never signal ourselves (mis-recorded pid).
        updateExecutionSession(session.sessionId, {
          status: "interrupted",
          pid: null,
          recovery: {
            ...(session.recovery || {}),
            lastError: "pid_was_control_plane",
            resumable: Boolean(session.connectorSessionId),
          },
        }, { nowMs });
        result.interrupted.push(session);
        continue;
      }
      try { process.kill(orphanPid, "SIGTERM"); } catch { /* */ }
      setTimeout(() => {
        try { process.kill(orphanPid, "SIGKILL"); } catch { /* */ }
      }, 2000).unref?.();

      updateExecutionSession(session.sessionId, {
        status: "interrupted",
        progress: {
          activity: "Interrupted",
          detail: "Control plane restarted — orphaned Claude stopped; Director will resume the prior session",
        },
        recovery: {
          ...(session.recovery || {}),
          lastError: "orphaned_after_restart",
          interruptedAt: new Date(nowMs ?? Date.now()).toISOString(),
          resumable: Boolean(session.connectorSessionId),
          priorPid: session.pid,
          mode: "orphan_stopped_for_resume",
        },
        pid: null,
      }, { nowMs });
      result.interrupted.push(session);
      story(session.missionId, {
        type: "worker_health",
        headline: "Execution session interrupted",
        summary: `Director stopped an orphaned Claude process after restart for ${assignment?.title || session.assignmentId}. Resuming with prior session context.`,
        assignmentId: session.assignmentId,
        phaseId: assignment?.phaseId,
        detail: {
          sessionId: session.sessionId,
          connectorSessionId: session.connectorSessionId,
          priorPid: session.pid,
          mode: "orphan_stopped_for_resume",
        },
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

/** True if an assignment already has a non-terminal live session — skip re-dispatch. */
export function hasActiveOrRecoverableSession(missionId, assignmentId) {
  return listExecutionSessions({ missionId, assignmentId }).some((s) => isSessionActuallyLive(s));
}

export function getResumableSession(missionId, assignmentId) {
  return listExecutionSessions({ missionId, assignmentId }).find((s) =>
    ["interrupted", "awaiting_decision", "awaiting_operator", "paused"].includes(s.status)
    && (s.connectorSessionId || s.decisionRequest)) || null;
}
