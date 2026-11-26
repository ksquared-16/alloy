#!/usr/bin/env node
/**
 * The canonical governed validation path.
 *
 * One supported route for expensive validation:
 *
 *   normalize -> classify (S3) -> resolve owner (S1) -> read policy (S4)
 *     -> decide admission (S5) -> cap workers -> execute -> sample -> RELEASE
 *
 * Release happens on every exit path — success, test failure, signal, and
 * uncaught throw — and a crash that escapes all of them is still recovered,
 * because a claim whose holder pid is gone is reaped on the next read.
 *
 * WHAT THIS NEVER DOES. It never terminates a running workload to reclaim
 * capacity, and it never alters test selection. The only thing it rewrites is a
 * concurrency flag: that changes how fast a suite runs, not what it asserts.
 *
 * Invoked through `vac run command -- <cmd…>` rather than as a parallel CLI.
 */
import os from "node:os";
import { spawn, execFile } from "node:child_process";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";

import { classifyWorkload, normalizeInvocation, expectedWeight } from "./lib/vacilando/workload-classification.mjs";
import { createSampler, observationRecord } from "./lib/vacilando/workload-observation.mjs";
import { hostCapability, computeCapacityPolicy } from "./lib/vacilando/capacity-policy.mjs";
import {
  acquireCapacity, releaseCapacity, drainQueue, applyWorkerCeiling,
  detectWorkerCapDrift, isEnforced,
} from "./lib/vacilando/validation-admission.mjs";
import { attributionReport, parseProcessTable } from "./lib/vacilando/process-attribution.mjs";
import { probeLoad, probeMemory, probeDisk, boundedExec, withBudget } from "./lib/vacilando/health-probes.mjs";

const argv = process.argv.slice(2);
let asJson = false;
let waitForCapacity = true;
const cmd = [];
while (argv.length) {
  const a = argv.shift();
  if (a === "--json") asJson = true;
  else if (a === "--no-wait") waitForCapacity = false;
  else if (a === "--") { cmd.push(...argv.splice(0)); }
  else cmd.push(a);
}
if (!cmd.length) {
  process.stderr.write("Usage: vac run command -- <command…>   (governed validation)\n");
  process.exit(2);
}

const commandLine = cmd.join(" ");
const log = (s) => { if (!asJson) process.stderr.write(`${s}\n`); };

// ── owner (S1) ───────────────────────────────────────────────────────────────
const psText = await withBudget(boundedExec("ps", ["-Ao", "pid=,ppid=,command="], { timeoutMs: 4000 })
  .then((o) => (o.ok ? o.stdout : null)), 5000, null);
const processes = psText ? parseProcessTable(psText) : [];

let attribution = null;
try {
  const { listDurableLanes } = await import("./lib/vacilando/development-lane.mjs");
  const { activeRunForLane } = await import("./lib/vacilando/execution-run.mjs");
  const { correlateProviderProcesses } = await import("./lib/vacilando/provider-capacity.mjs");
  const { readRepositoryStore } = await import("./lib/vacilando/repository-registry.mjs");
  const paneOut = await withBudget(boundedExec("tmux",
    ["list-panes", "-a", "-F", "#{pane_id}|#{pane_pid}|#{session_name}|#{pane_current_command}|#{pane_current_path}|#{pane_title}"],
    { timeoutMs: 2500 }), 3000, { ok: false });
  const panes = paneOut.ok ? paneOut.stdout.trim().split("\n").filter(Boolean).map((l) => {
    const [pane_id, pid, session, command, cwd, title] = l.split("|");
    return { pane_id, pid: Number(pid), session, command, cwd, title };
  }) : [];
  const lanes = listDurableLanes();
  const seats = correlateProviderProcesses({ panes, lanes, sessions: [], runStateFor: (id) => activeRunForLane(id)?.state || null });
  const repositories = Object.values(readRepositoryStore().repositories || {});
  // This process's own ancestry resolves the owning seat/lane/run.
  const rep = attributionReport({
    seats, processes, lanes, repositories, runFor: (id) => activeRunForLane(id),
    interesting: (r) => r.pid === process.pid,
  });
  attribution = rep.records.find((r) => r.pid === process.pid) || null;
} catch { attribution = null; }

// ── classify (S3) ────────────────────────────────────────────────────────────
const normalized = normalizeInvocation(commandLine);
let workload = classifyWorkload({ command: commandLine, pid: process.pid, attribution });

// ── policy (S4) ──────────────────────────────────────────────────────────────
const [memory, disk, load] = [
  await withBudget(probeMemory({ os }), 3500, null),
  probeDisk({}),
  probeLoad({ os }),
];
const capability = hostCapability({ os, disk, memory, load, seats: [], devServers: 0, workloads: [] });
const capacity = computeCapacityPolicy(capability);
const ceiling = capacity.axes.validation_capacity.worker_ceiling;

// ── worker cap ───────────────────────────────────────────────────────────────
// Execution uses the ORIGINAL argv. Normalization exists to CLASSIFY — spawning
// the normalized tool tried to exec `-e` after `node` was stripped.
const execBin = cmd[0];
let execArgs = cmd.slice(1);
let capResult = { changed: false, granted: null, reason: null };
const workersRequested = workload.workers_requested ?? workload.workers_default ?? null;
if (isEnforced(workload.workload_class)) {
  capResult = applyWorkerCeiling(normalized.args, ceiling, { tool: normalized.tool });
  if (capResult.changed) {
    execArgs = capResult.args;
    workload = {
      ...workload,
      workers_granted: capResult.granted,
      expected_weight: workload.workload_class === "heavy_test"
        ? expectedWeight("heavy_test", { workers: capResult.granted })
        : workload.expected_weight,
    };
  }
}

// ── admission (S5) ───────────────────────────────────────────────────────────
const t0 = Date.now();
let acquired = acquireCapacity({
  workload, capacity, pid: process.pid,
  workersRequested, workersGranted: capResult.granted,
});
const admissionMs = Date.now() - t0;

if (acquired.queued && !waitForCapacity) {
  const body = { governed: true, admitted: false, queued: true, queue_entry: acquired.queue_entry, admission_ms: admissionMs };
  process.stdout.write(asJson ? `${JSON.stringify(body, null, 2)}\n` : `queued: ${acquired.queue_entry.blocked_by.map((b) => b.axis).join(", ")}\n`);
  process.exit(75); // EX_TEMPFAIL: try again, not a failure of the work itself
}

// Waiting is event-shaped, not a busy loop: re-probe only when the ledger says
// capacity may have changed, with a bounded backoff.
let waited = 0;
while (acquired.queued) {
  const entry = acquired.queue_entry;
  log(`waiting for capacity — blocked by ${entry.blocked_by.map((b) => b.axis).join(", ")} (held ${entry.current_held}/${entry.budget})`);
  if (Date.now() > entry.wait_deadline) {
    process.stderr.write("vac run: capacity wait exceeded its bound; not started\n");
    process.exit(75);
  }
  await new Promise((r) => { setTimeout(r, Math.min(5000, 1000 + waited * 500)); });
  waited += 1;
  drainQueue({ capacity });
  acquired = acquireCapacity({ workload, capacity, pid: process.pid, workersRequested, workersGranted: capResult.granted });
}

const claim = acquired.claim;
log(`governed: ${workload.workload_class} · workers ${workersRequested ?? "default"} -> ${capResult.granted ?? "n/a"} · weight ${acquired.weight === undefined ? "exclusive" : acquired.weight} · admitted in ${admissionMs}ms`);

// ── execute, sample, and release on EVERY path ───────────────────────────────
const readTable = () => new Promise((r) => execFile("ps", ["-Ao", "pid=,ppid=,rss=,command="], { maxBuffer: 32e6 }, (e, out) => {
  if (e) return r(null);
  r(String(out).split("\n").map((l) => {
    const m = l.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(.*)$/);
    return m ? { pid: +m[1], ppid: +m[2], rss_kb: +m[3], command: m[4] } : null;
  }).filter(Boolean));
}));

const startedAt = new Date().toISOString();
const child = spawn(execBin, execArgs, { stdio: "inherit" });
const sampler = createSampler({ pid: child.pid, readProcessTable: readTable, intervalMs: 1000 }).start();

let released = false;
const release = (exitCode) => {
  if (released || !claim) return;
  released = true;
  sampler.stop();
  try { releaseCapacity(claim.claim_id, { exitCode }); } catch { /* reaped on next read */ }
  try { drainQueue({ capacity }); } catch { /* next acquire re-probes */ }
};
// Signals and uncaught throws must release too. The pid reaper is the backstop
// for anything that escapes even these.
for (const sig of ["SIGINT", "SIGTERM", "SIGHUP"]) process.on(sig, () => { release(null); process.exit(130); });
process.on("uncaughtException", (e) => { release(null); process.stderr.write(`${e}\n`); process.exit(1); });

const exitCode = await new Promise((r) => child.on("close", r));
const endedAt = new Date().toISOString();
const observation = observationRecord({ record: { ...workload, pid: child.pid }, startedAt, endedAt, exitCode, sampler });
const drift = detectWorkerCapDrift({ claim, observedWorkers: observation.observed_workers });
release(exitCode);

if (asJson) {
  process.stdout.write(`${JSON.stringify({
    governed: true, admitted: true, admission_ms: admissionMs,
    workload: { class: workload.workload_class, weight: acquired.weight, confidence: workload.confidence },
    workers: { requested: workersRequested, granted: capResult.granted, reason: capResult.reason },
    owner: { lane_id: workload.lane_id, execution_run_id: workload.execution_run_id, root_provider_pid: workload.root_provider_pid },
    observation, drift, exit_code: exitCode,
  }, null, 2)}\n`);
} else if (drift) {
  process.stderr.write(`worker-cap drift: granted ${drift.workers_granted}, observed ${drift.observed_workers} (reported, not killed)\n`);
}
process.exit(exitCode ?? 0);
