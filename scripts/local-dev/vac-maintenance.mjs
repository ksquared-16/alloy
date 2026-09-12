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
import { collectCheckpoint } from "./lib/vacilando/maintenance-activation.mjs";
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

/** Lanes, from the durable registry the lane owner already writes. */
function lanes() {
  const p = join(ROOT, "vacilando", "lanes", "lanes.json");
  const j = readJson(p, null);
  const raw = j?.lanes;
  const list = Array.isArray(raw) ? raw : (raw && typeof raw === "object" ? Object.values(raw) : null);
  if (!list) return null;
  return list.map((l) => ({
    lane_id: l.lane_id ?? null,
    active: String(l.status || l.state || "").toUpperCase() === "ACTIVE",
    blocked_on: l.blocked_on ?? null,
    restart_context: l.restart_context || l.next_step || null,
    blocker_recorded: Boolean(l.blockers?.length),
  }));
}

/**
 * Worktrees, with branch durability measured by its canonical owner.
 *
 * There is no persisted durability file — DevOps 3 measures it live, because a
 * stored durability class is stale the moment somebody commits. So this calls
 * `measureWorktreeGit`, which is the same function retirement itself uses, and
 * gets the same answer retirement would get. Read-only git plumbing per
 * worktree; nothing is written and nothing is reclaimed.
 *
 * An unreadable worktree yields `durability: null`, which the collector treats
 * as UNMEASURED and which blocks — the DevOps 3 law that unmeasured durability
 * must never precede a destructive step, applied to a reboot.
 */
async function worktrees() {
  let measure;
  try {
    ({ measureWorktreeGit: measure } = await import("./lib/vacilando/worktree-retirement-observe.mjs"));
  } catch { return null; }
  const roots = [join(homedir(), "Code", "alloy-worktrees"), join(homedir(), "Code", "alloy-promotions")];
  const out = [];
  for (const root of roots) {
    let names = [];
    try { names = readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch { continue; }
    for (const name of names) {
      const full = join(root, name);
      try {
        const m = measure(full);
        out.push({ name, path: full, durability: m?.durability ?? null });
      } catch {
        out.push({ name, path: full, durability: null });
      }
    }
  }
  return out.length ? out : null;
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
  const allRuns = runs();
  const drain = evaluateDrain({ runs: allRuns, governedActions: actions, trains: [], queue: [] });

  /*
   * THE COLLECTORS, WIRED. DevOps 7 shipped this gate with nothing behind it, so
   * the live preflight reported all five requirements UNMEASURED and refused —
   * correct, and useless. Each observation below is read from the owner that
   * already holds it; anything this CLI genuinely cannot see stays absent, and an
   * absent observation is still UNMEASURED, which still blocks.
   */
  const observations = {
    lanes: lanes(),
    runs: allRuns,
    governedActions: actions,
    worktrees: await worktrees(),
  };
  const collected = collectCheckpoint(observations);
  const checkpoint = evaluateCheckpoint({ measurements: collected.measurements });
  const decision = rebootDecision({ preflight: { pass: true }, drain, checkpoint });

  const out = { root: ROOT, phase: window.phase, cadence, drain, checkpoint, collected, decision };
  if (asJson) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); process.exit(decision.may_reboot ? 0 : 1); }

  process.stdout.write(`maintenance preflight — ${ROOT}\n\n`);
  process.stdout.write(`phase          ${window.phase}\n`);
  process.stdout.write(`cadence due    ${cadence.due}${cadence.reason ? `  (${cadence.reason})` : ""}\n`);
  process.stdout.write(`drain safe     ${drain.safe}  (${drain.active_runs} active run(s), ${drain.protected_mutations} protected mutation(s))\n`);
  for (const b of drain.blockers) process.stdout.write(`  BLOCK   ${b.kind}: ${b.detail}  [${b.owner}]\n`);
  for (const w of drain.warnings.slice(0, 6)) process.stdout.write(`  warn    ${w.kind}: ${w.detail}\n`);
  process.stdout.write(`checkpoint     ${checkpoint.durable}  (${checkpoint.reason})\n`);
  for (const r of collected.rows) {
    process.stdout.write(`  ${r.outcome.padEnd(11)} ${r.id.padEnd(30)} ${r.detail || ""}\n`);
  }
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
