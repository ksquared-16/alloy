#!/usr/bin/env node
/**
 * S5 admission for `alloy-validate` — the convergence shim.
 *
 * `alloy-validate` used to hold TWO capacity gates of its own: a host-wide
 * mkdir mutex and a counted heavy-job budget. Neither knew anything about S5's
 * weighted tokens, so the same class of work was authorised twice by two
 * regimes that could not see each other. This replaces both with one S5
 * decision, and prints shell-evaluable assignments so the bash broker can hold
 * the claim and release it on its existing exit trap.
 *
 *   eval "$(vac-validate-admit.mjs --kind test --command "…")"
 *   …run…
 *   vac-validate-release.mjs "$ALLOY_S5_CLAIM_ID" "$rc"
 *
 * A queued admission WAITS here, bounded by S5's own deadline, because that is
 * what the mutex did — the shape callers depend on is "block until it is my
 * turn", and changing that would be a behaviour change disguised as a refactor.
 */
import os from "node:os";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";

import { classifyWorkload, normalizeInvocation, expectedWeight } from "./lib/vacilando/workload-classification.mjs";
import { hostCapability, computeCapacityPolicy } from "./lib/vacilando/capacity-policy.mjs";
import { acquireCapacity, applyWorkerCeiling, drainQueue, isEnforced } from "./lib/vacilando/validation-admission.mjs";
import { probeLoad, probeMemory, probeDisk, withBudget } from "./lib/vacilando/health-probes.mjs";

const argv = process.argv.slice(2);
const flag = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] ?? null : null; };
const kind = flag("--kind") || "command";
const commandLine = flag("--command") || "";
const noWait = argv.includes("--no-wait");

const sh = (k, v) => `${k}=${JSON.stringify(String(v ?? ""))}; export ${k};`;

if (!commandLine.trim()) {
  process.stderr.write("vac-validate-admit: --command is required\n");
  process.exit(2);
}

const normalized = normalizeInvocation(commandLine);
let workload = classifyWorkload({ command: commandLine, pid: process.pid, attribution: null });

// A kind alloy-validate already knows is authoritative about the class; the
// classifier still decides weight and workers. This is the ONE place the two
// vocabularies meet, and the kind never overrides a heavier classification.
const KIND_CLASS = {
  typecheck: "typecheck", "typecheck:tests": "typecheck", test: "heavy_test",
  build: "production_build", playwright: "browser_e2e", imports: "targeted_test",
};
if (!workload.workload_class && KIND_CLASS[kind]) {
  workload = { ...workload, workload_class: KIND_CLASS[kind], confidence: "authoritative", expected_weight: expectedWeight(KIND_CLASS[kind]) };
}

if (!isEnforced(workload.workload_class)) {
  process.stdout.write([
    sh("ALLOY_S5_CLAIM_ID", ""),
    sh("ALLOY_S5_CLASS", workload.workload_class || "unclassified"),
    sh("ALLOY_S5_ENFORCED", "0"),
    sh("ALLOY_S5_WORKER_CEILING", ""),
  ].join("\n") + "\n");
  process.exit(0);
}

const [memory, disk, load] = [
  await withBudget(probeMemory({ os }), 3500, null),
  probeDisk({}),
  probeLoad({ os }),
];
const capacity = computeCapacityPolicy(hostCapability({ os, disk, memory, load, seats: [], devServers: 0, workloads: [] }));
const ceiling = capacity.axes.validation_capacity.worker_ceiling;

const cap = applyWorkerCeiling(normalized.args, ceiling, { tool: normalized.tool });
if (cap.changed) {
  workload = {
    ...workload,
    workers_granted: cap.granted,
    expected_weight: workload.workload_class === "heavy_test"
      ? expectedWeight("heavy_test", { workers: cap.granted })
      : workload.expected_weight,
  };
}

let acquired = acquireCapacity({
  workload, capacity, pid: Number(process.env.ALLOY_VALIDATE_HOLDER_PID) || process.pid,
  workersRequested: workload.workers_requested ?? null, workersGranted: cap.granted,
});

let waited = 0;
while (acquired.queued) {
  const entry = acquired.queue_entry;
  if (noWait) { process.stderr.write(`queued: ${entry.blocked_by.map((b) => b.axis).join(", ")}\n`); process.exit(75); }
  process.stderr.write(`waiting for validation capacity — blocked by ${entry.blocked_by.map((b) => b.axis).join(", ")} (held ${entry.current_held}/${entry.budget})\n`);
  if (Date.now() > entry.wait_deadline) {
    process.stderr.write("alloy-validate: capacity wait exceeded its bound; not started\n");
    process.exit(75);
  }
  await new Promise((r) => { setTimeout(r, Math.min(5000, 1000 + waited * 500)); });
  waited += 1;
  drainQueue({ capacity });
  acquired = acquireCapacity({
    workload, capacity, pid: Number(process.env.ALLOY_VALIDATE_HOLDER_PID) || process.pid,
    workersRequested: workload.workers_requested ?? null, workersGranted: cap.granted,
  });
}

process.stdout.write([
  sh("ALLOY_S5_CLAIM_ID", acquired.claim?.claim_id || ""),
  sh("ALLOY_S5_CLASS", workload.workload_class),
  sh("ALLOY_S5_ENFORCED", "1"),
  sh("ALLOY_S5_WORKER_CEILING", ceiling),
  sh("ALLOY_S5_WORKERS_GRANTED", cap.granted ?? ""),
  sh("ALLOY_S5_WEIGHT", acquired.weight === undefined ? "exclusive" : acquired.weight),
].join("\n") + "\n");
