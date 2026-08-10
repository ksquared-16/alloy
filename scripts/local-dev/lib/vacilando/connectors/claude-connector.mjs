/**
 * Vacilando — Claude Execution Connector.
 *
 * Runs an Execution Session against the Claude CLI. Director never talks to
 * the process directly — only through the session + this connector.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { precheckProvider } from "../provider-runtime.mjs";
import { startMissionTurn } from "../providers.mjs";
import { REPO_ROOT } from "../knowledge.mjs";
import { getAssignment, serializeAssignmentPrompt, buildAssignmentPackage } from "../worker-assignment.mjs";
import { buildMissionContextPackage } from "../mission-context.mjs";
import { getBrief } from "../mission-brief.mjs";
import {
  updateExecutionSession,
  markSessionHeartbeat,
  classifyProgressActivity,
  parseExecutionOutcome,
  appendSessionEvidence,
  persistDecisionCheckpoint,
  getExecutionSession,
} from "../execution-session.mjs";
import {
  collectWorkspaceEvidence,
  buildCompletionPackage,
  gitHead,
} from "../execution-evidence.mjs";
import { appendTimelineEvent } from "../timeline.mjs";

function story(missionId, fields) {
  appendTimelineEvent(missionId, {
    visibility: "summary",
    actor: "claude",
    ...fields,
  });
}

function buildClaudeSessionPrompt({ assignment, context, envelope, brief }) {
  const outputs = (assignment.expectedDeliverables || []).map((p) => `- ${p}`).join("\n") || "- (document findings in the mission notes)";
  return `${envelope}

---
[VACILANDO EXECUTION SESSION — CLAUDE]
You are executing ONE deliverable inside a Director-managed mission.
Work in this repository. Do not push, merge, or open PRs.

Required outputs for this deliverable:
${outputs}

Progress: briefly narrate what you are doing (reading, inventorying, writing, testing).
When you need a product decision, stop and emit:
\`\`\`vacilando-decision
{ "title": "...", "situation": "...", "whyThisMatters": "...", "recommendation": "...",
  "options": [{"optionId":"a","label":"...","description":"..."},{"optionId":"b","label":"...","description":"..."}],
  "recommendationReason": "..." }
\`\`\`
then <<VACILANDO status=waiting_for_operator>>

When the deliverable is done, emit:
\`\`\`vacilando-report
{ "implementation_summary": "...",
  "changed_files": [],
  "tests": {"ran": false, "results": null},
  "deliverables": [{"id":"D1","produced":true,"path":"..."}],
  "criterion_evidence": [{"criterion_id":"AC1","status":"met","evidence_ref":"..."}],
  "residual_risks": [],
  "follow_up_items": [],
  "provider_completion_claim": true }
\`\`\`
then <<VACILANDO status=completed>>

Mission: ${brief?.title || assignment.missionId}
Phase: ${assignment.title}
Context version: v${context.missionVersion} hash ${context.missionContentHash}
`.trim();
}

/**
 * Start Claude for an execution session. Resolves when the turn ends.
 * @returns {Promise<object>} updated session outcome
 */
export async function runClaudeExecutionSession(session, {
  cwd = null,
  maxTurnMs = Number(process.env.VACILANDO_CLAUDE_TURN_MAX_MS) || 25 * 60 * 1000,
  inactivityMs = Number(process.env.VACILANDO_CLAUDE_INACTIVITY_MS) || 5 * 60 * 1000,
  allowBash = true,
  onProgress = null,
  nowMs,
} = {}) {
  const missionId = session.missionId;
  const assignmentId = session.assignmentId;
  const assignment = getAssignment(missionId, assignmentId);
  if (!assignment) {
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      recovery: { attempts: session.recovery?.attempts || 0, lastError: "assignment_not_found" },
    }, { nowMs });
  }

  const auth = await precheckProvider("claude", { force: true });
  if (!auth.ok) {
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      recovery: { ...session.recovery, lastError: auth.error || "claude_unauthenticated" },
    }, { nowMs });
  }

  const context = buildMissionContextPackage(missionId, { phaseId: assignment.phaseId });
  const built = buildAssignmentPackage(missionId, assignmentId);
  const envelope = serializeAssignmentPrompt(assignment, built?.context || context);
  const brief = getBrief(missionId);
  const workCwd = cwd || session.cwd || REPO_ROOT;
  if (!existsSync(workCwd)) {
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      recovery: { ...session.recovery, lastError: "cwd_missing" },
    }, { nowMs });
  }

  // Ensure deliverable parent dirs exist
  for (const rel of assignment.expectedDeliverables || []) {
    try {
      const { mkdirSync } = await import("node:fs");
      mkdirSync(join(workCwd, rel, ".."), { recursive: true });
    } catch { /* */ }
  }

  updateExecutionSession(session.sessionId, {
    status: "starting",
    started_at: new Date(nowMs ?? Date.now()).toISOString(),
    cwd: workCwd,
    progress: { activity: "Starting Claude", percent: 2 },
  }, { nowMs });

  story(missionId, {
    type: "assignment_started",
    headline: "Director launched Claude",
    summary: `Director launched Claude for ${assignment.title}`,
    assignmentId,
    phaseId: assignment.phaseId,
    actor: "director",
    detail: { sessionId: session.sessionId, connector: "claude" },
    nowMs,
  });

  const prompt = buildClaudeSessionPrompt({ assignment, context, envelope, brief });
  let filesInspected = session.progress?.filesInspected || 0;
  let lastStoryActivity = null;
  let lastStoryAt = 0;
  const STORY_MIN_MS = 90_000;
  let handle = null;
  const headBefore = gitHead(workCwd);

  handle = startMissionTurn({
    provider: "claude",
    message: prompt,
    cwd: workCwd,
    resume: session.connectorSessionId || null,
    maxTurnMs,
    inactivityMs,
    allowBash,
    onActivity: (a) => {
      if (a.session_id) {
        updateExecutionSession(session.sessionId, {
          connectorSessionId: a.session_id,
          pid: handle?.pid ?? null,
        }, { nowMs });
      }
      const classified = classifyProgressActivity(a);
      if (classified.bumpFiles) filesInspected += 1;
      const percent = Math.min(90, 5 + filesInspected * 3 + (classified.activity === "Writing specification" ? 20 : 0));
      markSessionHeartbeat(session.sessionId, {
        activity: classified.activity,
        detail: classified.detail || null,
        percent,
        filesInspected,
        estimatedCheckpointLabel: percent < 40 ? "about 8 minutes" : percent < 70 ? "about 4 minutes" : "about 2 minutes",
        nowMs,
      });
      try {
        onProgress?.({ sessionId: session.sessionId, pid: handle?.pid ?? null });
      } catch { /* */ }

      // Timeline stories are for audit — throttle so conversation isn't a heartbeat feed.
      // The live progress card reads session heartbeats directly.
      if (classified.activity !== lastStoryActivity && classified.activity !== "Executing") {
        const stamp = Date.now();
        const materialPause = /waiting for approval/i.test(classified.activity);
        if (materialPause || stamp - lastStoryAt >= STORY_MIN_MS) {
          lastStoryActivity = classified.activity;
          lastStoryAt = stamp;
          story(missionId, {
            type: "progress",
            headline: `Claude is ${classified.activity.toLowerCase()}`,
            summary: classified.detail || classified.activity,
            assignmentId,
            phaseId: assignment.phaseId,
            actor: "claude",
            detail: { sessionId: session.sessionId, tool: a.tool || null },
            nowMs,
          });
        } else {
          lastStoryActivity = classified.activity;
        }
      }
    },
  });

  updateExecutionSession(session.sessionId, {
    status: "running",
    pid: handle.pid,
    progress: { activity: "Executing", percent: 5 },
  }, { nowMs });

  const result = await handle.done;
  const outcome = parseExecutionOutcome(result.text || "");

  if (result.usage) {
    updateExecutionSession(session.sessionId, {
      cost: {
        input_tokens: result.usage.input_tokens ?? null,
        output_tokens: result.usage.output_tokens ?? null,
        cost_usd: result.usage.cost_usd ?? null,
      },
      connectorSessionId: result.session_id || session.connectorSessionId,
    }, { nowMs });
  }

  if (result.timed_out || result.is_error || result.ok === false && !outcome.status) {
    story(missionId, {
      type: "blocker",
      headline: "Claude session failed",
      summary: result.error || "Claude exited without a completion token",
      assignmentId,
      phaseId: assignment.phaseId,
      actor: "director",
      nowMs,
    });
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      completed_at: new Date(nowMs ?? Date.now()).toISOString(),
      recovery: {
        attempts: (session.recovery?.attempts || 0) + 1,
        lastError: result.error || "claude_turn_failed",
      },
      logLine: result.error || "failed",
    }, { nowMs });
  }

  if (outcome.status === "waiting_for_operator" || outcome.decision) {
    story(missionId, {
      type: "decision_requested",
      headline: "Claude requires a product decision",
      summary: outcome.decision?.situation || outcome.summary,
      assignmentId,
      phaseId: assignment.phaseId,
      actor: "claude",
      nowMs,
    });
    const live = getExecutionSession(session.sessionId);
    return persistDecisionCheckpoint(session.sessionId, {
      decisionRequest: outcome.decision,
      connectorSessionId: result.session_id || live?.connectorSessionId || session.connectorSessionId,
      progressSnapshot: {
        activity: "Waiting for approval",
        percent: filesInspected ? Math.min(85, 10 + filesInspected * 3) : 50,
        filesInspected,
      },
      pausedWork: assignment.title,
      nowMs,
    });
  }

  updateExecutionSession(session.sessionId, {
    status: "producing_evidence",
    progress: { activity: "Collecting evidence", percent: 92 },
  }, { nowMs });

  const report = outcome.report || {};
  const claimed = report.changed_files || [];
  const deliverablePaths = (report.deliverables || [])
    .map((d) => d.path)
    .filter(Boolean)
    .concat(assignment.expectedDeliverables || []);
  const summary = outcome.summary || report.implementation_summary || `Claude completed ${assignment.title}`;

  const workspaceEvidence = collectWorkspaceEvidence({
    cwd: workCwd,
    claimedFiles: claimed,
    deliverablePaths,
    summary,
    tests: report.tests || null,
    commitsBefore: headBefore,
  });

  const evidence = [
    {
      type: "log",
      title: `Claude session — ${assignment.title}`,
      description: summary,
    },
    ...workspaceEvidence,
  ];

  // Deduplicate by type+title+fileUri
  const seen = new Set();
  const uniqueEvidence = [];
  for (const ev of evidence) {
    const k = `${ev.type}|${ev.title}|${ev.fileUri || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    uniqueEvidence.push(ev);
  }

  for (const ev of uniqueEvidence) {
    appendSessionEvidence(session.sessionId, ev, { nowMs });
  }

  const filesModified = [...new Set([
    ...claimed,
    ...uniqueEvidence.filter((e) => e.fileUri).map((e) => e.fileUri),
  ])];

  const completionPackage = buildCompletionPackage({
    summary,
    outcome: "complete",
    filesModified,
    evidence: uniqueEvidence,
    tests: report.tests || { ran: false, results: null },
    validation: report.criterion_evidence || [],
    decisions: (getExecutionSession(session.sessionId)?.decisionAnswers || []).map((a) => ({
      chosen: a.chosenOptionId,
      response: a.response,
    })),
    risks: report.residual_risks || [],
    followUp: report.follow_up_items || [],
    recommendation: report.recommendation || "Accept deliverable",
  });
  completionPackage.deliverables = report.deliverables || [];

  story(missionId, {
    type: "evidence_added",
    headline: "Evidence submitted",
    summary: `Claude submitted ${uniqueEvidence.length} evidence artifact(s) for ${assignment.title}`,
    assignmentId,
    phaseId: assignment.phaseId,
    actor: "claude",
    nowMs,
  });

  story(missionId, {
    type: "assignment_completed",
    headline: `Claude completed ${assignment.title}`,
    summary: completionPackage.summary,
    assignmentId,
    phaseId: assignment.phaseId,
    actor: "claude",
    nowMs,
  });

  return updateExecutionSession(session.sessionId, {
    status: "completed",
    completed_at: new Date(nowMs ?? Date.now()).toISOString(),
    completionPackage,
    evidence: uniqueEvidence,
    progress: { activity: "Completed", percent: 100 },
  }, { nowMs });
}

/**
 * Resume after operator decision — prefer prior Claude session id.
 */
export async function resumeClaudeAfterDecision(session, {
  decision,
  chosenOptionId,
  response,
  cwd = null,
  nowMs,
  onProgress = null,
} = {}) {
  const missionId = session.missionId;
  const assignment = getAssignment(missionId, session.assignmentId);
  const workCwd = cwd || session.cwd || REPO_ROOT;
  const resumeId = session.checkpoint?.connectorSessionId || session.connectorSessionId;
  const answerText = [
    "[VACILANDO DECISION ANSWER]",
    `Decision: ${decision?.title || "Operator decision"}`,
    `Chosen option: ${chosenOptionId || "(none)"}`,
    `Operator response (verbatim):`,
    String(response || chosenOptionId || ""),
    "",
    `Situation was: ${decision?.situation || ""}`,
    `Recommendation was: ${decision?.recommendation || ""}`,
    "",
    "Continue the paused work with this decision applied. Do not re-ask the same question.",
    "When done, emit vacilando-report + <<VACILANDO status=completed>>.",
  ].join("\n");

  updateExecutionSession(session.sessionId, {
    status: "retrying",
    progress: { activity: "Resuming after decision", percent: session.progress?.percent || 50 },
  }, { nowMs });

  if (resumeId) {
    story(missionId, {
      type: "assignment_started",
      headline: "Claude resumed its session",
      summary: `Director resumed the prior Claude session after the decision was answered`,
      assignmentId: session.assignmentId,
      phaseId: assignment?.phaseId,
      actor: "director",
      detail: { sessionId: session.sessionId, connectorSessionId: resumeId, mode: "resume" },
      nowMs,
    });
    const resumed = {
      ...getExecutionSession(session.sessionId),
      connectorSessionId: resumeId,
    };
    // Inject resume message by temporarily swapping prompt builder via session field
    return runClaudeExecutionSessionWithMessage(resumed, answerText, {
      cwd: workCwd,
      resume: resumeId,
      onProgress,
      nowMs,
      resumeMode: "resume",
    });
  }

  story(missionId, {
    type: "assignment_started",
    headline: "Replacement Claude session launched with prior context",
    summary: "Prior Claude session was not resumable — Director launched a replacement with the full recovery package",
    assignmentId: session.assignmentId,
    phaseId: assignment?.phaseId,
    actor: "director",
    detail: { sessionId: session.sessionId, mode: "replacement" },
    nowMs,
  });

  const recoveryPackage = [
    "[VACILANDO RECOVERY PACKAGE]",
    `Mission: ${missionId}`,
    `Assignment: ${assignment?.title || session.assignmentId}`,
    `Paused work: ${session.checkpoint?.pausedWork || assignment?.objective || ""}`,
    `Prior decision: ${JSON.stringify(session.decisionRequest || {}, null, 2)}`,
    `Operator answer: ${chosenOptionId} — ${response || ""}`,
    `Prior progress: ${JSON.stringify(session.checkpoint?.progress || session.progress || {}, null, 2)}`,
    "",
    "Continue from this checkpoint. Produce the required deliverables.",
    answerText,
  ].join("\n");

  return runClaudeExecutionSessionWithMessage(session, recoveryPackage, {
    cwd: workCwd,
    resume: null,
    onProgress,
    nowMs,
    resumeMode: "replacement",
  });
}

/** Internal: run a turn with an explicit message (resume / replacement). */
async function runClaudeExecutionSessionWithMessage(session, message, {
  cwd,
  resume = null,
  onProgress = null,
  nowMs,
  resumeMode = "resume",
  maxTurnMs = Number(process.env.VACILANDO_CLAUDE_TURN_MAX_MS) || 25 * 60 * 1000,
  inactivityMs = Number(process.env.VACILANDO_CLAUDE_INACTIVITY_MS) || 5 * 60 * 1000,
} = {}) {
  // Re-enter the main runner by stashing the message on a synthetic session update
  // then calling the normal path with a patched prompt override via env-free closure.
  const patched = { ...getExecutionSession(session.sessionId), connectorSessionId: resume };
  updateExecutionSession(session.sessionId, {
    status: "running",
    connectorSessionId: resume,
    recovery: {
      ...(patched.recovery || {}),
      resumeMode,
      lastError: null,
    },
  }, { nowMs });

  const assignment = getAssignment(session.missionId, session.assignmentId);
  if (!assignment) {
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      recovery: { lastError: "assignment_not_found" },
    }, { nowMs });
  }

  const auth = await precheckProvider("claude", { force: true });
  if (!auth.ok) {
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      recovery: { lastError: auth.error || "claude_unauthenticated" },
    }, { nowMs });
  }

  const workCwd = cwd || session.cwd || REPO_ROOT;
  const headBefore = gitHead(workCwd);
  let filesInspected = session.progress?.filesInspected || 0;
  let lastStoryActivity = null;
  let handle = null;

  handle = startMissionTurn({
    provider: "claude",
    message,
    cwd: workCwd,
    resume,
    maxTurnMs,
    inactivityMs,
    allowBash: true,
    onActivity: (a) => {
      if (a.session_id) {
        updateExecutionSession(session.sessionId, {
          connectorSessionId: a.session_id,
          pid: handle?.pid ?? null,
        }, { nowMs });
      }
      const classified = classifyProgressActivity(a);
      if (classified.bumpFiles) filesInspected += 1;
      markSessionHeartbeat(session.sessionId, {
        activity: classified.activity,
        detail: classified.detail || null,
        percent: Math.min(90, 5 + filesInspected * 3),
        filesInspected,
        nowMs,
      });
      try { onProgress?.({ sessionId: session.sessionId, pid: handle?.pid }); } catch { /* */ }
      if (classified.activity !== lastStoryActivity && classified.activity !== "Executing") {
        lastStoryActivity = classified.activity;
        story(session.missionId, {
          type: "progress",
          headline: `Claude is ${classified.activity.toLowerCase()}`,
          summary: classified.detail || classified.activity,
          assignmentId: session.assignmentId,
          phaseId: assignment.phaseId,
          actor: "claude",
          nowMs,
        });
      }
    },
  });

  updateExecutionSession(session.sessionId, {
    status: "running",
    pid: handle.pid,
  }, { nowMs });

  const result = await handle.done;
  const outcome = parseExecutionOutcome(result.text || "");

  if (result.timed_out || (result.is_error && !outcome.status)) {
    return updateExecutionSession(session.sessionId, {
      status: "failed",
      recovery: { lastError: result.error || "resume_turn_failed" },
    }, { nowMs });
  }

  if (outcome.status === "waiting_for_operator" || outcome.decision) {
    return persistDecisionCheckpoint(session.sessionId, {
      decisionRequest: outcome.decision,
      connectorSessionId: result.session_id || resume,
      nowMs,
    });
  }

  const report = outcome.report || {};
  const summary = outcome.summary || report.implementation_summary || `Claude completed ${assignment.title}`;
  const workspaceEvidence = collectWorkspaceEvidence({
    cwd: workCwd,
    claimedFiles: report.changed_files || [],
    deliverablePaths: (assignment.expectedDeliverables || []),
    summary,
    tests: report.tests || null,
    commitsBefore: headBefore,
  });
  for (const ev of workspaceEvidence) appendSessionEvidence(session.sessionId, ev, { nowMs });

  const completionPackage = buildCompletionPackage({
    summary,
    filesModified: report.changed_files || [],
    evidence: workspaceEvidence,
    tests: report.tests || { ran: false },
    validation: report.criterion_evidence || [],
    risks: report.residual_risks || [],
    followUp: report.follow_up_items || [],
  });

  return updateExecutionSession(session.sessionId, {
    status: "completed",
    completed_at: new Date(nowMs ?? Date.now()).toISOString(),
    completionPackage,
    progress: { activity: "Completed", percent: 100 },
  }, { nowMs });
}

export async function precheckClaudeConnector() {
  return precheckProvider("claude", { force: true });
}
