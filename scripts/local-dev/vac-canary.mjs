#!/usr/bin/env node
/**
 * `vac canary` — what is installed, how each part gets back, and what class its
 * update falls into.
 *
 * READ-ONLY. It probes versions and prints classification. It installs nothing,
 * activates nothing, restarts nothing and rolls nothing back: those belong to
 * the owners each row names. `--snapshot` prints the known-good record that an
 * activation would have to take first.
 *
 * Usage:
 *   vac-canary.mjs [--json]        the toolchain, with update class and rollback
 *   vac-canary.mjs --snapshot      the known-good identities, secrets excluded
 *   vac-canary.mjs --pack          the evaluation pack
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readlinkSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  TOOLCHAIN, EVAL_PACK, CANARY_METRICS, classifyComponentUpdate,
  knownGoodSnapshot, snapshotIsClean,
} from "./lib/vacilando/toolchain-canary.mjs";

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const TOOLKIT_ROOT = join(homedir(), ".local", "share", "alloy", "toolkit");

/** Probe a version without ever failing the run: unknown stays unknown. */
function probe(cmd, args) {
  try {
    return execFileSync(cmd, args, { encoding: "utf8", timeout: 15_000, stdio: ["ignore", "pipe", "ignore"] })
      .trim().split("\n")[0] || null;
  } catch { return null; }
}

function installedToolkit() {
  try { return readlinkSync(join(TOOLKIT_ROOT, "current")).split("/").pop(); } catch { return null; }
}

const VERSIONS = {
  vacilando_toolkit: installedToolkit(),
  claude_code: probe("claude", ["--version"]),
  claude_model: null,          // no model is configured on this host (DevOps 8)
  effort_policy: null,         // no effort is configured on this host (DevOps 8)
  subagent_routing: existsSync(join(homedir(), ".claude", "agents")) ? "configured" : null,
  node: probe("node", ["--version"]),
  npm: probe("npm", ["--version"]),
  git: probe("git", ["--version"]),
  supabase_cli: probe("supabase", ["--version"]),
  stripe_cli: probe("/opt/homebrew/bin/stripe", ["version"]),
  tailscale: probe("tailscale", ["version"]),
  macos: probe("sw_vers", ["-productVersion"]),
  instruction_baseline: null,
};

try {
  const { instructionBaselineVersion } = await import("./lib/vacilando/agent-configuration.mjs");
  const repo = join(process.cwd());
  const md = existsSync(join(repo, "CLAUDE.md")) ? readFileSync(join(repo, "CLAUDE.md"), "utf8") : null;
  VERSIONS.instruction_baseline = instructionBaselineVersion(md);
} catch { /* unknown stays unknown */ }

if (argv.includes("--pack")) {
  if (asJson) { process.stdout.write(`${JSON.stringify({ pack: EVAL_PACK, metrics: CANARY_METRICS }, null, 2)}\n`); process.exit(0); }
  process.stdout.write("canary evaluation pack\n\n");
  for (const e of EVAL_PACK) process.stdout.write(`  ${e.id.padEnd(14)} ${e.category}\n                 ${e.proves}\n`);
  process.stdout.write("\nmetrics\n");
  for (const m of CANARY_METRICS) {
    const mark = m.available === false ? "UNAVAILABLE" : m.required ? "required" : "optional";
    process.stdout.write(`  ${m.id.padEnd(24)} ${mark.padEnd(12)} better=${m.better}${m.why ? `  — ${m.why}` : ""}\n`);
  }
  process.exit(0);
}

if (argv.includes("--snapshot")) {
  const snap = knownGoodSnapshot({
    toolkit: VERSIONS.vacilando_toolkit, claudeCode: VERSIONS.claude_code,
    model: VERSIONS.claude_model, effort: VERSIONS.effort_policy,
    subagents: VERSIONS.subagent_routing, node: VERSIONS.node,
    tools: { npm: VERSIONS.npm, git: VERSIONS.git, supabase: VERSIONS.supabase_cli, stripe: VERSIONS.stripe_cli, tailscale: VERSIONS.tailscale, macos: VERSIONS.macos },
    instructionBaseline: VERSIONS.instruction_baseline,
    secretRefs: ["gateway_api_token"],
  });
  const clean = snapshotIsClean(snap);
  if (asJson) { process.stdout.write(`${JSON.stringify({ snapshot: snap, clean }, null, 2)}\n`); process.exit(clean.clean ? 0 : 2); }
  process.stdout.write(`known-good snapshot  (secrets: ${clean.clean ? "none present" : `LEAK: ${clean.offenders.join(", ")}`})\n\n`);
  for (const [k, v] of Object.entries(snap)) {
    if (["schema", "kind", "tools"].includes(k)) continue;
    process.stdout.write(`  ${k.padEnd(22)} ${v === null ? "(not configured)" : JSON.stringify(v)}\n`);
  }
  for (const [k, v] of Object.entries(snap.tools)) process.stdout.write(`  tools.${k.padEnd(16)} ${v ?? "(absent)"}\n`);
  process.exit(clean.clean ? 0 : 2);
}

const rows = TOOLCHAIN.map((c) => ({
  id: c.id, version: VERSIONS[c.id] ?? null,
  ...classifyComponentUpdate(c.id), rollback_detail: c.rollback_detail,
  restart_required: c.restart_required, scope: c.scope, risk: c.risk,
}));

if (asJson) { process.stdout.write(`${JSON.stringify({ toolchain: rows }, null, 2)}\n`); process.exit(0); }
process.stdout.write("component            version                class             rollback\n");
for (const r of rows) {
  process.stdout.write(`${r.id.padEnd(21)}${String(r.version ?? "-").slice(0, 22).padEnd(23)}${r.class.padEnd(18)}${r.rollback}\n`);
}
const byClass = {};
for (const r of rows) byClass[r.class] = (byClass[r.class] || 0) + 1;
process.stdout.write(`\n${Object.entries(byClass).map(([k, v]) => `${k} ${v}`).join("   ")}\n`);
process.stdout.write("This command installs, activates and rolls back nothing.\n");
