#!/usr/bin/env node
/**
 * `vac maintenance` — is weekly maintenance due, and could it safely proceed?
 *
 * READ-ONLY BY CONSTRUCTION. This never reboots, never cleans and never opens a
 * window. `--preflight` answers the question the scheduled cycle will ask, using
 * the same evaluator, so a dry run predicts the run rather than approximating
 * it. The reboot itself is an intent this prints and does not execute.
 *
 * Usage:
 *   vac-maintenance.mjs                 status: phase, cadence, next slot
 *   vac-maintenance.mjs --preflight     would maintenance be safe right now?
 *   vac-maintenance.mjs --survival      what a reboot does to each kind of state
 *   vac-maintenance.mjs --json
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  MAINTENANCE_POLICY, PHASE, REBOOT_SURVIVAL, CHECKPOINT_REQUIREMENTS,
  readMaintenanceWindow, maintenanceDue, evaluateDrain, evaluateCheckpoint,
  rebootDecision, assessCleanliness, planCleanup, certifyPostBoot,
} from "./lib/vacilando/host-maintenance.mjs";
import { maintenanceCadenceDue } from "./lib/vacilando/host-steward-cycle.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");

const readJson = (p, f = null) => { try { return existsSync(p) ? JSON.parse(readFileSync(p, "utf8")) : f; } catch { return f; } };

function governedActions() {
  const p = join(ROOT, "vacilando", "governed-actions", "requests.json");
  const raw = readJson(p, []);
  return Array.isArray(raw) ? raw : (raw?.requests || []);
}

function runs() {
  const dir = join(ROOT, "vacilando", "execution-runs");
  const out = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".json") || f === "admissions.json") continue;
      const j = readJson(join(dir, f), null);
      if (j && j.run_id) out.push(j);
      else if (Array.isArray(j)) out.push(...j.filter((x) => x?.run_id));
    }
  } catch { /* no runs is not an error */ }
  return out;
}

if (argv.includes("--survival")) {
  if (asJson) process.stdout.write(`${JSON.stringify(REBOOT_SURVIVAL, null, 2)}\n`);
  else {
    process.stdout.write("what a reboot does to each kind of state\n\n");
    for (const r of REBOOT_SURVIVAL) {
      process.stdout.write(`  ${r.class.padEnd(15)} ${r.subject.padEnd(34)} ${r.owner}\n`);
      if (r.note) process.stdout.write(`  ${" ".repeat(15)} ${r.note}\n`);
    }
  }
  process.exit(0);
}

const window = readMaintenanceWindow({ root: ROOT }) || { phase: PHASE.NORMAL };
const cadence = maintenanceCadenceDue({ root: ROOT });
const due = maintenanceDue({ root: ROOT });

if (argv.includes("--preflight")) {
  const actions = governedActions();
  const drain = evaluateDrain({ runs: runs(), governedActions: actions, trains: [], queue: [] });
  // Nothing is claimed measured that was not: an unmeasured checkpoint blocks,
  // and a preflight run from a CLI has measured none of it.
  const checkpoint = evaluateCheckpoint({ measurements: {} });
  const decision = rebootDecision({ preflight: { pass: true }, drain, checkpoint });

  const out = { root: ROOT, phase: window.phase, cadence, drain, checkpoint, decision };
  if (asJson) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); process.exit(decision.may_reboot ? 0 : 1); }

  process.stdout.write(`maintenance preflight — ${ROOT}\n\n`);
  process.stdout.write(`phase          ${window.phase}\n`);
  process.stdout.write(`cadence due    ${cadence.due}${cadence.reason ? `  (${cadence.reason})` : ""}\n`);
  process.stdout.write(`drain safe     ${drain.safe}  (${drain.active_runs} active run(s), ${drain.protected_mutations} protected mutation(s))\n`);
  for (const b of drain.blockers) process.stdout.write(`  BLOCK   ${b.kind}: ${b.detail}  [${b.owner}]\n`);
  for (const w of drain.warnings.slice(0, 6)) process.stdout.write(`  warn    ${w.kind}: ${w.detail}\n`);
  process.stdout.write(`checkpoint     ${checkpoint.durable}  (${checkpoint.reason})\n`);
  process.stdout.write(`\nmay reboot     ${decision.may_reboot}\n`);
  for (const r of decision.refusals) process.stdout.write(`  REFUSE  ${r.gate}: ${r.detail}\n`);
  if (decision.intent) process.stdout.write(`  intent  ${decision.intent.mechanism} ${decision.intent.argv.join(" ")} — ${decision.intent.restores_gateway_via}\n`);
  process.exit(decision.may_reboot ? 0 : 1);
}

const status = {
  root: ROOT, phase: window.phase, maintenance_id: window.maintenance_id || null,
  defers: window.defers || 0, cadence, due,
  slot: `weekday ${MAINTENANCE_POLICY.weekday} at ${String(MAINTENANCE_POLICY.hour_local).padStart(2, "0")}:00 local`,
  defer_window_hours: MAINTENANCE_POLICY.defer_window_ms / 3600000,
  checkpoint_requirements: CHECKPOINT_REQUIREMENTS.map((r) => r.id),
};
if (asJson) process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
else {
  process.stdout.write(`PHASE          ${status.phase}\n`);
  process.stdout.write(`SLOT           ${status.slot}, weekly\n`);
  process.stdout.write(`DEFER WINDOW   ${status.defer_window_hours}h, then operator attention\n`);
  process.stdout.write(`CADENCE DUE    ${cadence.due}${cadence.reason ? `  (${cadence.reason})` : ""}\n`);
  process.stdout.write(`DUE NOW        ${due.due}  (${due.reason})\n`);
}
