/**
 * Vacilando — Usage ledger (Mission Dashboard V1).
 *
 * Historical usage persistence for capacity and cost planning.
 * Tracks: worker, model, mission, runtime, estimated cost, tokens, CPU, memory.
 *
 * No operator dashboard required yet — persistence + runtime contracts only.
 * Complements collectUsage() which aggregates Director round-trip logs.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "usage-ledger");

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function dayFile(day = iso().slice(0, 10)) {
  return join(DIR, `${day}.jsonl`);
}

/**
 * Record a usage event. Missing fields are stored as null — never invented.
 */
export function recordUsageEvent({
  workerId = null,
  model = null,
  missionId = null,
  assignmentId = null,
  provider = null,
  runtimeMs = null,
  estimatedCostUsd = null,
  inputTokens = null,
  outputTokens = null,
  totalTokens = null,
  cpuPercent = null,
  memoryMb = null,
  kind = "session",
  detail = null,
  actor = "system",
  nowMs,
} = {}) {
  ensureDir();
  const at = iso(nowMs);
  const day = at.slice(0, 10);
  const event = {
    schema_version: "vacilando.usage_event.v1",
    event_id: "use_" + randomBytes(8).toString("hex"),
    kind,
    workerId,
    model: model || (workerId?.startsWith("claude") ? "claude" : workerId?.startsWith("cursor") ? "cursor" : provider || null),
    missionId,
    assignmentId,
    provider: provider || null,
    runtime_ms: runtimeMs,
    estimated_cost_usd: estimatedCostUsd,
    tokens: {
      input: inputTokens,
      output: outputTokens,
      total: totalTokens ?? ((inputTokens != null && outputTokens != null) ? inputTokens + outputTokens : null),
    },
    cpu_percent: cpuPercent,
    memory_mb: memoryMb,
    detail: detail && typeof detail === "object" ? detail : null,
    actor,
    at,
  };
  appendFileSync(dayFile(day), JSON.stringify(event) + "\n");
  return event;
}

export function listUsageEvents({
  missionId = null,
  workerId = null,
  since = null,
  limit = 200,
} = {}) {
  ensureDir();
  let files = [];
  try {
    files = readdirSync(DIR).filter((f) => f.endsWith(".jsonl")).sort();
  } catch {
    return [];
  }
  const sinceMs = since ? Date.parse(since) : null;
  const out = [];
  for (const f of files) {
    let lines = [];
    try {
      lines = readFileSync(join(DIR, f), "utf8").split("\n").filter(Boolean);
    } catch {
      continue;
    }
    for (const line of lines) {
      let e;
      try { e = JSON.parse(line); } catch { continue; }
      if (missionId && e.missionId !== missionId) continue;
      if (workerId && e.workerId !== workerId) continue;
      if (sinceMs && Date.parse(e.at) < sinceMs) continue;
      out.push(e);
    }
  }
  return out.slice(-limit);
}

export function summarizeUsage({ missionId = null } = {}) {
  const events = listUsageEvents({ missionId, limit: 5000 });
  const byWorker = new Map();
  let runtimeMs = 0;
  let cost = 0;
  let hasCost = false;
  let tokens = 0;
  for (const e of events) {
    runtimeMs += e.runtime_ms || 0;
    if (e.estimated_cost_usd != null) { cost += e.estimated_cost_usd; hasCost = true; }
    tokens += e.tokens?.total || 0;
    const key = e.workerId || e.model || "unknown";
    const b = byWorker.get(key) || { workerId: e.workerId, model: e.model, events: 0, runtime_ms: 0 };
    b.events++;
    b.runtime_ms += e.runtime_ms || 0;
    byWorker.set(key, b);
  }
  return {
    schema_version: "vacilando.usage_summary.v1",
    missionId,
    events: events.length,
    runtime_ms: runtimeMs,
    estimated_cost_usd: hasCost ? Math.round(cost * 1e4) / 1e4 : null,
    tokens_total: tokens || null,
    by_worker: [...byWorker.values()],
  };
}

/** Convenience: record heartbeat-shaped usage from worker telemetry. */
export function recordUsageFromTelemetry(tel, { runtimeMs = null, nowMs } = {}) {
  if (!tel?.workerId) return null;
  return recordUsageEvent({
    workerId: tel.workerId,
    missionId: tel.missionId,
    assignmentId: tel.assignmentId,
    cpuPercent: tel.cpuPercent,
    memoryMb: tel.memoryMb,
    runtimeMs,
    kind: "heartbeat",
    nowMs,
  });
}
