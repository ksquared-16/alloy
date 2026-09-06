#!/usr/bin/env node
/**
 * `vac hygiene` — the retention and reclamation surface.
 *
 * DEFAULT IS A SCOREBOARD AND NOTHING ELSE. It observes, classifies, prints and
 * exits. `--plan` shows what a cycle would do, still removing nothing.
 *
 * RECLAMATION NEEDS AN EXPLICIT SHAPE. `--apply` on its own is refused: it must
 * be either `--apply --cycle`, which runs the bounded policy cycle the Steward
 * itself runs, or `--apply --kind <k> --target <id>`, which narrows that same
 * cycle to one resource. A target NARROWS — the resource still has to be
 * classified RECLAIMABLE, still has to be inside policy, and still has to pass
 * its cooldown. There is no --force, and naming a resource is not permission to
 * remove it.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import "./lib/vacilando/bind-worker-cli-gateway-root.mjs";
import { runHygieneCycle } from "./lib/vacilando/hygiene-cycle.mjs";
import { observeHygiene } from "./lib/vacilando/hygiene-observe.mjs";
import { reconcileInterrupted } from "./lib/vacilando/hygiene-reclaim.mjs";
import { measureIntent } from "./lib/vacilando/hygiene-cycle.mjs";
import { listFindings } from "./lib/vacilando/operational-findings.mjs";

const argv = process.argv.slice(2);
const KNOWN = ["--json", "--plan", "--apply", "--cycle", "--kind", "--target", "--reconcile", "--no-bytes"];
const flag = (n) => argv.includes(n);
const value = (n) => { const i = argv.indexOf(n); return i > -1 ? argv[i + 1] ?? null : null; };
const unknown = argv.filter((a) => a.startsWith("--") && !KNOWN.includes(a));
if (unknown.length) {
  process.stderr.write(`vac hygiene: unknown option ${unknown[0]}\n`
    + "Usage: vac hygiene [--plan] [--apply (--cycle | --kind <k> --target <id>)] [--reconcile] [--json] [--no-bytes]\n");
  process.exit(2);
}

const json = flag("--json");
const apply = flag("--apply");
const cycle = flag("--cycle");
const kind = value("--kind");
const target = value("--target");
const withBytes = !flag("--no-bytes");
const root = process.env.ALLOY_RUNTIME_ROOT || join(homedir(), ".local", "state", "alloy-dev", "gateway");
const requestingWorktree = process.env.ALLOY_WORKTREE || process.cwd();

if (apply && !cycle && !(kind && target)) {
  // Fail closed. An `--apply` that defaulted to "everything" is exactly the
  // command nobody should be one typo away from.
  process.stderr.write("vac hygiene: --apply requires either --cycle or an explicit --kind <k> --target <id>\n");
  process.exit(2);
}
if (kind && !["worktree", "registration", "artifact", "toolkit"].includes(kind)) {
  process.stderr.write(`vac hygiene: --kind must be one of worktree, registration, artifact, toolkit\n`);
  process.exit(2);
}

if (flag("--reconcile")) {
  const out = reconcileInterrupted({ root, measure: (i) => measureIntent(i) });
  if (json) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); process.exit(out.ok ? 0 : 1); }
  if (!out.ok) { process.stdout.write(`reconcile failed: ${out.error}\n`); process.exit(1); }
  process.stdout.write(`examined ${out.examined} interrupted reclamation(s)\n`);
  for (const r of out.resolved) process.stdout.write(`  · ${r.reclamation_id} ${r.phase}: ${r.why}\n`);
  process.exit(0);
}

const findings = listFindings(root)
  .filter((f) => !["CLOSED", "ACCEPTED_DEBT"].includes(f.status)
    && /toolkit|worktree|estate|hygiene|retention/i.test(`${f.id} ${f.title}`))
  .map((f) => ({ id: f.id, status: f.status, severity: f.severity, title: f.title }));

if (!apply && !flag("--plan")) {
  const obs = observeHygiene({ root, requestingWorktree, withBytes, findings });
  if (json) { process.stdout.write(`${JSON.stringify(obs.scoreboard, null, 2)}\n`); process.exit(0); }
  printScoreboard(obs.scoreboard);
  process.exit(0);
}

const out = await runHygieneCycle({
  root, requestingWorktree, withBytes,
  dryRun: !apply,
  only: kind && target ? { kind, resourceId: target } : null,
});
if (json) { process.stdout.write(`${JSON.stringify(out, null, 2)}\n`); process.exit(out.ok ? 0 : 1); }
if (!out.ok) { process.stdout.write(`hygiene cycle refused: ${out.error}\n`); process.exit(1); }
printScoreboard(out.scoreboard);
process.stdout.write(`\n${apply ? "cycle" : "plan (nothing removed)"}\n`);
if (out.reconciled?.examined) process.stdout.write(`  reconciled  ${out.reconciled.examined} interrupted reclamation(s)\n`);
process.stdout.write(`  planned     ${out.planned.length}\n`);
for (const p of out.planned) process.stdout.write(`   · ${p.kind} ${p.resource_id}${p.bytes ? ` (${mb(p.bytes)})` : ""} — ${p.reason}\n`);
for (const [k, b] of Object.entries(out.bounds || {})) if (b.reason) process.stdout.write(`  bound       ${k}: ${b.reason}\n`);
if (out.excluded?.length) {
  process.stdout.write(`  excluded    ${out.excluded.length}\n`);
  for (const e of out.excluded.slice(0, 10)) process.stdout.write(`   · ${e.kind} ${e.resource_id}: ${e.why}\n`);
}
if (apply) {
  process.stdout.write(`  executed    ${out.executed.length} · failed ${out.failed.length} · reclaimed ${mb(out.bytes_reclaimed)}\n`);
  for (const e of out.executed) process.stdout.write(`   · ${e.action} ${e.resource_id} (${mb(e.bytes_reclaimed)})\n`);
  for (const e of out.failed) process.stdout.write(`   · FAILED ${e.action} ${e.resource_id}: ${e.error}\n`);
}
for (const d of out.director_attention || []) process.stdout.write(`  ${d.kind}     ${d.why} — ${d.decision}\n`);
process.exit(0);

function mb(n) {
  const b = Number(n) || 0;
  if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
  if (b >= 1048576) return `${Math.round(b / 1048576)} MB`;
  return `${Math.round(b / 1024)} KB`;
}

function printScoreboard(s) {
  const w = s.worktrees; const t = s.toolkits; const a = s.artifacts;
  process.stdout.write(`Hygiene estate  ${s.observed_at}\n`);
  process.stdout.write(`  worktrees     ${w.total} · healthy/expected ${w.active_or_expected} · reclaimable ${w.reclaimable} · attention ${w.needs_attention} · unknown ${w.unknown}\n`);
  process.stdout.write(`                dirty ${w.dirty_protected} · unique-commit ${w.unique_commit_protected} · ${mb(w.estate_bytes)} estate, ${mb(w.safely_reclaimable_bytes)} safely reclaimable\n`);
  process.stdout.write(`  registrations ${s.registrations.total} · stale ${s.registrations.stale}\n`);
  process.stdout.write(`  toolkits      ${t.total} · retained ${t.retained} · reclaimable ${t.reclaimable} · ${mb(t.bytes_reclaimable || 0)} reclaimable${t.execution_blocked ? " (BLOCKED)" : ""}\n`);
  process.stdout.write(`  artifacts     ${a.total} · ${mb(a.estate_bytes)} estate · ${mb(a.safely_reclaimable_bytes)} reclaimable\n`);
  for (const [cls, v] of Object.entries(a.by_retention_class || {})) {
    process.stdout.write(`     ${cls.padEnd(18)} ${String(v.count).padStart(3)} · ${mb(v.bytes)}${v.reclaimable ? ` · ${v.reclaimable} reclaimable` : ""}\n`);
  }
  if (s.last_cycle) process.stdout.write(`  last cycle    ${s.last_cycle.ended_at} · reclaimed ${s.last_cycle.reclaimed.length} · ${mb(s.last_cycle.bytes_reclaimed)}\n`);
  if (s.findings_affecting_hygiene?.length) {
    process.stdout.write(`  findings\n`);
    for (const f of s.findings_affecting_hygiene) process.stdout.write(`     ${f.status.padEnd(10)} ${f.id}\n`);
  }
  process.stdout.write(`  ${s.headline}\n`);
}
