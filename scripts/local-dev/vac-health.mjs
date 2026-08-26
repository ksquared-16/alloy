#!/usr/bin/env node
/**
 * vac health — bounded, read-only health for the host and the Vacilando runtime.
 *
 *   vac health              compact report for an incident
 *   vac health --json       the full structured record
 *   vac health --check <n>  one check only
 *   vac health --quiet      verdict line only
 *
 * exit 0 healthy · 1 watch · 2 problem
 *
 * Observation only. This command changes nothing: it does not correct
 * registries, cap workers, reclaim seats or terminate anything.
 */
import os from "node:os";
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";

import { CHECKS, measuredHardware, thresholdsFor, composeReport } from "./lib/vacilando/health.mjs";
import {
  probeLoad, probeMemory, probeDisk, probeGateway, probeProcessTable,
  probeTmuxPanes, looksLikeValidation, withBudget,
} from "./lib/vacilando/health-probes.mjs";
import { attributionReport, parseProcessTable } from "./lib/vacilando/process-attribution.mjs";
import { classifyWorkload } from "./lib/vacilando/workload-classification.mjs";
import { concurrentWeightedCost } from "./lib/vacilando/workload-observation.mjs";
import { hostCapability, computeCapacityPolicy } from "./lib/vacilando/capacity-policy.mjs";

function usage(code = 2) {
  process.stderr.write(`Usage: vac health [--json] [--check <name>] [--quiet]

Checks: ${CHECKS.join(", ")}

Read-only. Reports; never corrects, caps, reclaims or kills.
`);
  process.exit(code);
}

const argv = process.argv.slice(2);
let asJson = false;
let quiet = false;
let only = null;
while (argv.length) {
  const a = argv.shift();
  if (a === "--json") asJson = true;
  else if (a === "--quiet") quiet = true;
  else if (a === "--check") only = argv.shift() || "";
  else if (a.startsWith("--check=")) only = a.slice(8);
  else if (a === "-h" || a === "--help") usage(0);
  else usage();
}
if (only && !CHECKS.includes(only)) {
  process.stderr.write(`vac health: unknown check "${only}"\n  known: ${CHECKS.join(", ")}\n`);
  process.exit(2);
}

const startedAt = new Date().toISOString();
const hw = measuredHardware({ os });
const thresholds = thresholdsFor(hw);

/** Everything below is bounded; a miss yields null and an INCOMPLETE finding. */
const [memory, gateway, psText, panes] = await Promise.all([
  withBudget(probeMemory({ os }), 3500, null),
  withBudget(probeGateway({}), 20000, { status: "down", retried: true, retry_ok: false }),
  withBudget(probeProcessTable({}), 5000, null),
  withBudget(probeTmuxPanes({}), 3000, null),
]);
const load = probeLoad({ os });
const disk = probeDisk({});

/** Vacilando state, each read isolated so one failure cannot end the report. */
async function safely(fn, fallback) {
  try { return await fn(); } catch { return fallback; }
}

const lanesRaw = await safely(async () => {
  const { listDurableLanes } = await import("./lib/vacilando/development-lane.mjs");
  return listDurableLanes();
}, []);

const runFor = await safely(async () => {
  const { activeRunForLane } = await import("./lib/vacilando/execution-run.mjs");
  return (laneId) => activeRunForLane(laneId);
}, () => null);

const seats = await safely(async () => {
  if (!panes) return [];
  const { correlateProviderProcesses } = await import("./lib/vacilando/provider-capacity.mjs");
  return correlateProviderProcesses({
    panes, lanes: lanesRaw, sessions: [],
    runStateFor: (id) => runFor(id)?.state || null,
  });
}, []);

const configuredMax = await safely(async () => {
  const { configuredProviderCeiling } = await import("./lib/vacilando/provider-capacity.mjs");
  return configuredProviderCeiling(process.env);
}, null);

const repositories = await safely(async () => {
  const { readRepositoryStore } = await import("./lib/vacilando/repository-registry.mjs");
  return Object.values(readRepositoryStore().repositories || {});
}, []);

// ── S1 is the canonical attribution source. Health never re-derives ancestry. ─
const processes = psText ? parseProcessTable(psText) : [];
const attribution = psText
  ? attributionReport({
    seats, processes, lanes: lanesRaw, repositories, runFor,
    interesting: (r) => looksLikeValidation(r.command) || seats.some((s) => s.pid === r.pid),
  })
  : null;

// S3: classify every attributed process. looksLikeValidation only SELECTS
// candidates; the class and weight come from the classifier, which reads scope.
const workloads = (attribution?.records || [])
  .filter((r) => looksLikeValidation(r.command))
  .map((r) => classifyWorkload({ command: r.command, pid: r.pid, attribution: r }))
  .filter((w) => w.workload_class);
const workloadCost = concurrentWeightedCost(workloads);

// ── S4: the canonical capacity policy. Health reads it; it never recomputes. ─
const sysctlRead = (key) => {
  try {
    const { execFileSync } = nodeRequire("node:child_process");
    return String(execFileSync("sysctl", ["-n", key], { encoding: "utf8", timeout: 1500 })).trim();
  } catch { return null; }
};
const devServerCount = (() => {
  try {
    const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
    const pidDir = join(root, "pids");
    if (!existsSync(pidDir)) return 0;
    return readdirSync(pidDir).filter((f) => f.endsWith(".pid")).filter((f) => {
      const pid = Number(readFileSync(join(pidDir, f), "utf8").trim());
      try { process.kill(pid, 0); return true; } catch { return false; }
    }).length;
  } catch { return 0; }
})();

const capability = hostCapability({
  os, disk, memory, load, seats, devServers: devServerCount, workloads, sysctl: sysctlRead,
});
const capacity = computeCapacityPolicy(capability);

// S5 enforcement state: what is actually held, queued, or running unbrokered.
let enforcement = null;
try {
  const VA = await import("./lib/vacilando/validation-admission.mjs");
  const store = VA.readClaimStore({});
  const un = VA.unbrokeredPressure({ workloads, claims: store.claims });
  const eff = VA.effectiveRemaining({ capacity, store, unbrokeredWeight: un.unbrokered_weight });
  enforcement = {
    ...eff,
    queued: (store.queue || []).length,
    reaped: (store.reaped || []).length,
    worker_cap_drift: 0,
    unbrokered_workloads: un.workloads,
  };
} catch { enforcement = null; }

const lanes = lanesRaw.map((l) => ({
  lane_id: l.lane_id,
  name: l.name || l.label || null,
  run_state: runFor(l.lane_id)?.state || null,
}));

const runs = lanesRaw.map((l) => {
  const r = runFor(l.lane_id);
  if (!r) return null;
  const at = Date.parse(r.updated_at || r.created_at || "") || null;
  return {
    run_id: r.run_id,
    state: r.state,
    state_reason: r.state_reason || null,
    terminal: ["COMPLETE", "FAILED", "ABANDONED"].includes(r.state),
    age_ms: at ? Date.now() - at : null,
  };
}).filter(Boolean);

/**
 * Bounds that exist TODAY. A waiting reason absent from this table is exactly
 * the doctrine's "unbounded state" problem, and runs.stale reports it as such
 * rather than inventing a deadline.
 */
// S6: express every non-terminal run's wait in the canonical contract.
let waits = null;
try {
  const RW = await import("./lib/vacilando/run-wait.mjs");
  const VA = await import("./lib/vacilando/validation-admission.mjs");
  const descriptors = [];
  // Only genuinely WAITING states produce a wait. An EXECUTING run with reason
  // `instruction_delivered` is working, not waiting — treating its reason as a
  // wait reason reported three healthy runs as invalid on the first live run.
  const WAITING_STATES = new Set(["QUEUED", "NEEDS_INPUT", "WAITING_RESOURCE", "RECOVERING"]);
  for (const l of lanesRaw) {
    const r = runFor(l.lane_id);
    if (!r || !WAITING_STATES.has(r.state)) continue;
    const since = Date.parse(r.updated_at || r.created_at || "") || Date.now();
    const reason = r.state === "NEEDS_INPUT" ? "needs_operator_input"
      : r.state === "RECOVERING" ? "recovering"
      : (r.state_reason || null);
    descriptors.push(RW.describeWait({
      reason, resource_id: r.run_id, waiting_since: since,
      context: { no_session_binding: !l.binding?.worktree_path },
    }));
  }
  for (const e of VA.readClaimStore({}).queue || []) {
    const d = RW.waitFromValidationQueueEntry(e);
    if (d) descriptors.push(d);
  }
  waits = RW.summarizeWaits(descriptors);
} catch { waits = null; }

// ── S8: canonical provider seat state ────────────────────────────────────────
//
// Read-only, like everything else here. `vac health` classifies seats and says
// what would be reclaimable; it never reclaims one. The reclaim lives on the
// admission path, where a real waiting admission exists to justify it.
let seatStates = [];
let seatSummary = null;
let idleGracePolicy = null;
let providerCapacityWaits = [];
try {
  const PC = await import("./lib/vacilando/provider-capacity.mjs");
  const SS = await import("./lib/vacilando/provider-seat-state.mjs");
  idleGracePolicy = SS.IDLE_GRACE_POLICY_V1;
  seatStates = await PC.observeLiveSeats({});
  seatSummary = SS.summarizeSeats(seatStates);
  providerCapacityWaits = runs.filter((r) =>
    r.state === "QUEUED" && r.state_reason === SS.PROVIDER_CAPACITY_WAIT_REASON);
} catch { seatStates = []; seatSummary = null; }

// A reclaim is in flight when a lane has been chosen but the provider has not
// gone down yet. Nothing writes this today beyond the reclaim itself, so an
// empty list is the honest answer rather than an assumed zero.
const reclaimsInFlight = seatStates.filter((s) => s.reclaim_in_progress === true);

// ── Validation routing: did heavy work go through the single authority? ─────
let validationRouting = null;
let validationBypasses = [];
try {
  const VR = await import("./lib/vacilando/validation-routing.mjs");
  const VA = await import("./lib/vacilando/validation-admission.mjs");
  const claims = VA.readClaimStore({}).claims || [];
  const unbrokered = VR.classifyUnbrokered(workloads, { claims });
  const bypassPath = join(process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev"),
    "vacilando", "validation-bypass", "events.jsonl");
  if (existsSync(bypassPath)) {
    // Bounded: only today's tail matters for a health verdict.
    validationBypasses = readFileSync(bypassPath, "utf8").trim().split("\n").slice(-200)
      .map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
  }
  validationRouting = VR.summarizeRouting({ claims, unbrokered, bypasses: validationBypasses });
} catch { validationRouting = null; }

const RUN_BOUNDS = {
  instruction_delivered: 6 * 60 * 60 * 1000,
  admission_delivered: 6 * 60 * 60 * 1000,
  operator_follow_up: 6 * 60 * 60 * 1000,
};

const ports = await safely(async () => {
  const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
  const out = [];
  const metaDir = join(root, "metadata");
  const registered = new Map();
  if (existsSync(metaDir)) {
    for (const f of readdirSync(metaDir)) {
      if (!f.endsWith(".env")) continue;
      const name = f.replace(/\.env$/, "");
      const body = readFileSync(join(metaDir, f), "utf8");
      const m = body.match(/PORT="?(\d+)"?/);
      if (m) registered.set(Number(m[1]), name);
    }
  }
  for (const port of [3011, 3012, 3013, 3014, 3015, 3016]) {
    const owner = registered.get(port) || null;
    const pidFile = owner ? join(root, "pids", `${owner}.pid`) : null;
    const recorded = pidFile && existsSync(pidFile) ? Number(readFileSync(pidFile, "utf8").trim()) : null;
    const alive = recorded ? (() => { try { process.kill(recorded, 0); return true; } catch { return false; } })() : false;
    // Which process actually holds it, by ancestry/command — lsof is absent here.
    const serving = processes.find((p) => new RegExp(`-p\\s+${port}\\b`).test(p.command || ""));
    let verdict;
    if (serving && owner && alive) verdict = "matched";
    else if (serving && (!owner || !alive)) verdict = "unregistered-server";
    else if (!serving && owner && !alive) verdict = "stale-record";
    else if (!serving && !owner) verdict = "free";
    else verdict = "matched";
    out.push({ port, registered: owner, recorded_pid: recorded, alive, serving: serving ? `pid ${serving.pid}` : null, verdict });
  }
  return out;
}, []);

const worktrees = await safely(async () => {
  const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
  const parent = join(homedir(), "Code", "alloy-worktrees");
  const onDisk = existsSync(parent)
    ? readdirSync(parent, { withFileTypes: true }).filter((d) => d.isDirectory() && /^wt/.test(d.name)).map((d) => d.name)
    : [];
  const metaDir = join(root, "metadata");
  const registered = existsSync(metaDir)
    ? readdirSync(metaDir).filter((f) => f.endsWith(".env")).map((f) => f.replace(/\.env$/, ""))
    : [];
  const unmanaged = onDisk.filter((n) => !registered.includes(n));
  return { onDisk: onDisk.length, registered: registered.length, unmanaged };
}, { onDisk: 0, registered: 0, unmanaged: [] });

// ── S9: toolkit retention, from the canonical owner ──────────────────────────
//
// Health does NOT count directories any more. It asks the retention owner for a
// plan and reports what the plan says. A second opinion about what may be
// deleted is exactly the drift this consolidates away — and `vac health` never
// prunes, whatever severity it reports.
const toolkitState = await safely(async () => {
  const { execFileSync } = nodeRequire("node:child_process");
  const here = dirname(fileURLToPath(import.meta.url));
  const impl = join(here, "vac-toolkit-prune.mjs");
  if (!existsSync(impl)) return null;
  const out = execFileSync(process.execPath, [impl, "--json", "--quiet"], {
    encoding: "utf8", timeout: 90_000, maxBuffer: 32 * 1024 * 1024,
  });
  return JSON.parse(out);
}, null);

const toolkitSeverity = await safely(async () => {
  if (!toolkitState) return null;
  const { retentionSeverity } = await import("./lib/vacilando/toolkit-retention.mjs");
  return retentionSeverity(toolkitState, { diskPressure: Boolean(disk && disk.free_pct != null && disk.free_pct < 10) });
}, null);

const report = composeReport({
  hw, thresholds, only, startedAt,
  endedAt: new Date().toISOString(),
  probeResults: {
    load, memory, disk, gateway, seats, panes: panes || [], lanes, runs,
    run_bounds: RUN_BOUNDS, waits, attribution, workloads, workload_cost: workloadCost, capacity, enforcement,
    ports, worktrees, configured_max: configuredMax,
    validation_routing: validationRouting, validation_bypasses: validationBypasses,
    toolkit_plan: toolkitState, toolkit_severity: toolkitSeverity,
    disk_pressure: Boolean(disk && disk.free_pct != null && disk.free_pct < 10),
    seat_states: seatStates, seat_summary: seatSummary, idle_grace_policy: idleGracePolicy,
    provider_capacity_waits: providerCapacityWaits, reclaims_in_flight: reclaimsInFlight,
  },
});

if (asJson) {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exit(report.exit_code);
}

const MARK = { healthy: "OK  ", watch: "WATCH", problem: "PROB" };
const verdictLine = report.verdict === "healthy" ? "HEALTHY"
  : report.verdict === "watch" ? "HEALTHY WITH WATCH ITEMS" : "PROBLEMS FOUND";

if (quiet) {
  process.stdout.write(`${verdictLine}${report.incomplete ? " (partial)" : ""}\n`);
  process.exit(report.exit_code);
}

const w = (s) => process.stdout.write(s);
w(`\n${verdictLine}${report.incomplete ? "  ·  PARTIAL REPORT" : ""}\n`);
w(`${"─".repeat(64)}\n`);
w(`host       ${hw.hostname} · ${hw.cores} cores · ${hw.memory_gb} GB · up ${Math.floor((hw.uptime_seconds || 0) / 86400)}d\n`);
if (load) w(`load       ${load.one.toFixed(2)} / ${load.five.toFixed(2)} / ${load.fifteen.toFixed(2)}   (watch ≥ ${thresholds.load_watch}, problem > ${thresholds.load_problem})\n`);
if (memory) w(`memory     ${memory.free_gb} GB free (${memory.free_pct.toFixed(1)}%) · compressor ${memory.compressor_gb} GB\n`);
if (disk) w(`disk       ${disk.free_gb} GB free of ${disk.total_gb} GB (${disk.free_pct.toFixed(1)}%)\n`);
w(`vacilando  ${seats.length} provider seats · ${lanes.length} lanes · ${attribution ? attribution.attributed_count : "?"} attributed processes\n`);
if (seatSummary) {
  const c = seatSummary.counts;
  w(`seats      ${c.active} active · ${c.attentive} attentive · ${c.idle} idle (${seatSummary.idle_reclaimable} reclaimable) · ${c.blocked} blocked · ${c.dormant} dormant   (grace ${Math.round((idleGracePolicy?.grace_ms || 0) / 60000)}m, policy ${idleGracePolicy?.version})\n`);
}
const A = capacity.axes;
w(`capacity   providers ${A.provider_capacity.current}/${A.provider_capacity.ceiling} (by ${A.provider_capacity.bounded_by}) · tokens ${A.validation_capacity.used}/${A.validation_capacity.tokens} (by ${A.validation_capacity.bounded_by}) · workers ≤${A.validation_capacity.worker_ceiling} · dev servers ${A.dev_server_capacity.current}/${A.dev_server_capacity.ceiling}\n`);
w(`reserves   memory ${A.memory_capacity.free_gb ?? "?"} GB free / ${A.memory_capacity.reserve_gb} GB reserve · disk ${A.disk_headroom.free_gb ?? "?"} GB free / ${A.disk_headroom.reserve_gb} GB reserve · policy ${capacity.policy_version}\n`);
if (capacity.constrained_axes.length) w(`constrained ${capacity.constrained_axes.map((c) => c.value).join(", ")}\n`);
w(`checks     ${report.counts.problem} problem · ${report.counts.watch} watch · ${report.counts.healthy} healthy   (${report.duration_ms} ms)\n`);

const section = (title, sev) => {
  const rows = report.findings.filter((f) => f.severity === sev);
  if (!rows.length) return;
  w(`\n${title}\n`);
  for (const f of rows) {
    w(`  ${MARK[f.severity]}  ${f.check}${f.incomplete ? "  (incomplete)" : ""}${f.confidence !== "measured" ? `  [${f.confidence}]` : ""}\n`);
    w(`        ${f.explanation}\n`);
    for (const e of f.evidence.slice(0, 3)) {
      w(`        · ${typeof e === "string" ? e : JSON.stringify(e)}\n`);
    }
  }
};
section("PROBLEMS", "problem");
section("WATCH", "watch");

const healthy = report.findings.filter((f) => f.severity === "healthy").map((f) => f.check);
if (healthy.length) w(`\nHEALTHY\n  ${healthy.join(", ")}\n`);

const actions = report.findings.filter((f) => f.suggested_action).map((f) => `${f.check}: ${f.suggested_action}`);
if (actions.length) {
  w(`\nRECOMMENDED OPERATOR ACTIONS  (none performed)\n`);
  for (const a of actions) w(`  · ${a}\n`);
}
w("\n");
process.exit(report.exit_code);
