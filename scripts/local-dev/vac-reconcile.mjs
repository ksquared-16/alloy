#!/usr/bin/env node
/**
 * `vac reconcile` — S7 reconciliation.
 *
 * DEFAULT IS READ-ONLY and writes nothing. `--apply` does not apply anything
 * either: it FILES a governed action and returns its state. This file is a
 * REQUEST SURFACE, not an authority. It imports no apply function, so there is
 * no path through this command that writes metadata, and a control asserts
 * that rather than trusting the comment.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { observeReconciliation } from "./lib/vacilando/reconciliation-observe.mjs";
import { buildReconciliationPlan } from "./lib/vacilando/reconciliation-plan.mjs";
import { requestGovernedAction } from "./lib/vacilando/governed-action-request.mjs";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const json = args.includes("--json");
const unknown = args.filter((a) => !["--apply", "--json"].includes(a));
if (unknown.length) {
  // An unrecognised option must never fall through into a mutation path.
  process.stderr.write(`vac reconcile: unknown option ${unknown[0]}\nUsage: vac reconcile [--apply] [--json]\n`);
  process.exit(2);
}

const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const worktreeParent = join(homedir(), "Code", "alloy-worktrees");

function readProcesses() {
  try {
    return execFileSync("ps", ["-Ao", "pid=,args="], { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 })
      .split("\n").map((l) => { const m = l.trim().match(/^(\d+)\s+(.*)$/); return m ? { pid: Number(m[1]), command: m[2] } : null; })
      .filter(Boolean);
  } catch { return []; }
}
function readGitWorktrees() {
  for (const cwd of [join(homedir(), "Alloy"), process.cwd()]) {
    try {
      return execFileSync("git", ["worktree", "list", "--porcelain"], { cwd, encoding: "utf8", timeout: 15000 })
        .split("\n").filter((l) => l.startsWith("worktree ")).map((l) => l.replace("worktree ", ""));
    } catch { /* try the next */ }
  }
  return null;
}
function readActiveRuns() {
  const byWorktree = {};
  try {
    const p = join(root, "vacilando", "execution-runs", "runs.json");
    if (!existsSync(p)) return byWorktree;
    const j = JSON.parse(readFileSync(p, "utf8"));
    const terminal = new Set(["COMPLETE", "FAILED", "ABANDONED"]);
    for (const v of Object.values(j.lanes || {})) {
      const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
      for (const r of rs) {
        if (!r || terminal.has(String(r.state).toUpperCase()) || !r.worktree_path) continue;
        (byWorktree[String(r.worktree_path).split("/").pop()] ||= []).push({ run_id: r.run_id });
      }
    }
  } catch { /* unknown stays unknown */ }
  return byWorktree;
}

const observation = observeReconciliation({
  root,
  processes: readProcesses(),
  worktreeParent,
  gitWorktrees: readGitWorktrees(),
  activeRunsByWorktree: readActiveRuns(),
});
const plan = buildReconciliationPlan(observation);

const wtStates = {};
for (const w of observation.worktrees) wtStates[w.state] = (wtStates[w.state] || 0) + 1;
const portStates = {};
for (const p of observation.ports) portStates[p.verdict] = (portStates[p.verdict] || 0) + 1;
const byKind = (list) => list.reduce((a, c) => { a[c.kind] = (a[c.kind] || 0) + 1; return a; }, {});
const protectedItems = observation.worktrees.filter((w) => w.state === "protected");

if (json && !apply) {
  process.stdout.write(`${JSON.stringify({ plan, ports: portStates, worktrees: wtStates }, null, 2)}\n`);
  process.exit(0);
}

process.stdout.write(`plan        ${plan.plan_id}\nfingerprint ${plan.fingerprint}\n`);
process.stdout.write(`ports       ${JSON.stringify(portStates)}\n`);
process.stdout.write(`worktrees   ${JSON.stringify(wtStates)}\n`);
process.stdout.write(`corrections ${plan.corrections.length} ${JSON.stringify(byKind(plan.corrections))}\n`);
process.stdout.write(`withheld    ${plan.withheld.length} ${JSON.stringify(byKind(plan.withheld))}\n`);
for (const w of plan.withheld) process.stdout.write(`   withheld  ${w.kind} ${w.path || w.port} — ${w.reason}\n`);
process.stdout.write(`protected   ${protectedItems.length}\n`);
for (const w of protectedItems) process.stdout.write(`   protected ${w.path} — ${(w.retirement_blocked_by || w.reasons || []).join("; ")}\n`);
process.stdout.write(`unsupported ${(plan.unsupported || []).length}\n`);

if (!apply) {
  process.stdout.write(`\nRead-only. Nothing was changed. Run 'vac reconcile --apply' to FILE a governed request.\n`);
  process.exit(0);
}

if (!plan.corrections.length) {
  process.stdout.write(`\nNothing safe to apply. No governed request filed.\n`);
  process.exit(0);
}

// --apply FILES a request. It does not apply anything.
const laneId = process.env.VAC_LANE || process.env.ALLOY_LANE_ID || null;
const runId = process.env.VAC_RUN || process.env.ALLOY_RUN_ID || null;
const out = requestGovernedAction({
  lane_id: laneId,
  run_id: runId,
  action_key: "vacilando.apply_reconciliation_plan",
  target: "staging",
  title: "Apply Vacilando reconciliation metadata",
  purpose: `Correct Vacilando metadata to match observed reality: ${plan.corrections.length} safe correction(s), ${plan.withheld.length} withheld, ${protectedItems.length} protected.`,
  reason_worker_cannot_execute: "Metadata reconciliation is a governed trusted-host action; a worker may not write the canonical stores.",
  inputs: {
    planId: plan.plan_id,
    planFingerprint: plan.fingerprint,
    generatedAt: plan.generated_at,
    policyVersion: plan.policy_version,
    corrections: plan.corrections,
    withheld: plan.withheld,
    runtimeRoot: root,
    worktreeParent,
    workTitle: "Vacilando reconciliation",
  },
}, { processNow: true });

process.stdout.write(`\ngoverned request: ${out.ok ? "filed" : `refused (${out.error})`}\n`);
if (out.request?.request_id || out.request_id) {
  process.stdout.write(`state: ${out.request?.status || out.status || "unknown"}\n`);
}
process.exit(out.ok ? 0 : 1);
