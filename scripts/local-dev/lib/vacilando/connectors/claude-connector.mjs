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
} from "../execution-session.mjs";
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
  let handle = null;

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

      if (classified.activity !== lastStoryActivity && classified.activity !== "Executing") {
        lastStoryActivity = classified.activity;
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
    return updateExecutionSession(session.sessionId, {
      status: "awaiting_decision",
      decisionRequest: outcome.decision,
      completionPackage: null,
      progress: { activity: "Waiting for approval", percent: filesInspected ? Math.min(85, 10 + filesInspected * 3) : 50 },
    }, { nowMs });
  }

  updateExecutionSession(session.sessionId, {
    status: "producing_evidence",
    progress: { activity: "Collecting evidence", percent: 92 },
  }, { nowMs });

  const report = outcome.report || {};
  const changed = report.changed_files || [];
  const completionPackage = {
    summary: outcome.summary || report.implementation_summary || `Claude completed ${assignment.title}`,
    filesModified: changed,
    tests: report.tests || { ran: false, results: null },
    validation: report.criterion_evidence || [],
    risks: report.residual_risks || [],
    followUp: report.follow_up_items || [],
    deliverables: report.deliverables || [],
    recommendation: report.recommendation || "Accept deliverable",
  };

  const evidence = [];
  evidence.push({
    type: "log",
    title: `Claude session — ${assignment.title}`,
    description: completionPackage.summary,
  });
  evidence.push({
    type: "notes",
    title: `Completion notes — ${assignment.title}`,
    description: completionPackage.summary,
  });
  for (const path of changed) {
    evidence.push({
      type: path.endsWith(".md") ? "document" : "diff",
      title: `Changed ${path}`,
      description: `Claude modified ${path}`,
      fileUri: path,
    });
  }
  for (const d of completionPackage.deliverables || []) {
    if (d.path) {
      evidence.push({
        type: "document",
        title: d.id ? `${d.id}: ${d.path}` : d.path,
        description: d.produced ? "Deliverable produced" : "Deliverable claimed",
        fileUri: d.path,
      });
    }
  }
  if (report.tests?.ran) {
    evidence.push({
      type: "test",
      title: "Tests executed",
      description: JSON.stringify(report.tests.results || report.tests).slice(0, 500),
    });
  }

  for (const ev of evidence) {
    appendSessionEvidence(session.sessionId, ev, { nowMs });
  }

  story(missionId, {
    type: "evidence_added",
    headline: "Evidence submitted",
    summary: `Claude submitted evidence for ${assignment.title}`,
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
    progress: { activity: "Completed", percent: 100 },
  }, { nowMs });
}

export async function precheckClaudeConnector() {
  return precheckProvider("claude", { force: true });
}
