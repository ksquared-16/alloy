/**
 * Vacilando — Platform Resources runtime (Mission Dashboard V1).
 *
 * New platform concept for capacity planning. Not exposed in primary navigation yet.
 * Covers workers, machine, CPU, memory, processes — with reserved kinds for
 * GitHub Actions, browser farm, cost, and calendar.
 *
 * Distinct from:
 *   - resource-claims.mjs (locks/ports for concurrent jobs)
 *   - resources.mjs (live OS collect for legacy dashboard)
 */
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { listWorkerTelemetry } from "./worker-health.mjs";
import { listResourceClaims } from "./resource-claims.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "platform-resources");
const SNAPSHOT = join(DIR, "latest.json");
const HISTORY = join(DIR, "history.jsonl");

export const RESOURCE_KINDS = Object.freeze([
  "worker",
  "machine",
  "cpu",
  "memory",
  "process",
  "github_actions",
  "browser_farm",
  "cost",
  "calendar",
]);

const iso = (ms) => new Date(ms ?? Date.now()).toISOString();

function ensureDir() {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true });
}

function machinePressure() {
  const load = os.loadavg();
  const cpus = os.cpus().length || 1;
  const loadPct = Math.round((load[1] / cpus) * 100);
  const total = os.totalmem();
  const free = os.freemem();
  const usedPct = Math.round(((total - free) / total) * 100);
  const pressure = usedPct >= 90 || loadPct >= 200 ? "high"
    : usedPct >= 80 || loadPct >= 130 ? "elevated"
      : "ok";
  return {
    kind: "machine",
    hostname: os.hostname(),
    platform: os.platform(),
    cpu_count: cpus,
    load_1m: Math.round(load[0] * 100) / 100,
    load_5m: Math.round(load[1] * 100) / 100,
    cpu_load_pct: Math.min(100, loadPct),
    memory_total_mb: Math.round(total / 1048576),
    memory_available_mb: Math.round(free / 1048576),
    memory_used_pct: usedPct,
    pressure,
  };
}

/**
 * Build a durable platform resources snapshot.
 * Future kinds (github_actions, browser_farm, cost, calendar) are reserved stubs.
 */
export function buildPlatformResourcesSnapshot({ nowMs } = {}) {
  const workers = listWorkerTelemetry().map((w) => ({
    kind: "worker",
    workerId: w.workerId,
    missionId: w.missionId,
    status: w.status,
    slot: w.slot,
    processId: w.processId,
    cpuPercent: w.cpuPercent,
    memoryMb: w.memoryMb,
    branch: w.branch,
    port: w.port,
  }));

  const machine = machinePressure();
  const claims = listResourceClaims();

  const processes = workers
    .filter((w) => w.processId)
    .map((w) => ({
      kind: "process",
      processId: w.processId,
      workerId: w.workerId,
      missionId: w.missionId,
      cpuPercent: w.cpuPercent,
      memoryMb: w.memoryMb,
    }));

  return {
    schema_version: "vacilando.platform_resources.v1",
    snapshot_id: "res_" + createHash("sha256").update(`${Date.now()}:${Math.random()}`).digest("hex").slice(0, 12),
    captured_at: iso(nowMs),
    kinds: [...RESOURCE_KINDS],
    workers,
    machine,
    cpu: {
      kind: "cpu",
      count: machine.cpu_count,
      load_pct: machine.cpu_load_pct,
      pressure: machine.pressure,
    },
    memory: {
      kind: "memory",
      total_mb: machine.memory_total_mb,
      available_mb: machine.memory_available_mb,
      used_pct: machine.memory_used_pct,
      pressure: machine.pressure,
    },
    processes,
    claims: claims.map((c) => ({
      type: c.type,
      resourceKey: c.resourceKey,
      missionId: c.missionId,
      workerId: c.workerId,
      status: c.status,
    })),
    reserved: {
      github_actions: { kind: "github_actions", available: false, note: "Reserved for future capacity planning" },
      browser_farm: { kind: "browser_farm", available: false, note: "Reserved for future browser QA capacity" },
      cost: { kind: "cost", available: false, note: "Cost rolls up via usage ledger" },
      calendar: { kind: "calendar", available: false, note: "Reserved for schedule/capacity windows" },
    },
    capacity_hint: {
      worker_slots_total: 6,
      worker_slots_active: workers.filter((w) => !["stopped", "complete", "failed"].includes(w.status)).length,
      pressure: machine.pressure,
      recommendation: machine.pressure === "high"
        ? "Do not start new workers"
        : machine.pressure === "elevated"
          ? "Start at most one lightweight worker"
          : "Capacity available",
    },
  };
}

export function recordPlatformResourcesSnapshot({ nowMs } = {}) {
  ensureDir();
  const snap = buildPlatformResourcesSnapshot({ nowMs });
  writeFileSync(SNAPSHOT, JSON.stringify(snap, null, 2));
  appendFileSync(HISTORY, JSON.stringify({
    snapshot_id: snap.snapshot_id,
    captured_at: snap.captured_at,
    pressure: snap.machine.pressure,
    workers: snap.workers.length,
    memory_used_pct: snap.memory.used_pct,
  }) + "\n");
  return snap;
}

export function getPlatformResources() {
  try {
    return JSON.parse(readFileSync(SNAPSHOT, "utf8"));
  } catch {
    return recordPlatformResourcesSnapshot();
  }
}

export function listPlatformResourceHistory({ limit = 50 } = {}) {
  try {
    const lines = readFileSync(HISTORY, "utf8").split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
