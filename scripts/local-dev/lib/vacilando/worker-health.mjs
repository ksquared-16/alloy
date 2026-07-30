/**
 * Vacilando — Worker health (Execution System V2 §11).
 *
 * Heartbeats, health classification, stalled/missing-heartbeat detection,
 * conservative recovery hooks (never destroy uncommitted work).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";
import { appendTimelineEvent } from "./timeline.mjs";
import { listAssignments, getAssignment } from "./worker-assignment.mjs";
import { listResourceClaims } from "./resource-claims.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "worker-health");

export const HEALTH_STATES = new Set([
  "starting", "healthy", "idle", "waiting", "blocked", "stalled",
  "constrained", "unresponsive", "recovering", "failed", "stopped", "complete",
]);

const HEARTBEAT_STALE_MS = 90_000;
const PROGRESS_STALE_MS = 10 * 60_000;

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function fileFor(workerId) {
  return join(DIR, `${workerId.replace(/[^a-zA-Z0-9._-]/g, "_")}.json`);
}

function read(workerId) {
  try {
    return JSON.parse(readFileSync(fileFor(workerId), "utf8"));
  } catch {
    return null;
  }
}

function write(rec) {
  ensureDir();
  writeFileSync(fileFor(rec.workerId), JSON.stringify(rec, null, 2));
  return rec;
}

export function recordHeartbeat({
  workerId,
  assignmentId = null,
  missionId = null,
  processId = null,
  slot = null,
  branch = null,
  port = null,
  cpuPercent = null,
  memoryMb = null,
  activeCommand = null,
  activeTool = null,
  progress = false,
  nowMs,
} = {}) {
  if (!workerId) throw new Error("heartbeat_requires_worker_id");
  const now = nowMs ?? Date.now();
  const prev = read(workerId);
  const rec = {
    schema_version: "vacilando.worker_telemetry.v1",
    workerId,
    assignmentId: assignmentId ?? prev?.assignmentId ?? null,
    missionId: missionId ?? prev?.missionId ?? null,
    status: "healthy",
    lastHeartbeatAt: iso(now),
    lastProgressAt: progress ? iso(now) : (prev?.lastProgressAt || iso(now)),
    processId,
    slot: slot != null ? String(slot) : prev?.slot || null,
    machine: os.hostname(),
    branch,
    port,
    cpuPercent,
    memoryMb,
    contextUsagePercent: null,
    activeCommand,
    activeTool,
    elapsedWithoutOutputSeconds: null,
    openChildProcesses: null,
    detectedIssues: [],
    updated_at: iso(now),
  };
  classifyHealth(rec, { nowMs: now });
  return write(rec);
}

export function classifyHealth(telemetry, { nowMs = Date.now() } = {}) {
  const issues = [];
  const hbAge = telemetry.lastHeartbeatAt
    ? nowMs - Date.parse(telemetry.lastHeartbeatAt)
    : Infinity;
  const progAge = telemetry.lastProgressAt
    ? nowMs - Date.parse(telemetry.lastProgressAt)
    : Infinity;

  if (hbAge > HEARTBEAT_STALE_MS * 2) {
    telemetry.status = "unresponsive";
    issues.push({ code: "missing_heartbeat", detail: `No heartbeat for ${Math.round(hbAge / 1000)}s` });
  } else if (hbAge > HEARTBEAT_STALE_MS) {
    telemetry.status = "stalled";
    issues.push({ code: "stale_heartbeat", detail: `Heartbeat delayed ${Math.round(hbAge / 1000)}s` });
  } else if (progAge > PROGRESS_STALE_MS && telemetry.assignmentId) {
    telemetry.status = "stalled";
    issues.push({ code: "no_progress", detail: `No progress for ${Math.round(progAge / 60000)}m` });
  } else if (telemetry.cpuPercent != null && telemetry.cpuPercent > 95) {
    telemetry.status = "constrained";
    issues.push({ code: "runaway_cpu", detail: `CPU ${telemetry.cpuPercent}%` });
  } else if (listResourceClaims({ type: "build_lock" }).length && telemetry.activeCommand && /typecheck|build/.test(telemetry.activeCommand)) {
    // Another build held — mark constrained if this worker also wants heavy work
    telemetry.status = "constrained";
    issues.push({ code: "build_lock_held", detail: "CPU-heavy job locked elsewhere" });
  } else {
    const asg = telemetry.assignmentId && telemetry.missionId
      ? getAssignment(telemetry.missionId, telemetry.assignmentId)
      : null;
    if (asg?.status === "blocked") telemetry.status = "blocked";
    else if (asg?.status === "waiting" || asg?.status === "paused") telemetry.status = "waiting";
    else if (asg?.status === "complete") telemetry.status = "complete";
    else if (asg?.status === "ready" && !telemetry.activeCommand) telemetry.status = "idle";
    else if (!telemetry.assignmentId) telemetry.status = "idle";
    else telemetry.status = "healthy";
  }

  telemetry.detectedIssues = issues;
  return telemetry;
}

export function getWorkerTelemetry(workerId) {
  const rec = read(workerId);
  if (!rec) return null;
  return classifyHealth({ ...rec }, { nowMs: Date.now() });
}

export function listWorkerTelemetry() {
  ensureDir();
  return readdirSync(DIR)
    .filter((n) => n.endsWith(".json"))
    .map((n) => {
      try {
        return classifyHealth(JSON.parse(readFileSync(join(DIR, n), "utf8")));
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

/**
 * Conservative recovery — never destroys uncommitted work.
 * Records timeline + returns recommended action for the conductor.
 */
export function recoverWorker({
  workerId,
  action = "checkpoint_and_pause",
  missionId = null,
  assignmentId = null,
  actor = "director",
  nowMs,
} = {}) {
  const SAFE = new Set([
    "checkpoint_and_pause",
    "request_self_diagnosis",
    "reduce_concurrency",
    "serialize_validation",
    "clear_safe_cache",
    "reassign_after_checkpoint",
    "restart_preserving_context",
  ]);
  const UNSAFE = new Set(["destroy_worktree", "hard_reset", "discard_uncommitted"]);
  if (UNSAFE.has(action)) {
    const tel = getWorkerTelemetry(workerId) || recordHeartbeat({ workerId, missionId, assignmentId, nowMs });
    tel.status = tel.status === "healthy" ? "failed" : tel.status;
    tel.operatorActionRequired = true;
    tel.last_recovery = {
      action,
      at: iso(nowMs),
      actor,
      requiresOperatorApproval: true,
      refused: true,
      reason: "unsafe_recovery",
    };
    write(tel);
    const mid = missionId || tel.missionId;
    if (mid) {
      appendTimelineEvent(mid, {
        type: "recovery",
        summary: `Recovery requires your approval — refused unsafe action (${action})`,
        visibility: "summary",
        assignmentId: assignmentId || tel.assignmentId,
        actor,
        detail: { action, workerId, requiresOperatorApproval: true },
        nowMs,
      });
    }
    return {
      ok: false,
      error: "unsafe_recovery",
      message: "Refusing destructive recovery without operator approval",
      telemetry: tel,
      requiresOperatorApproval: true,
    };
  }
  if (!SAFE.has(action)) {
    return { ok: false, error: "unknown_recovery_action" };
  }

  const tel = getWorkerTelemetry(workerId) || recordHeartbeat({ workerId, missionId, assignmentId, nowMs });
  tel.status = "recovering";
  tel.last_recovery = { action, at: iso(nowMs), actor };
  write(tel);

  const mid = missionId || tel.missionId;
  if (mid) {
    appendTimelineEvent(mid, {
      type: "recovery",
      summary: `Recovery — ${action} for ${workerId}`,
      visibility: "summary",
      assignmentId: assignmentId || tel.assignmentId,
      actor,
      detail: { action, workerId },
      nowMs,
    });
    appendTimelineEvent(mid, {
      type: "worker_health",
      summary: `Worker ${workerId} → recovering`,
      visibility: "detail",
      actor,
      detail: tel,
      nowMs,
    });
  }

  return {
    ok: true,
    telemetry: tel,
    action,
    note: "Uncommitted work preserved; operator must approve discard",
  };
}

/** Scan assignments for orphan/stale workers (no recent heartbeat). */
export function detectStaleWorkers({ nowMs = Date.now() } = {}) {
  const stale = [];
  for (const a of listAssignments()) {
    if (!["running", "verification"].includes(a.status) || !a.workerId) continue;
    const tel = getWorkerTelemetry(a.workerId);
    if (!tel || (nowMs - Date.parse(tel.lastHeartbeatAt)) > HEARTBEAT_STALE_MS) {
      stale.push({ assignment: a, telemetry: tel, issue: "missing_or_stale_heartbeat" });
    }
  }
  return stale;
}
