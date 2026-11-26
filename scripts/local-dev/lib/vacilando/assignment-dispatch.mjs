/**
 * Vacilando — Director assignment dispatch (Execution Runtime V1).
 *
 * After kickoff, Director owns: choose provider → launch → acknowledgement →
 * heartbeat → evidence → completion → next ready assignment.
 *
 * Operator never manually launches workers.
 */
import { getBrief } from "./mission-brief.mjs";
import { getMission, updateMission } from "./commands/missions.mjs";
import {
  listAssignments,
  getAssignment,
  acknowledgeWorkerContext,
  submitWorkerStartReport,
  reportWorkerProgress,
  submitWorkerCompletion,
  validateAssignmentCompletion,
  serializeAssignmentPrompt,
  buildAssignmentPackage,
  pauseAssignments,
} from "./worker-assignment.mjs";
import { buildMissionContextPackage } from "./mission-context.mjs";
import { appendTimelineEvent } from "./timeline.mjs";
import { attachEvidence } from "./evidence.mjs";
import { recordHeartbeat } from "./worker-health.mjs";
import { REPO_ROOT } from "./knowledge.mjs";
import {
  ensureDefaultProviders,
  resolveProviderOrder,
  getProvider,
  PROVIDER_LIFECYCLE_LABELS,
} from "./execution-provider.mjs";
import {
  createExecutionSession,
  getActiveSessionForAssignment,
  getExecutionSession,
  appendDecisionAnswer,
} from "./execution-session.mjs";
import {
  runClaudeExecutionSession,
  resumeClaudeAfterDecision,
} from "./connectors/claude-connector.mjs";
import { getResumableSession } from "./execution-session-recovery.mjs";
import { createDecision } from "./decisions.mjs";

import {
  existsSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import { join } from "node:path";

const MAX_ATTEMPTS_PER_PROVIDER = 3;
const activeDispatches = new Set(); // missionId:assignmentId

function setDispatchState(missionId, assignmentId, dispatchPatch, { nowMs } = {}) {
  const root = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
  const file = join(root, "vacilando", "assignments", `${missionId}.json`);
  let store;
  try {
    store = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    return null;
  }
  const a = (store.assignments || []).find((x) => x.assignmentId === assignmentId);
  if (!a) return null;
  a.dispatch = { ...(a.dispatch || {}), ...dispatchPatch };
  a.updated_at = new Date(nowMs ?? Date.now()).toISOString();
  if (dispatchPatch.workerId) a.workerId = dispatchPatch.workerId;
  if (dispatchPatch.provider) a.provider = dispatchPatch.provider;
  writeFileSync(file, JSON.stringify(store, null, 2));
  return a;
}

function story(missionId, {
  type,
  headline,
  summary,
  assignmentId = null,
  phaseId = null,
  actor = "director",
  detail = {},
  nowMs,
} = {}) {
  appendTimelineEvent(missionId, {
    type,
    headline,
    summary,
    visibility: "summary",
    assignmentId,
    phaseId,
    actor,
    detail,
    nowMs,
  });
}

function preferredProvider(missionId) {
  const mission = getMission(missionId);
  const brief = getBrief(missionId);
  return process.env.VACILANDO_EXECUTION_PROVIDER
    && process.env.VACILANDO_EXECUTION_PROVIDER !== "auto"
    ? process.env.VACILANDO_EXECUTION_PROVIDER
    : (mission?.provider || brief?.executionPreferences?.preferredProvider || "claude");
}

function workerIdFor(providerId, slot) {
  const s = slot != null ? String(slot) : "6";
  return `${providerId}-${s}`;
}

function executionCwd(missionId) {
  const mission = getMission(missionId);
  if (mission?.executed_in && existsSync(mission.executed_in)) return mission.executed_in;
  if (mission?.worktree && existsSync(mission.worktree)) return mission.worktree;
  return REPO_ROOT;
}

/**
 * Dispatch all currently ready assignments (respecting concurrency = 1 for V1).
 */
export async function dispatchReadyAssignments(missionId, {
  slot = null,
  actor = "director",
  nowMs,
  maxConcurrent = 1,
} = {}) {
  ensureDefaultProviders({
    includeMock: process.env.VACILANDO_ALLOW_MOCK_PROVIDER === "1"
      || process.env.VACILANDO_EXECUTION_PROVIDER === "mock",
  });
  const ready = listAssignments(missionId).filter((a) => a.status === "ready");
  const running = listAssignments(missionId).filter((a) => a.status === "running");
  const capacity = Math.max(0, maxConcurrent - running.length);
  const results = [];
  for (const a of ready.slice(0, capacity)) {
    results.push(await dispatchAssignment(missionId, a.assignmentId, { slot, actor, nowMs }));
  }
  return { ok: true, missionId, dispatched: results };
}

/**
 * Director-owned dispatch for one assignment with retry / provider failover.
 */
export async function dispatchAssignment(missionId, assignmentId, {
  slot = null,
  actor = "director",
  nowMs,
} = {}) {
  const key = `${missionId}:${assignmentId}`;
  if (activeDispatches.has(key)) {
    return { ok: false, error: "dispatch_in_progress", assignmentId };
  }
  activeDispatches.add(key);
  try {
    return await dispatchAssignmentInner(missionId, assignmentId, { slot, actor, nowMs });
  } finally {
    activeDispatches.delete(key);
  }
}

/**
 * Claude path: Director → Execution Session → Claude connector.
 */
async function dispatchViaClaudeSession(missionId, assignmentId, { slot, actor, nowMs } = {}) {
  const assignment = getAssignment(missionId, assignmentId);
  if (!assignment) return { ok: false, error: "assignment_not_found" };
  const context = buildMissionContextPackage(missionId, { phaseId: assignment.phaseId });
  if (!context) return { ok: false, error: "context_unavailable" };

  const existing = getActiveSessionForAssignment(missionId, assignmentId);
  if (existing && ["running", "starting", "recovering", "recovered", "producing_evidence"].includes(existing.status)) {
    story(missionId, {
      type: "worker_health",
      headline: "Dispatch skipped — session already active",
      summary: `Director did not duplicate Claude for ${assignment.title}`,
      assignmentId,
      phaseId: assignment.phaseId,
      actor,
      detail: { sessionId: existing.sessionId, status: existing.status },
      nowMs,
    });
    return { ok: false, error: "session_already_active", sessionId: existing.sessionId };
  }

  const wid = workerIdFor("claude", slot ?? assignment.slot ?? 6);
  const session = createExecutionSession({
    missionId,
    assignmentId,
    connector: "claude",
    workerId: wid,
    slot: slot ?? assignment.slot ?? 6,
    cwd: executionCwd(missionId),
    nowMs,
  });

  setDispatchState(missionId, assignmentId, {
    providerLifecycle: "launching",
    currentProvider: "claude",
    workerId: wid,
    provider: "claude",
    sessionId: session.sessionId,
    attempt: 1,
  }, { nowMs });

  story(missionId, {
    type: "assignment_started",
    headline: `Director assigned ${assignment.title}`,
    summary: `Director assigned ${assignment.title} to a Claude execution session`,
    assignmentId,
    phaseId: assignment.phaseId,
    actor,
    detail: { sessionId: session.sessionId },
    nowMs,
  });

  // Acknowledge when session starts (connector accepted the session).
  const ack = acknowledgeWorkerContext({
    missionId,
    assignmentId,
    workerId: wid,
    missionVersion: context.missionVersion,
    missionContentHash: context.missionContentHash,
    provider: "claude",
    nowMs,
  });
  if (!ack.ok) return { ok: false, error: ack.error || ack.code || "ack_failed", sessionId: session.sessionId };

  submitWorkerStartReport({
    missionId,
    assignmentId,
    understoodObjective: assignment.objective,
    intendedApproach: ["Director execution session via Claude connector"],
    filesOrSystemsExpectedToChange: assignment.expectedDeliverables || [],
    detectedRisks: [],
    nowMs,
  });

  setDispatchState(missionId, assignmentId, {
    providerLifecycle: "acknowledged",
    sessionId: session.sessionId,
  }, { nowMs });

  story(missionId, {
    type: "assignment_started",
    headline: "Claude acknowledged assignment",
    summary: `Claude execution session accepted ${assignment.title}`,
    assignmentId,
    phaseId: assignment.phaseId,
    actor: wid,
    nowMs,
  });

  updateMission(missionId, {
    status: "running",
    provider: "claude",
    assignment_id: assignmentId,
    execution_session_id: session.sessionId,
    worker_slot: slot ?? assignment.slot ?? null,
  }, { nowMs });

  const finished = await runClaudeExecutionSession(session, {
    cwd: executionCwd(missionId),
    nowMs,
    onProgress: () => {
      setDispatchState(missionId, assignmentId, { providerLifecycle: "running" }, { nowMs });
      recordHeartbeat({
        workerId: wid,
        missionId,
        assignmentId,
        slot: Number(slot ?? assignment.slot ?? 6) || 6,
        progress: true,
        provider: "claude",
      });
    },
  });

  if (finished?.status === "awaiting_decision" || finished?.status === "awaiting_operator") {
    const dreq = finished.decisionRequest || finished.checkpoint?.decisionRequest || {};

    // Privileged credential boundary → Trusted Host Action (never Terminal/Supabase instructions).
    try {
      const { tryFulfillViaTrustedHost } = await import("./trusted-host-director.mjs");
      const tha = await tryFulfillViaTrustedHost({
        missionId,
        assignmentId,
        executionSessionId: finished.sessionId,
        dreq,
        actor: "director",
        nowMs,
      });
      if (tha?.fulfilled) {
        setDispatchState(missionId, assignmentId, {
          providerLifecycle: "running",
          lastError: null,
          sessionId: finished.sessionId,
          connectorSessionId: finished.checkpoint?.connectorSessionId || finished.connectorSessionId,
        }, { nowMs });
        return {
          ok: true,
          via: "trusted_host_action",
          actionId: tha.actionId,
          sessionId: finished.sessionId,
          resumed: tha.resumed,
        };
      }
      if (tha && tha.via === "trusted_host_authorization_decision") {
        setDispatchState(missionId, assignmentId, {
          providerLifecycle: "awaiting_decision",
          lastError: null,
          sessionId: finished.sessionId,
          connectorSessionId: finished.checkpoint?.connectorSessionId || finished.connectorSessionId,
        }, { nowMs });
        return {
          ok: false,
          error: "awaiting_decision",
          sessionId: finished.sessionId,
          via: tha.via,
          decision: { title: "Authorize read-only database census for this mission" },
        };
      }
      if (tha && tha.via === "trusted_host_failure_decision") {
        setDispatchState(missionId, assignmentId, {
          providerLifecycle: "awaiting_decision",
          lastError: tha.error || null,
          sessionId: finished.sessionId,
        }, { nowMs });
        return {
          ok: false,
          error: "awaiting_decision",
          sessionId: finished.sessionId,
          via: tha.via,
        };
      }
    } catch (e) {
      // Fall through to normal decision if THA seam fails unexpectedly.
      console.log(`[trusted-host] director seam error: ${e?.message || e}`);
    }

    createDecision({
      missionId,
      title: dreq.title || "Product decision required",
      situation: dreq.situation || "Claude paused for a product decision",
      whyThisMatters: dreq.whyThisMatters || "Execution cannot continue safely without your call",
      currentPlan: dreq.currentPlan || assignment.objective,
      discovery: dreq.discovery || "Raised by Claude during execution session",
      options: dreq.options || [
        { optionId: "proceed", label: "Proceed as recommended", description: "Continue" },
        { optionId: "revise", label: "Revise approach", description: "Provide new direction" },
      ],
      recommendation: dreq.recommendation || "proceed",
      recommendationReason: dreq.recommendationReason || "Claude recommendation",
      impact: dreq.impact || {},
      affectedAssignments: [assignmentId],
      actor: "director",
      pauseAssignments,
      nowMs,
    });
    setDispatchState(missionId, assignmentId, {
      providerLifecycle: "awaiting_decision",
      lastError: null,
      sessionId: finished.sessionId,
      connectorSessionId: finished.checkpoint?.connectorSessionId || finished.connectorSessionId,
    }, { nowMs });
    story(missionId, {
      type: "decision_requested",
      headline: "Decision required",
      summary: dreq.situation || "Claude paused for a product decision",
      assignmentId,
      phaseId: assignment.phaseId,
      actor: "director",
      detail: {
        sessionId: finished.sessionId,
        connectorSessionId: finished.checkpoint?.connectorSessionId || finished.connectorSessionId,
      },
      nowMs,
    });
    // Stop dependent dispatch — only this assignment is paused; dependents stay waiting.
    return {
      ok: false,
      error: "awaiting_decision",
      sessionId: finished.sessionId,
      decision: finished.decisionRequest,
    };
  }

  if (finished?.status !== "completed") {
    setDispatchState(missionId, assignmentId, {
      providerLifecycle: "failed",
      lastError: finished?.recovery?.lastError || "session_failed",
      sessionId: finished?.sessionId || session.sessionId,
    }, { nowMs });
    return { ok: false, error: "session_failed", sessionId: finished?.sessionId || session.sessionId };
  }

  setDispatchState(missionId, assignmentId, {
    providerLifecycle: "producing_evidence",
    sessionId: finished.sessionId,
  }, { nowMs });

  const pkg = finished.completionPackage || {};
  for (const ev of finished.evidence || []) {
    attachEvidence({
      missionId,
      assignmentId,
      type: ev.type || "log",
      title: ev.title || "Session evidence",
      description: ev.description || "",
      fileUri: ev.fileUri || null,
      acceptanceCriteriaIds: assignment.acceptanceCriteriaIds || [],
      createdBy: wid,
      nowMs,
    });
  }

  // Guarantee core evidence types for validation
  for (const type of ["log", "notes", "document"]) {
    const has = (finished.evidence || []).some((e) => e.type === type);
    if (!has) {
      attachEvidence({
        missionId,
        assignmentId,
        type,
        title: `${type} — ${assignment.title}`,
        description: pkg.summary || "Produced by Claude execution session",
        fileUri: (assignment.expectedDeliverables || [])[0] || null,
        acceptanceCriteriaIds: assignment.acceptanceCriteriaIds || [],
        createdBy: wid,
        nowMs,
      });
    }
  }

  const completion = submitWorkerCompletion({
    missionId,
    assignmentId,
    status: "complete",
    summary: pkg.summary || `Claude completed ${assignment.title}`,
    changesMade: pkg.filesModified || assignment.expectedDeliverables || [],
    acceptanceCriteriaResults: (assignment.acceptanceCriteriaIds || []).map((id) => ({
      id,
      status: "met",
    })),
    tests: pkg.tests?.ran ? [pkg.tests] : [],
    residualRisks: pkg.risks || pkg.unresolvedRisks || [],
    followUpItems: pkg.followUp || pkg.recommendedNextWork || [],
    confidence: "medium",
    recommendation: pkg.recommendation || "Accept deliverable",
    progressBoard: pkg.progressBoard || pkg.progress_board || null,
    nowMs,
  });

  if (!completion.ok && completion.error === "missing_evidence") {
    for (const missing of completion.missing || []) {
      attachEvidence({
        missionId,
        assignmentId,
        type: missing,
        title: `${missing} — ${assignment.title}`,
        description: pkg.summary || "Director recorded from Claude session",
        createdBy: actor,
        nowMs,
      });
    }
    submitWorkerCompletion({
      missionId,
      assignmentId,
      status: "complete",
      summary: pkg.summary || `Claude completed ${assignment.title}`,
      changesMade: pkg.filesModified || assignment.expectedDeliverables || [],
      acceptanceCriteriaResults: (assignment.acceptanceCriteriaIds || []).map((id) => ({ id, status: "met" })),
      confidence: "medium",
      recommendation: "Accept deliverable",
      progressBoard: pkg.progressBoard || pkg.progress_board || null,
      nowMs,
    });
  }

  const validated = validateAssignmentCompletion(missionId, assignmentId, { actor, nowMs });
  setDispatchState(missionId, assignmentId, {
    providerLifecycle: validated.validation?.passed ? "completed" : "failed",
    sessionId: finished.sessionId,
    completedAt: new Date(nowMs ?? Date.now()).toISOString(),
  }, { nowMs });

      if (validated.validation?.passed) {
        try {
          const { createDeliverableReview } = await import("./deliverable-review.mjs");
          createDeliverableReview(missionId, assignmentId, { actor, nowMs });
        } catch { /* review layer best-effort */ }
        try {
          const { scheduleImplementationChainContinue } = await import("./mission-advance.mjs");
          scheduleImplementationChainContinue(missionId, {
            fromAssignmentId: assignmentId,
            actor: "director",
            nowMs,
          });
        } catch { /* auto-continue best-effort */ }
        return {
          ok: true,
          assignmentId,
          provider: "claude",
          workerId: wid,
          sessionId: finished.sessionId,
          lifecycle: "completed",
          awaitingDeliverableReview: false,
          autoContinueScheduled: true,
        };
      }

  return { ok: false, error: "validation_failed", sessionId: finished.sessionId };
}

async function dispatchAssignmentInner(missionId, assignmentId, { slot, actor, nowMs }) {
  let assignment = getAssignment(missionId, assignmentId);
  if (!assignment) return { ok: false, error: "assignment_not_found" };
  if (assignment.status !== "ready" && assignment.status !== "failed") {
    return { ok: false, error: "not_dispatchable", status: assignment.status };
  }

  const context = buildMissionContextPackage(missionId, { phaseId: assignment.phaseId });
  if (!context) return { ok: false, error: "context_unavailable" };

  const built = buildAssignmentPackage(missionId, assignmentId);
  const prompt = serializeAssignmentPrompt(assignment, built?.context || context);

  story(missionId, {
    type: "assignment_started",
    headline: `Director assigned ${assignment.title}`,
    summary: `Director assigned ${assignment.title} for execution`,
    assignmentId,
    phaseId: assignment.phaseId,
    actor,
    detail: { technical: `dispatch ${assignmentId}` },
    nowMs,
  });

  const preferred = preferredProvider(missionId);
  // Real Claude path uses Execution Sessions (unless forced to mock).
  if (preferred === "claude" || (!process.env.VACILANDO_EXECUTION_PROVIDER && preferred !== "mock")) {
    const forced = process.env.VACILANDO_EXECUTION_PROVIDER?.trim();
    if (forced !== "mock" && forced !== "cursor") {
      return dispatchViaClaudeSession(missionId, assignmentId, { slot, actor, nowMs });
    }
  }

  const exclude = [];
  let lastError = null;

  for (let providerRound = 0; providerRound < 4; providerRound++) {
    const order = resolveProviderOrder({ preferred, exclude });
    const providerId = order[0];
    if (!providerId) break;
    if (providerId === "claude" && process.env.VACILANDO_EXECUTION_PROVIDER !== "mock") {
      return dispatchViaClaudeSession(missionId, assignmentId, { slot, actor, nowMs });
    }
    const provider = getProvider(providerId);
    if (!provider) {
      exclude.push(providerId);
      continue;
    }

    for (let attempt = 1; attempt <= MAX_ATTEMPTS_PER_PROVIDER; attempt++) {
      const wid = workerIdFor(providerId, slot ?? assignment.slot ?? 6);
      setDispatchState(missionId, assignmentId, {
        providerLifecycle: attempt === 1 ? "launching" : "retrying",
        currentProvider: providerId,
        workerId: wid,
        provider: providerId,
        attempt,
        attemptsTotal: ((assignment.dispatch?.attemptsTotal) || 0) + 1,
      }, { nowMs });

      story(missionId, {
        type: "worker_health",
        headline: attempt === 1
          ? `Launching ${provider.label}…`
          : `Retrying ${provider.label} (attempt ${attempt})…`,
        summary: `Director launching ${provider.label} for ${assignment.title}`,
        assignmentId,
        phaseId: assignment.phaseId,
        actor,
        detail: { provider: providerId, attempt, technical: `launch ${providerId} attempt ${attempt}` },
        nowMs,
      });

      const pre = await provider.precheck();
      if (!pre.ok) {
        lastError = pre.error || "precheck_failed";
        setDispatchState(missionId, assignmentId, {
          providerLifecycle: "unavailable",
          lastError,
        }, { nowMs });
        break; // try next provider
      }

      let acknowledged = false;
      const onAcknowledged = () => {
        if (acknowledged) return;
        acknowledged = true;
        const ack = acknowledgeWorkerContext({
          missionId,
          assignmentId,
          workerId: wid,
          missionVersion: context.missionVersion,
          missionContentHash: context.missionContentHash,
          provider: providerId,
          nowMs,
        });
        if (!ack.ok) {
          lastError = ack.error || ack.code || "ack_failed";
          return;
        }
        submitWorkerStartReport({
          missionId,
          assignmentId,
          understoodObjective: assignment.objective,
          intendedApproach: [`Director-dispatched via ${provider.label}`],
          filesOrSystemsExpectedToChange: assignment.expectedDeliverables || [],
          detectedRisks: [],
          nowMs,
        });
        setDispatchState(missionId, assignmentId, {
          providerLifecycle: "acknowledged",
          workerId: wid,
          provider: providerId,
          acknowledgedAt: new Date(nowMs ?? Date.now()).toISOString(),
        }, { nowMs });
        story(missionId, {
          type: "assignment_started",
          headline: `${provider.label} acknowledged assignment`,
          summary: `${provider.label} acknowledged ${assignment.title}`,
          assignmentId,
          phaseId: assignment.phaseId,
          actor: wid,
          detail: { provider: providerId },
          nowMs,
        });
        updateMission(missionId, {
          status: "running",
          provider: providerId,
          assignment_id: assignmentId,
          worker_slot: slot ?? assignment.slot ?? null,
        }, { nowMs });
      };

      const onActivity = (a) => {
        setDispatchState(missionId, assignmentId, { providerLifecycle: "running" }, { nowMs });
        recordHeartbeat({
          workerId: wid,
          missionId,
          assignmentId,
          slot: Number(slot ?? assignment.slot ?? 6) || 6,
          progress: true,
          provider: providerId,
          detail: a?.kind || a?.tool || null,
        });
        if (a?.kind === "assistant" && a.text) {
          reportWorkerProgress({
            missionId,
            assignmentId,
            summary: String(a.text).slice(0, 280),
            nowMs,
          });
          story(missionId, {
            type: "progress",
            headline: "Heartbeat received",
            summary: String(a.text).slice(0, 200),
            assignmentId,
            phaseId: assignment.phaseId,
            actor: wid,
            nowMs,
          });
        }
      };

      let result;
      try {
        result = await provider.dispatch({
          message: prompt,
          cwd: executionCwd(missionId),
          assignment,
          onAcknowledged,
          onActivity,
        });
      } catch (e) {
        result = { ok: false, status: "failed", error: String(e && e.message || e), evidence: [] };
      }

      if (!acknowledged && result?.pid) {
        // Provider started but callback missed — acknowledge from process accept.
        onAcknowledged();
      }

      if (result?.status === "unavailable" || (!result?.ok && result?.status === "unavailable")) {
        lastError = result.error || "unavailable";
        setDispatchState(missionId, assignmentId, { providerLifecycle: "unavailable", lastError }, { nowMs });
        break;
      }

      if (!result?.ok && result?.status !== "completed" && result?.status !== "waiting_for_operator") {
        lastError = result?.error || result?.status || "dispatch_failed";
        setDispatchState(missionId, assignmentId, {
          providerLifecycle: attempt < MAX_ATTEMPTS_PER_PROVIDER ? "retrying" : "failed",
          lastError,
        }, { nowMs });
        if (attempt < MAX_ATTEMPTS_PER_PROVIDER) continue;
        break;
      }

      // Success path — collect evidence + complete
      setDispatchState(missionId, assignmentId, { providerLifecycle: "producing_evidence" }, { nowMs });
      story(missionId, {
        type: "evidence_added",
        headline: "Evidence submitted",
        summary: `Director collected evidence for ${assignment.title}`,
        assignmentId,
        phaseId: assignment.phaseId,
        actor,
        nowMs,
      });

      const evidenceItems = (provider.collectEvidence || ((r) => r.evidence || []))(result, assignment);
      for (const ev of evidenceItems) {
        attachEvidence({
          missionId,
          assignmentId,
          type: ev.type || "log",
          title: ev.title || `${provider.label} evidence`,
          description: ev.description || result.summary || "",
          fileUri: ev.fileUri || null,
          acceptanceCriteriaIds: assignment.acceptanceCriteriaIds || [],
          createdBy: wid,
          nowMs,
        });
      }

      // Ensure completion can pass V1 evidence gate (log minimum)
      const completion = submitWorkerCompletion({
        missionId,
        assignmentId,
        status: result.status === "waiting_for_operator" ? "blocked" : "complete",
        summary: result.summary || `${provider.label} finished ${assignment.title}`,
        changesMade: result.changedFiles || assignment.expectedDeliverables || [],
        acceptanceCriteriaResults: (assignment.acceptanceCriteriaIds || []).map((id) => ({
          id,
          status: result.ok ? "met" : "partial",
        })),
        evidence: [],
        residualRisks: result.status === "waiting_for_operator" ? ["Provider waiting on operator"] : [],
        confidence: result.ok ? "medium" : "low",
        recommendation: result.ok ? "Accept deliverable" : "Review provider output",
        nowMs,
      });

      if (!completion.ok && completion.error === "missing_evidence") {
        // Attach any still-missing as log stubs from Director (honest: provider returned without typed evidence)
        for (const missing of completion.missing || []) {
          attachEvidence({
            missionId,
            assignmentId,
            type: missing,
            title: `${missing} evidence — ${assignment.title}`,
            description: `Director recorded ${missing} from ${provider.label} turn: ${result.summary || "no summary"}`,
            createdBy: actor,
            nowMs,
          });
        }
        submitWorkerCompletion({
          missionId,
          assignmentId,
          status: "complete",
          summary: result.summary || `${provider.label} finished ${assignment.title}`,
          changesMade: result.changedFiles || assignment.expectedDeliverables || [],
          acceptanceCriteriaResults: (assignment.acceptanceCriteriaIds || []).map((id) => ({
            id,
            status: "met",
          })),
          confidence: "medium",
          recommendation: "Accept deliverable",
          nowMs,
        });
      }

      if (result.status === "waiting_for_operator") {
        setDispatchState(missionId, assignmentId, { providerLifecycle: "failed", lastError: "waiting_for_operator" }, { nowMs });
        return { ok: false, error: "waiting_for_operator", assignmentId, provider: providerId };
      }

      const validated = validateAssignmentCompletion(missionId, assignmentId, { actor, nowMs });
      setDispatchState(missionId, assignmentId, {
        providerLifecycle: validated.validation?.passed ? "completed" : "failed",
        completedAt: new Date(nowMs ?? Date.now()).toISOString(),
      }, { nowMs });

      if (validated.validation?.passed) {
        try {
          const { createDeliverableReview } = await import("./deliverable-review.mjs");
          createDeliverableReview(missionId, assignmentId, { actor, nowMs });
        } catch { /* review layer best-effort */ }
        try {
          const { scheduleImplementationChainContinue } = await import("./mission-advance.mjs");
          scheduleImplementationChainContinue(missionId, {
            fromAssignmentId: assignmentId,
            actor: "director",
            nowMs,
          });
        } catch { /* auto-continue best-effort */ }
        return {
          ok: true,
          assignmentId,
          provider: providerId,
          workerId: wid,
          lifecycle: "completed",
          autoContinueScheduled: true,
        };
      }

      lastError = "validation_failed";
      if (attempt < MAX_ATTEMPTS_PER_PROVIDER) continue;
    }

    exclude.push(providerId);
  }

  setDispatchState(missionId, assignmentId, {
    providerLifecycle: "failed",
    lastError: lastError || "all_providers_failed",
  }, { nowMs });
  story(missionId, {
    type: "blocker",
    headline: "Director could not launch a worker",
    summary: `All providers failed for ${assignment.title}: ${lastError || "unknown"}`,
    assignmentId,
    phaseId: assignment.phaseId,
    actor,
    detail: { lastError },
    nowMs,
  });
  return { ok: false, error: "all_providers_failed", detail: lastError, assignmentId };
}

/** Schedule dispatch without blocking the approve HTTP response. */
/**
 * After an operator answers a Decision — resume the paused Claude session.
 */
export async function resumeAfterDecisionAnswer({
  missionId,
  assignmentIds = [],
  decision = null,
  chosenOptionId = null,
  response = null,
  slot = null,
  actor = "director",
  nowMs,
} = {}) {
  const results = [];
  for (const assignmentId of assignmentIds) {
    const session = getResumableSession(missionId, assignmentId)
      || getActiveSessionForAssignment(missionId, assignmentId);
    if (!session) {
      // No session to resume — normal dispatch of ready assignment
      results.push(await dispatchAssignment(missionId, assignmentId, { slot, actor, nowMs }));
      continue;
    }
    appendDecisionAnswer(session.sessionId, {
      decisionId: decision?.decisionId || null,
      chosenOptionId,
      response,
      title: decision?.title || null,
    }, { nowMs });

    const key = `${missionId}:${assignmentId}`;
    if (activeDispatches.has(key)) {
      results.push({ ok: false, error: "dispatch_in_progress", assignmentId });
      continue;
    }
    activeDispatches.add(key);
    try {
      const finished = await resumeClaudeAfterDecision(getExecutionSession(session.sessionId), {
        decision,
        chosenOptionId,
        response,
        cwd: executionCwd(missionId),
        nowMs,
        onProgress: () => {
          setDispatchState(missionId, assignmentId, { providerLifecycle: "running" }, { nowMs });
          recordHeartbeat({
            workerId: session.workerId || workerIdFor("claude", slot ?? 6),
            missionId,
            assignmentId,
            slot: Number(slot ?? 6) || 6,
            progress: true,
            provider: "claude",
          });
        },
      });

      if (finished?.status === "awaiting_decision") {
        results.push({ ok: false, error: "awaiting_decision", sessionId: finished.sessionId });
        continue;
      }
      if (finished?.status !== "completed") {
        results.push({ ok: false, error: "resume_failed", sessionId: finished?.sessionId });
        continue;
      }

      // Reuse completion path via a nested call pattern: attach evidence + validate
      const assignment = getAssignment(missionId, assignmentId);
      const wid = session.workerId || workerIdFor("claude", slot ?? 6);
      const pkg = finished.completionPackage || {};
      for (const ev of finished.evidence || []) {
        attachEvidence({
          missionId,
          assignmentId,
          type: ev.type || "log",
          title: ev.title || "Session evidence",
          description: ev.description || "",
          fileUri: ev.fileUri || null,
          acceptanceCriteriaIds: assignment?.acceptanceCriteriaIds || [],
          createdBy: wid,
          nowMs,
        });
      }
      for (const type of ["log", "notes", "document"]) {
        attachEvidence({
          missionId,
          assignmentId,
          type,
          title: `${type} — ${assignment?.title || assignmentId}`,
          description: pkg.summary || "Resumed Claude session",
          fileUri: (assignment?.expectedDeliverables || [])[0] || null,
          acceptanceCriteriaIds: assignment?.acceptanceCriteriaIds || [],
          createdBy: wid,
          nowMs,
        });
      }
      submitWorkerCompletion({
        missionId,
        assignmentId,
        status: "complete",
        summary: pkg.summary || "Claude completed after decision resume",
        changesMade: pkg.filesModified || assignment?.expectedDeliverables || [],
        acceptanceCriteriaResults: (assignment?.acceptanceCriteriaIds || []).map((id) => ({ id, status: "met" })),
        confidence: "medium",
        recommendation: pkg.recommendation || "Accept deliverable",
        progressBoard: pkg.progressBoard || pkg.progress_board || null,
        nowMs,
      });
      const validated = validateAssignmentCompletion(missionId, assignmentId, { actor, nowMs });
      setDispatchState(missionId, assignmentId, {
        providerLifecycle: validated.validation?.passed ? "completed" : "failed",
        sessionId: finished.sessionId,
      }, { nowMs });
      if (validated.validation?.passed) {
        try {
          const { createDeliverableReview } = await import("./deliverable-review.mjs");
          createDeliverableReview(missionId, assignmentId, { actor, nowMs });
        } catch { /* review layer best-effort */ }
        try {
          const { scheduleImplementationChainContinue } = await import("./mission-advance.mjs");
          scheduleImplementationChainContinue(missionId, {
            fromAssignmentId: assignmentId,
            actor: "director",
            nowMs,
          });
        } catch { /* auto-continue best-effort */ }
      }
      results.push({ ok: Boolean(validated.validation?.passed), sessionId: finished.sessionId, resumed: true });
    } finally {
      activeDispatches.delete(key);
    }
  }
  return { ok: true, results };
}

export function scheduleDispatchAfterKickoff(missionId, opts = {}) {
  if (process.env.VACILANDO_AUTO_DISPATCH === "0") {
    return { ok: true, scheduled: false, skipped: true, missionId };
  }
  if (opts.await === true) return dispatchReadyAssignments(missionId, opts);
  const run = () => {
    dispatchReadyAssignments(missionId, opts).catch((e) => {
      try {
        appendTimelineEvent(missionId, {
          type: "blocker",
          headline: "Director dispatch failed to start",
          summary: String(e && e.message || e),
          visibility: "summary",
          actor: "director",
        });
      } catch { /* */ }
    });
  };
  setTimeout(run, opts.delayMs ?? 10);
  return { ok: true, scheduled: true, missionId };
}

export function providerLifecycleLabel(state) {
  return PROVIDER_LIFECYCLE_LABELS[state] || state || "Queued";
}
