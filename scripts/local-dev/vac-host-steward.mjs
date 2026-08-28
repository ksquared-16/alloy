#!/usr/bin/env node
/**
 * `vac host-steward` — what the steward can see and what it would do.
 *
 * DEFAULT IS READ-ONLY. `--apply` performs only the deterministic, autonomous
 * actions the policy already permits without an operator; anything crossing the
 * human boundary is surfaced and never performed here.
 *
 * There is no --force. The point of the subsystem is that routine residue is
 * reconciled on evidence, not on insistence.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir, loadavg, cpus } from "node:os";
import { join } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { buildStewardPlan, OWNERSHIP } from "./lib/vacilando/host-steward.mjs";
import { residualHeavyCommands, asStewardResource } from "./lib/vacilando/heavy-command-registry.mjs";
import { applyStewardPlan } from "./lib/vacilando/host-steward-execute.mjs";
import { classifyHostAdmission } from "./lib/vacilando/host-admission.mjs";
import { executionRunStorePath } from "./lib/vacilando/execution-run.mjs";

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const cycle = argv.includes("--cycle");
const status = argv.includes("--status");
const json = argv.includes("--json");
const unknown = argv.filter((a) => a.startsWith("--") && !["--apply", "--json", "--cycle", "--status"].includes(a));
if (unknown.length) {
  process.stderr.write(`vac host-steward: unknown option ${unknown[0]}\nUsage: vac host-steward [--cycle] [--status] [--apply] [--json]\n`);
  process.exit(2);
}

const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const nowMs = Date.now();

if (status) {
  const { stewardStatus } = await import("./lib/vacilando/host-steward-cycle.mjs");
  const st = stewardStatus({ root, nowMs });
  if (json) { process.stdout.write(`${JSON.stringify(st, null, 2)}\n`); process.exit(0); }
  process.stdout.write(`Host Steward\n`);
  process.stdout.write(`  ${st.stale ? "STALE — no cycle within cadence" : "healthy"} · last cycle ${st.last_cycle_at || "never"}${st.last_cycle_ms != null ? ` (${st.last_cycle_ms}ms)` : ""}\n`);
  process.stdout.write(`  cycles ${st.cycles_recorded} · executed ${st.actions_executed} · refused ${st.actions_refused}\n`);
  if (st.history.length) {
    process.stdout.write(`\nRecent:\n`);
    for (const h of st.history.slice(-8)) process.stdout.write(`  · ${h.action} ${h.resource} (${h.owner})${h.ok ? "" : " — FAILED"}\n`);
  }
  if (st.escalations.length) {
    process.stdout.write(`\nEscalations:\n`);
    for (const e of st.escalations) process.stdout.write(`  · ${e.resource || e.action}: ${e.why}\n`);
  }
  process.exit(0);
}

if (cycle) {
  const { runStewardCycle } = await import("./lib/vacilando/host-steward-run.mjs");
  const out = runStewardCycle({ root, nowMs, dryRun: !apply });
  if (json) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); process.exit(0); }
  if (!out.ok) { process.stdout.write(`cycle refused: ${out.error}\n`); process.exit(1); }
  process.stdout.write(`cycle       ${out.cycle_id}${out.dry_run ? " (dry run)" : ""}\n`);
  process.stdout.write(`admission   ${out.admission_before?.state ?? "unknown"}${out.admission_after ? ` -> ${out.admission_after.state}` : ""}\n`);
  process.stdout.write(`observed    ${JSON.stringify(out.plan.classifications)}\n`);
  process.stdout.write(`proposed    ${out.plan.proposed.length}\n`);
  for (const p of out.plan.proposed) process.stdout.write(`   · [${p.priority}] ${p.action} ${p.resource_key} -> ${p.owner}\n`);
  process.stdout.write(`suppressed  ${out.plan.suppressed.length}\n`);
  for (const p of out.plan.suppressed) process.stdout.write(`   · ${p.action} ${p.resource_key}: ${p.suppressed_because}\n`);
  if (!out.dry_run) {
    process.stdout.write(`executed    ${out.executed.length} · refused ${out.refused.length} · problems ${out.problems.length}\n`);
    for (const e of out.executed) process.stdout.write(`   · ${e.action} ${e.resource_key} verified=${e.postcondition_verified}\n`);
  }
  process.exit(0);
}

function runStates() {
  const byId = new Map();
  try {
    const p = executionRunStorePath(root);
    if (!existsSync(p)) return null;
    const j = JSON.parse(readFileSync(p, "utf8"));
    for (const v of Object.values(j.lanes || {})) {
      const rs = Array.isArray(v) ? v : (v.runs || Object.values(v).find(Array.isArray) || []);
      for (const r of rs) if (r?.run_id) byId.set(r.run_id, r.state);
    }
    return byId;
  } catch { return null; }
}
const states = runStates();
const groupAlive = (pgid) => { try { process.kill(-Number(pgid), 0); return true; } catch { return false; } };

const residual = residualHeavyCommands({
  root,
  runStateFor: (id) => (states ? states.get(id) ?? null : null),
  groupAlive,
  nowMs,
});
const plan = buildStewardPlan(residual.map((r) => asStewardResource(r)), { nowMs });

// Host admission, measured from the same signals the policy declares.
function hostSignals() {
  const sh = (c, a) => { try { return execFileSync(c, a, { encoding: "utf8", timeout: 15000 }); } catch { return ""; } };
  const vm = sh("/usr/bin/vm_stat", []);
  const page = Number((vm.match(/page size of (\d+)/) || [])[1] || 16384);
  const pages = (k) => { const m = vm.match(new RegExp(`${k}:\\s+(\\d+)`)); return m ? Number(m[1]) * page : null; };
  const swap = sh("/usr/sbin/sysctl", ["-n", "vm.swapusage"]);
  const mb = (k) => { const m = swap.match(new RegExp(`${k} = ([0-9.]+)M`)); return m ? Number(m[1]) * 1048576 : null; };
  const total = Number(sh("/usr/sbin/sysctl", ["-n", "hw.memsize"]).trim()) || null;
  const free = pages("Pages free");
  const inactive = pages("Pages inactive");
  const spec = pages("Pages speculative");
  const purge = pages("Pages purgeable");
  return {
    totalBytes: total,
    freeBytes: free,
    availableBytes: free != null ? free + (spec || 0) + (purge || 0) + (inactive || 0) * 0.5 : null,
    compressorBytes: pages("Pages occupied by compressor"),
    swapTotalBytes: mb("total"), swapUsedBytes: mb("used"),
  };
}
const sig = hostSignals();
sig.loadAvg = loadavg();
sig.cores = cpus().length;
sig.residueFootprintBytes = residual.reduce((s, r) => s + (r.footprint_bytes || 0), 0);
const admission = classifyHostAdmission(sig);

if (json) {
  process.stdout.write(`${JSON.stringify({ plan, admission, residual }, null, 2)}\n`);
  process.exit(0);
}

process.stdout.write(`host        ${admission.state}${admission.admitted ? " (admitted)" : " (NOT ADMITTED)"}\n`);
for (const r of admission.reasons) process.stdout.write(`   · ${r}\n`);
process.stdout.write(`residue     ${residual.length} registered heavy command group(s) still live\n`);
process.stdout.write(`plan        ${plan.fingerprint}\n`);
process.stdout.write(`autonomous  ${plan.autonomous.length}\n`);
for (const d of plan.autonomous) process.stdout.write(`   · ${d.action} ${d.evidence.command?.slice(0, 70)} (${d.reason})\n`);
process.stdout.write(`waiting     ${plan.waiting.length}\n`);
process.stdout.write(`preserved   ${plan.preserved.length}\n`);
process.stdout.write(`surfaced    ${plan.surfaced.length}\n`);
for (const d of plan.surfaced) process.stdout.write(`   · ${d.resource_class} — ${d.detail}\n`);

if (!apply) {
  process.stdout.write(`\nRead-only. Nothing was changed. Run 'vac host-steward --apply' to reconcile the autonomous set.\n`);
  process.exit(0);
}
if (!plan.autonomous.length) {
  process.stdout.write(`\nNothing to reconcile.\n`);
  process.exit(0);
}
const out = applyStewardPlan({ plan, freshResources: residual.map((r) => asStewardResource(r)), root, nowMs });
process.stdout.write(`\nreconciled  ${out.applied_count} · refused ${out.refused_count}\n`);
for (const a of out.applied) process.stdout.write(`   · ${a.action} pgid ${a.evidence.pgid} -> killed ${JSON.stringify(a.result.killed)}\n`);
for (const a of out.refused) process.stdout.write(`   · REFUSED ${a.action || a.resource_class}: ${a.error}\n`);
process.exit(out.ok ? 0 : 1);
