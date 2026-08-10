/**
 * Vacilando — Execution Session (durable unit of work).
 *
 * Director → Execution Session → Execution Connector → Claude (or other engine).
 *
 * The session owns mission/assignment binding, status, heartbeat, progress,
 * evidence, timeline hooks, cost, logs, and recovery — not a raw shell PID.
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "execution-sessions");

export const SESSION_STATUSES = Object.freeze([
  "queued",
  "starting",
  "running",
  "recovering",
  "recovered",
  "interrupted",
  "lost",
  "retrying",
  "awaiting_decision",
  "awaiting_operator",
  "producing_evidence",
  "completed",
  "failed",
  "paused",
  "cancelled",
]);

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(id) {
  return join(DIR, `${id}.json`);
}

function persist(session) {
  ensureDir();
  writeFileSync(fileFor(session.sessionId), JSON.stringify(session, null, 2));
  return session;
}

export function createExecutionSession({
  missionId,
  assignmentId,
  connector = "claude",
  workerId = null,
  slot = null,
  cwd = null,
  nowMs,
} = {}) {
  if (!missionId || !assignmentId) throw new Error("session_requires_mission_and_assignment");
  const sessionId = "exs_" + createHash("sha256")
    .update(`${missionId}:${assignmentId}:${Date.now()}:${randomBytes(4).toString("hex")}`)
    .digest("hex")
    .slice(0, 16);
  const session = {
    schema_version: "vacilando.execution_session.v1",
    sessionId,
    missionId,
    assignmentId,
    connector,
    workerId: workerId || `${connector}-${slot ?? 6}`,
    slot: slot ?? null,
    cwd: cwd || null,
    status: "queued",
    connectorSessionId: null,
    pid: null,
    progress: {
      activity: "Queued",
      detail: null,
      percent: 0,
      filesInspected: 0,
      lastHeartbeatAt: null,
      estimatedCheckpointLabel: null,
    },
    evidence: [],
    cost: { input_tokens: null, output_tokens: null, cost_usd: null },
    logs: [],
    completionPackage: null,
    decisionRequest: null,
    /** Durable pause checkpoint for decision resume. */
    checkpoint: null,
    decisionAnswers: [],
    recovery: { attempts: 0, lastError: null },
    created_at: iso(nowMs),
    updated_at: iso(nowMs),
    started_at: null,
    completed_at: null,
  };
  return persist(session);
}

export function getExecutionSession(sessionId) {
  try {
    return JSON.parse(readFileSync(fileFor(sessionId), "utf8"));
  } catch {
    return null;
  }
}

export function listExecutionSessions({ missionId = null, assignmentId = null, status = null, limit = 100 } = {}) {
  ensureDir();
  let items = [];
  try {
    for (const name of readdirSync(DIR).filter((n) => n.endsWith(".json"))) {
      try {
        items.push(JSON.parse(readFileSync(join(DIR, name), "utf8")));
      } catch { /* skip */ }
    }
  } catch {
    return [];
  }
  if (missionId) items = items.filter((s) => s.missionId === missionId);
  if (assignmentId) items = items.filter((s) => s.assignmentId === assignmentId);
  if (status) items = items.filter((s) => s.status === status);
  return items
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, limit);
}

export function getActiveSessionForAssignment(missionId, assignmentId) {
  return listExecutionSessions({ missionId, assignmentId }).find((s) =>
    isSessionActuallyLive(s))
    || null;
}

/** Heartbeat / completion honesty — a "running" row can be a zombie after restart. */
export const SESSION_STALE_HEARTBEAT_MS = 3 * 60 * 1000;

export function isSessionActuallyLive(session, { nowMs = Date.now() } = {}) {
  if (!session) return false;
  const status = String(session.status || "");
  const activeish = [
    "queued", "starting", "running", "recovering", "recovered", "retrying",
    "awaiting_decision", "awaiting_operator", "producing_evidence", "paused", "interrupted",
  ];
  if (!activeish.includes(status)) return false;
  // Terminal facts written while status was never flipped.
  if (session.completed_at && ["running", "starting", "queued", "retrying", "recovering", "producing_evidence"].includes(status)) {
    return false;
  }
  if (["awaiting_decision", "awaiting_operator", "paused"].includes(status)) return true;
  const hb = session.progress?.lastHeartbeatAt || session.updated_at || session.started_at;
  if (!hb) {
    // Brand-new sessions may not have heartbeated yet — allow a short grace.
    const created = Date.parse(session.created_at || session.started_at || 0);
    if (Number.isFinite(created) && nowMs - created < 90_000) return true;
    return false;
  }
  const age = nowMs - Date.parse(hb);
  if (!Number.isFinite(age)) return false;
  if (age > SESSION_STALE_HEARTBEAT_MS) return false;
  return true;
}

/**
 * Flip zombie "running" sessions to failed so posture/recovery can relaunch.
 * Returns sessions that were reconciled.
 */
export function reconcileZombieSessions({ missionId = null, nowMs = Date.now() } = {}) {
  const rows = listExecutionSessions({ missionId, limit: 200 }) || [];
  const fixed = [];
  for (const s of rows) {
    const status = String(s.status || "");
    if (!["running", "starting", "queued", "retrying", "recovering", "producing_evidence", "interrupted"].includes(status)) {
      continue;
    }
    if (isSessionActuallyLive(s, { nowMs })) continue;
    const reason = s.completed_at
      ? "zombie_completed_without_status_flip"
      : "zombie_stale_heartbeat";
    updateExecutionSession(s.sessionId, {
      status: "failed",
      completed_at: s.completed_at || iso(nowMs),
      recovery: {
        ...(s.recovery || {}),
        lastError: s.recovery?.lastError || "stale session — no fresh heartbeat",
        zombieReconciledAt: iso(nowMs),
        zombieReason: reason,
        resumable: true,
      },
      logLine: `reconciled zombie session (${reason})`,
    }, { nowMs });
    fixed.push({ sessionId: s.sessionId, missionId: s.missionId, assignmentId: s.assignmentId, reason });
  }
  return fixed;
}

/** Persist a decision-pause checkpoint (Claude session id + question package). */
export function persistDecisionCheckpoint(sessionId, {
  decisionRequest,
  connectorSessionId = null,
  progressSnapshot = null,
  pausedWork = null,
  nowMs,
} = {}) {
  const session = getExecutionSession(sessionId);
  if (!session) return null;
  return updateExecutionSession(sessionId, {
    status: "awaiting_decision",
    connectorSessionId: connectorSessionId || session.connectorSessionId,
    decisionRequest: decisionRequest || session.decisionRequest,
    checkpoint: {
      at: iso(nowMs),
      connectorSessionId: connectorSessionId || session.connectorSessionId,
      decisionRequest: decisionRequest || session.decisionRequest,
      progress: progressSnapshot || session.progress,
      pausedWork: pausedWork || session.progress?.activity || null,
      assignmentId: session.assignmentId,
      missionId: session.missionId,
    },
  }, { nowMs });
}

/** Append operator decision answer verbatim onto the session. */
export function appendDecisionAnswer(sessionId, answer, { nowMs } = {}) {
  const session = getExecutionSession(sessionId);
  if (!session) return null;
  const row = {
    at: iso(nowMs),
    ...answer,
  };
  return updateExecutionSession(sessionId, {
    decisionAnswers: [...(session.decisionAnswers || []), row],
    status: "retrying",
  }, { nowMs });
}

export function updateExecutionSession(sessionId, patch = {}, { nowMs } = {}) {
  const session = getExecutionSession(sessionId);
  if (!session) return null;
  const next = {
    ...session,
    ...patch,
    progress: patch.progress ? { ...session.progress, ...patch.progress } : session.progress,
    cost: patch.cost ? { ...session.cost, ...patch.cost } : session.cost,
    recovery: patch.recovery ? { ...session.recovery, ...patch.recovery } : session.recovery,
    updated_at: iso(nowMs),
  };
  if (Array.isArray(patch.evidenceAppend)) {
    next.evidence = [...(session.evidence || []), ...patch.evidenceAppend];
    delete next.evidenceAppend;
  }
  if (patch.logLine) {
    next.logs = [...(session.logs || []), { at: iso(nowMs), line: String(patch.logLine).slice(0, 500) }].slice(-200);
    delete next.logLine;
  }
  return persist(next);
}

export function appendSessionEvidence(sessionId, evidence, { nowMs } = {}) {
  return updateExecutionSession(sessionId, { evidenceAppend: [evidence] }, { nowMs });
}

export function markSessionHeartbeat(sessionId, {
  activity = null,
  detail = null,
  percent = null,
  filesInspected = null,
  estimatedCheckpointLabel = null,
  nowMs,
} = {}) {
  const session = getExecutionSession(sessionId);
  if (!session) return null;
  const progress = { ...session.progress, lastHeartbeatAt: iso(nowMs) };
  if (activity != null) progress.activity = activity;
  if (detail != null) progress.detail = detail;
  if (percent != null) progress.percent = percent;
  if (filesInspected != null) progress.filesInspected = filesInspected;
  if (estimatedCheckpointLabel != null) progress.estimatedCheckpointLabel = estimatedCheckpointLabel;
  return updateExecutionSession(sessionId, {
    status: session.status === "starting" ? "running" : session.status,
    progress,
  }, { nowMs });
}

/** Classify free-text / tool activity into operator-facing progress labels. */
export function classifyProgressActivity(activity = {}) {
  const text = `${activity.text || ""} ${activity.tool || ""}`.toLowerCase();
  const tool = String(activity.tool || "").toLowerCase();
  if (tool.includes("read") || /reading|inspect|open(ing)? /.test(text)) {
    return { activity: "Reading architecture", bumpFiles: true };
  }
  if (/inventor|enumerat|catalog|survey/.test(text)) {
    return { activity: "Inventorying implementation", bumpFiles: true };
  }
  if (/plan|sequence|roadmap/.test(text)) {
    return { activity: "Creating plan", bumpFiles: false };
  }
  if (/spec|document|writ(e|ing)|markdown|\.md/.test(text) || tool.includes("write") || tool.includes("edit")) {
    return { activity: "Writing specification", bumpFiles: false };
  }
  if (/test|vitest|playwright|typecheck|lint/.test(text) || tool.includes("bash")) {
    return { activity: "Running tests", bumpFiles: false };
  }
  if (/approv|decision|need(s)? (you|operator|product)|waiting for/.test(text)) {
    return { activity: "Waiting for approval", bumpFiles: false };
  }
  if (activity.kind === "assistant" && activity.text) {
    return { activity: "Executing", detail: String(activity.text).slice(0, 120), bumpFiles: false };
  }
  return { activity: "Executing", bumpFiles: false };
}

/**
 * Parse Claude final text for control tokens and structured report.
 */
export function parseExecutionOutcome(text = "") {
  const raw = String(text || "");
  const statusMatch = raw.match(/<<VACILANDO\s+status=([a-z_]+)>>/i);
  const status = statusMatch?.[1] || null;
  let report = null;
  const fence = raw.match(/```vacilando-report\s*([\s\S]*?)```/i);
  if (fence) {
    try { report = JSON.parse(fence[1]); } catch { report = null; }
  }
  let decision = null;
  const decisionFence = raw.match(/```vacilando-decision\s*([\s\S]*?)```/i);
  if (decisionFence) {
    try { decision = JSON.parse(decisionFence[1]); } catch { decision = null; }
  }
  if (!decision && (status === "waiting_for_operator" || /needs? a (product )?decision/i.test(raw))) {
    const q = raw.split("\n").filter((l) => /\?/.test(l)).pop();
    decision = {
      title: "Product decision required",
      situation: q || "Claude paused for operator input",
      recommendation: report?.recommendation || null,
      options: report?.options || [
        { optionId: "proceed", label: "Proceed as recommended", description: "Continue with Director recommendation" },
        { optionId: "revise", label: "Revise approach", description: "Provide new direction" },
      ],
    };
  }
  return {
    status: status || (report?.provider_completion_claim ? "completed" : null),
    report,
    decision,
    summary: report?.implementation_summary || raw.slice(0, 400),
  };
}

export function sessionLiveVm(session) {
  if (!session || !isSessionActuallyLive(session)) return null;
  const hb = session.progress?.lastHeartbeatAt
    ? Math.max(0, Math.round((Date.now() - Date.parse(session.progress.lastHeartbeatAt)) / 1000))
    : null;
  return {
    kind: "execution_session_live",
    sessionId: session.sessionId,
    missionId: session.missionId,
    assignmentId: session.assignmentId,
    connector: session.connector,
    workerLabel: session.connector === "claude" ? "Claude" : session.connector,
    status: session.status,
    activity: session.progress?.activity || "—",
    detail: session.progress?.detail || null,
    percent: session.progress?.percent ?? 0,
    filesInspected: session.progress?.filesInspected ?? 0,
    heartbeatSecondsAgo: hb,
    heartbeatLabel: hb == null ? "No heartbeat yet" : (hb < 5 ? "just now" : `${hb} seconds ago`),
    estimatedCheckpoint: session.progress?.estimatedCheckpointLabel || null,
    cost: session.cost,
  };
}
