#!/usr/bin/env node
/**
 * S9 — `alloy-toolkit prune`.
 *
 * PLAN IS THE DEFAULT. Running this with no flags deletes nothing and says so.
 * `--yes` is the only thing that permits removal, and even then the plan is
 * recomputed from live state first: the plan you were shown is evidence, not
 * permission.
 *
 * The toolkit is the machine's recovery path, so every ambiguity resolves
 * toward keeping the directory. A version with no manifest, a version whose
 * install time cannot be read, and a version that might be what a running
 * process is executing are all retained — and each says which of those it is.
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, lstatSync, readlinkSync, rmSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  RETENTION_POLICY_V1,
  buildInventory,
  comparePlans,
  configuredKeepN,
  diskHygiene,
  executePrune,
  formatBytes,
  planPrune,
  resolveProcessPins,
  retentionSeverity,
} from "./lib/vacilando/toolkit-retention.mjs";

const ROOT = process.env.ALLOY_TOOLKIT_ROOT || join(homedir(), ".local", "share", "alloy", "toolkit");
const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const confirmed = argv.includes("--yes");
const quiet = argv.includes("--quiet");

function bounded(cmd, args, { timeoutMs = 20000 } = {}) {
  try {
    return String(execFileSync(cmd, args, { encoding: "utf8", timeout: timeoutMs, maxBuffer: 32 * 1024 * 1024 }));
  } catch { return null; }
}

/** `current` as a version id, or null. Never guessed from anything else. */
function currentVersion() {
  const link = join(ROOT, "current");
  try {
    if (!lstatSync(link).isSymbolicLink()) return null;
    return basename(resolve(ROOT, readlinkSync(link)));
  } catch { return null; }
}

function readManifest(dir) {
  const p = join(dir, "INSTALL-MANIFEST");
  if (!existsSync(p)) return null;
  const out = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const i = line.indexOf("=");
    if (i > 0) out[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return out;
}

/** Explicit pins live beside the versions, one id per line. Comments allowed. */
function explicitPins() {
  const p = join(ROOT, "PINNED");
  if (!existsSync(p)) return [];
  return readFileSync(p, "utf8").split("\n")
    .map((l) => l.replace(/#.*$/, "").trim()).filter(Boolean);
}

/** Sizes in one pass. A size we cannot read is null, never zero. */
function diskBytesFor(dirs) {
  const sizes = new Map();
  const out = bounded("du", ["-sk", ...dirs], { timeoutMs: 60000 });
  if (!out) return sizes;
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+)\s+(.+)$/);
    if (m) sizes.set(basename(m[2].trim()), Number(m[1]) * 1024);
  }
  return sizes;
}

function readVersions() {
  if (!existsSync(ROOT)) return [];
  const names = readdirSync(ROOT, { withFileTypes: true })
    .filter((d) => (d.isDirectory() || d.isSymbolicLink()) && d.name !== "current" && !d.name.startsWith("."))
    .map((d) => d.name)
    .filter((n) => {
      try { return statSync(join(ROOT, n)).isDirectory(); } catch { return false; }
    });
  const sizes = diskBytesFor(names.map((n) => join(ROOT, n)));
  return names.map((name) => {
    const dir = join(ROOT, name);
    const manifest = readManifest(dir);
    let mtime = null;
    try { mtime = statSync(dir).mtimeMs; } catch { mtime = null; }
    return {
      version: name,
      path: dir,
      // Manifest time is authoritative; mtime is a fallback and the inventory
      // records which one it used.
      installed_at: manifest?.installed_at || (mtime != null ? mtime : null),
      provenance: manifest ? { source_commit: manifest.source_commit || null, source_ref: manifest.source_ref || null, installed_by: manifest.installed_by || null } : null,
      source_commit: manifest?.source_commit || null,
      source_ref: manifest?.source_ref || null,
      disk_bytes: sizes.get(name) ?? null,
    };
  });
}

function readProcesses() {
  const text = bounded("ps", ["-Ao", "pid=,ppid=,command="], { timeoutMs: 8000 });
  if (!text) return null;
  const rows = [];
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
    if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), command: m[3] });
  }
  return rows;
}

function gather() {
  const processes = readProcesses();
  const keepN = configuredKeepN(process.env);
  // A process table we could not read is not an empty process table. Synthesise
  // one unresolved pin so the plan blocks rather than pruning blind.
  const pins = processes
    ? resolveProcessPins({ processes })
    : { pins: {}, pinned_versions: [], unresolved: [{ pid: null, command: null, reason: "the process table could not be read; live pins are unknown" }], fully_resolved: false };
  const currentSha = currentVersion();
  const inventory = buildInventory({
    versions: readVersions(),
    currentSha,
    pins,
    pinnedVersions: explicitPins(),
    keepN,
  });
  return { inventory, currentSha, pins, keepN };
}

const state = gather();
const plan = planPrune({ ...state, now: Date.now() });

if (!confirmed) {
  if (asJson) {
    process.stdout.write(`${JSON.stringify({ ...plan, hygiene: diskHygiene({ plan }) }, null, 2)}\n`);
    process.exit(0);
  }
  const w = (s) => process.stdout.write(s);
  const sev = retentionSeverity(plan);
  w(`\nToolkit retention — PLAN ONLY, nothing will be deleted\n${"─".repeat(64)}\n`);
  w(`root        ${ROOT}\n`);
  w(`current     ${plan.current || "(does not resolve)"}\n`);
  w(`policy      ${plan.policy_version} · keep_n ${plan.keep_n} · unknown is protected\n`);
  w(`installed   ${plan.total_installed}   retained ${plan.retained_count}   prunable ${plan.prunable_count}\n`);
  w(`disk        ${formatBytes(plan.bytes_retained)} retained · ${formatBytes(plan.bytes_reclaimable)} reclaimable\n`);
  w(`verdict     ${sev.severity.toUpperCase()} — ${sev.why}\n`);
  if (plan.execution_blocked) {
    w(`\nEXECUTION BLOCKED\n  ${plan.blocked_reason}\n`);
    for (const u of plan.unresolved_pins) w(`  pid ${u.pid ?? "?"} — ${u.reason}\n`);
  }
  if (!quiet) {
    w(`\nRetained (${plan.retained_count})\n`);
    const byReason = new Map();
    for (const r of plan.retained_detail) {
      const key = r.reasons.join(", ") || "(none)";
      if (!byReason.has(key)) byReason.set(key, []);
      byReason.get(key).push(r);
    }
    for (const [reason, list] of [...byReason].sort((a, b) => b[1].length - a[1].length)) {
      w(`  ${reason} — ${list.length}\n`);
      for (const r of list.slice(0, 6)) {
        w(`      ${r.version}  ${formatBytes(r.disk_bytes)}${r.live_pids.length ? `  pids ${r.live_pids.join(",")}` : ""}\n`);
      }
      if (list.length > 6) w(`      … and ${list.length - 6} more\n`);
    }
    w(`\nProposed for prune (${plan.prune.length})\n`);
    for (const p of plan.prune) w(`      ${p.version}  ${formatBytes(p.disk_bytes)}\n`);
    if (!plan.prune.length) w("      (none)\n");
  }
  w(`\nNothing was deleted. To execute this plan: alloy-toolkit prune --yes\n\n`);
  process.exit(0);
}

// ── explicit execution ───────────────────────────────────────────────────────
const result = await executePrune({
  presentedPlan: plan,
  confirmed: true,
  recompute: async () => gather(),
  remove: async (target) => {
    // Refuse anything that is not a version directory directly under the root.
    const dir = String(target.path || "");
    const expected = join(ROOT, String(target.version));
    if (resolve(dir) !== resolve(expected)) return { ok: false, error: "path_outside_toolkit_root" };
    if (basename(dir) === "current") return { ok: false, error: "refusing_to_remove_current" };
    let bytes = Number(target.disk_bytes) || 0;
    try {
      rmSync(dir, { recursive: true, force: false });
    } catch (err) {
      return { ok: false, error: err?.code || err?.message || "remove_failed" };
    }
    if (existsSync(dir)) return { ok: false, error: "directory_still_present_after_removal" };
    return { ok: true, bytes };
  },
});

if (asJson) {
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.exit(result.ok ? 0 : 1);
}
const w = (s) => process.stdout.write(s);
if (!result.ok && result.error) {
  w(`\nPrune refused: ${result.error}\n  ${result.detail || ""}\n`);
  for (const d of result.differences || []) w(`  ${d.version || ""} ${d.change}\n`);
  process.exit(1);
}
w(`\nPruned ${result.removed.length} version(s), reclaimed ${formatBytes(result.bytes_reclaimed)}\n`);
for (const v of result.removed) w(`  removed ${v}\n`);
for (const f of result.failed || []) w(`  FAILED  ${f.version} — ${f.error}\n`);
const v = result.verification;
w(`\nVerification\n`);
w(`  current ${v.current} present: ${v.current_present ? "yes" : "NO"}\n`);
w(`  live pins intact: ${v.live_pins_intact ? "yes" : "NO"}\n`);
w(`  rollback targets remaining: ${v.rollback_targets} (expected at least ${v.rollback_expected_at_least})\n`);
for (const p of v.problems) w(`  PROBLEM ${p}\n`);
process.exit(result.ok ? 0 : 1);
