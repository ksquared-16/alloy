#!/usr/bin/env node
/**
 * `vac config-audit` — what instructions does an agent in this checkout receive,
 * and where do they disagree with the code that owns the same fact?
 *
 * READ-ONLY. It opens files and runs `claude --help` to read capabilities; it
 * writes nothing, edits no instruction and changes no setting. The audit module
 * it calls opens no file at all — everything is passed in — so the boundary
 * between "measure" and "act" is structural rather than promised.
 *
 * Usage:
 *   vac-config-audit.mjs [--json] [--lanes]
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  INSTRUCTION_CLASS, INSTRUCTION_LAYERS, SUPPORTED_EFFORT, SUBAGENT_POLICY,
  auditAgentConfiguration, behaviourBaseline, canaryInputs, detectInstructionDrift,
  enforcementStatus, instructionBaselineVersion, instructionFinding, resolvePrecedence,
} from "./lib/vacilando/agent-configuration.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..");
const asJson = process.argv.includes("--json");
const INVOKED_DIRECTLY = process.argv[1] && process.argv[1].endsWith("vac-config-audit.mjs");

const read = (p) => { try { return existsSync(p) ? readFileSync(p, "utf8") : null; } catch { return null; } };
const sha = (s) => (s == null ? null : createHash("sha256").update(s).digest("hex").slice(0, 12));

/* ── capabilities, verified rather than assumed ──────────────────────────── */
function claudeCapabilities() {
  let version = null; let help = "";
  try { version = execFileSync("claude", ["--version"], { encoding: "utf8", timeout: 15_000 }).trim(); } catch { /* not installed */ }
  try { help = execFileSync("claude", ["--help"], { encoding: "utf8", timeout: 15_000 }); } catch { /* no help */ }
  const effortLine = /--effort <level>[\s\S]{0,120}?\(([^)]+)\)/.exec(help);
  return {
    version,
    supports_effort: /--effort/.test(help),
    effort_levels: effortLine ? effortLine[1].split(",").map((s) => s.trim()) : [],
    supports_model: /--model <model>/.test(help),
    supports_agents_json: /--agents <json>/.test(help),
    // Checked because the mission was told not to assume it exists.
    has_prompt_audit: /prompt-audit/.test(help),
    has_cost_command: /\bcost\b/.test(help),
  };
}

/**
 * THE ONE MEASUREMENT, shared by the CLI and the health probe.
 *
 * Exported rather than inlined because the alternative is a health check that
 * re-reads the same files with slightly different arithmetic and eventually
 * disagrees with `vac config-audit` — the preview-versus-execution divergence
 * DevOps 3 already paid for once. One collector, two consumers.
 */
export function collectConfigurationAudit() {
/* ── the instruction sources ─────────────────────────────────────────────── */
  const claudeMd = read(join(REPO, "CLAUDE.md"));
  const baselineVersion = instructionBaselineVersion(claudeMd);
  const settingsPath = join(REPO, ".claude", "settings.json");
  const settings = (() => { try { return JSON.parse(read(settingsPath) || "{}"); } catch { return {}; } })();
  const hookCommands = JSON.stringify(settings.hooks || {});

  const caps = claudeCapabilities();

/* ── measured facts, compared against what the prompt claims ─────────────── */
  function canonicalRootFromTool() {
  const bin = join(homedir(), ".local", "share", "alloy", "toolkit", "current", "alloy-root");
  try {
    const out = execFileSync(bin, [], { cwd: REPO, encoding: "utf8", timeout: 20_000 });
    return /Canonical:\s*(\S+)/.exec(out)?.[1] || null;
  } catch { return null; }
}

  function registryPorts() {
  const dir = join(homedir(), ".local", "state", "alloy-dev", "gateway", "metadata");
  const ports = [];
  try {
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".env")) continue;
      const m = /^PORT="?(\d+)"?/m.exec(read(join(dir, f)) || "");
      if (m) ports.push(Number(m[1]));
    }
  } catch { /* no registry readable */ }
  return ports.sort((a, b) => a - b);
}

  const findings = [];

// 1. The canonical root: prose versus the tool that owns the answer.
  const toolRoot = canonicalRootFromTool();
  const promptRoot = /only sanctioned engineering root is `([^`]+)`/.exec(claudeMd || "")?.[1] || null;
  if (toolRoot && promptRoot && toolRoot !== promptRoot) {
  findings.push(instructionFinding({
    id: "canonical_root_conflict", source: "CLAUDE.md", quote: promptRoot,
    klass: INSTRUCTION_CLASS.CONFLICTING, keep: false, severity: "problem",
    why: `CLAUDE.md names ${promptRoot} as the only sanctioned root; alloy-root, which owns that answer, reports ${toolRoot}`,
    enforced_by: "alloy-root", replaced_by: "cite alloy-root rather than restating its output",
  }));
}

// 2. The port range: prose versus the slot registry.
  const ports = registryPorts();
  const promptPorts = /Permanent ports are \*\*(\d+)[–-](\d+)\*\*/.exec(claudeMd || "");
  if (ports.length && promptPorts) {
  const hi = Number(promptPorts[2]);
  const beyond = ports.filter((p) => p > hi);
  if (beyond.length) {
    findings.push(instructionFinding({
      id: "port_range_stale", source: "CLAUDE.md", quote: `${promptPorts[1]}-${promptPorts[2]}`,
      klass: INSTRUCTION_CLASS.CONFLICTING, keep: false, severity: "problem",
      why: `CLAUDE.md permits ${promptPorts[1]}-${hi} and forbids inventing ports, but the slot registry allocates ${ports[0]}-${ports[ports.length - 1]} (${beyond.length} beyond the stated ceiling)`,
      enforced_by: "managed-slots registry", replaced_by: "cite the registry range rather than a literal",
    }));
  }
}

/*
 * 3. The same stale range repeated in a second, non-injected layer.
 *
 * MEASURED AGAINST THE REGISTRY, NOT AGAINST CLAUDE.md. The first cut keyed this
 * off the range CLAUDE.md stated, so the moment CLAUDE.md was corrected the
 * toolkit's stale copy became invisible — a detector that stopped working
 * precisely because the thing it depended on got better. Each layer is now
 * checked against the owner independently, which is the only way a duplicate can
 * outlive the copy it was duplicating.
 */
  const toolkitDoc = read(join(homedir(), ".local", "share", "alloy", "toolkit", "current", "AGENT-INSTRUCTIONS.md"));
  if (toolkitDoc && ports.length) {
  const hi = ports[ports.length - 1];
  const stated = /(\d{4})\s*[–-]\s*(\d{4})/.exec(toolkitDoc);
  if (stated && Number(stated[2]) < hi) {
    findings.push(instructionFinding({
      id: "port_range_duplicated", source: "toolkit AGENT-INSTRUCTIONS.md", quote: `${stated[1]}-${stated[2]}`,
      klass: INSTRUCTION_CLASS.REDUNDANT, keep: false, severity: "watch",
      why: `the toolkit docs restate a port ceiling of ${stated[2]} while the slot registry allocates up to ${hi}; it is a second copy of a fact the registry owns`,
      enforced_by: "managed-slots registry",
    }));
  }
}

// 4. A prompt rule whose named guard is not wired anywhere.
  const guard = join(REPO, "scripts", "local-dev", "hooks", "guard-push.sh");
  const pushEnforcement = enforcementStatus({
  guardFile: existsSync(guard) ? "scripts/local-dev/hooks/guard-push.sh" : null,
  wiredIn: [
    ...(hookCommands.includes("guard-push") ? [".claude/settings.json PreToolUse"] : []),
  ],
});
  if (pushEnforcement.finding === "unwired_guard") {
  findings.push(instructionFinding({
    id: "push_guard_unwired", source: "scripts/local-dev/hooks/guard-push.sh",
    klass: INSTRUCTION_CLASS.DURABLE_POLICY, keep: true, severity: "problem",
    why: "guard-push.sh is tested but registered in no hook config and installed as no git hook; CLAUDE.md's push prohibition is the only thing enforcing it",
    enforced_by: null, replaced_by: "keep the prompt rule; wiring the guard is a separate owner's change",
  }));
}

// 5. A rule that IS properly code-enforced — recorded so the pattern is visible.
  const supaGuard = enforcementStatus({
  guardFile: "scripts/local-dev/hooks/guard-supabase-start.sh",
  wiredIn: hookCommands.includes("guard-supabase-start") ? [".claude/settings.json PreToolUse"] : [],
});

// 6. Settings that do not exist on this build.
  const unsupported = [];
  if (!caps.supports_effort) unsupported.push("--effort");
  if (!caps.supports_model) unsupported.push("--model");

  const drift = detectInstructionDrift({ lanes: [], currentVersion: baselineVersion });
  const audit = auditAgentConfiguration({
  baselineVersion,
  instructionFindings: findings,
  drift,
  effortConfigured: Boolean(JSON.parse(read(join(homedir(), ".claude", "settings.json")) || "{}").effort),
  unsupportedSettings: unsupported,
  claudeVersion: caps.version,
});
  const baseline = behaviourBaseline({ instructionBytes: claudeMd ? claudeMd.length : null, runs: [], claudeVersion: caps.version });


  return { capabilities: caps, audit, baseline, claudeMd, supaGuard, pushEnforcement };
}

if (!INVOKED_DIRECTLY) {
  // Imported by the health probe: expose the collector and run nothing.
} else {
  const { capabilities: caps, audit, baseline, claudeMd, supaGuard, pushEnforcement } = collectConfigurationAudit();

  if (asJson) {
    process.stdout.write(`${JSON.stringify({ capabilities: caps, audit, baseline, canary: canaryInputs({ audit, baseline }) }, null, 2)}\n`);
    process.exit(audit.counts.problems ? 2 : 0);
  }

  process.stdout.write(`agent configuration audit — ${audit.baseline_version}  (CLAUDE.md ${sha(claudeMd)}, ${claudeMd?.length ?? 0} bytes)\n`);
  process.stdout.write(`claude ${caps.version || "not found"}   effort ${caps.supports_effort ? caps.effort_levels.join("|") : "unsupported"}   prompt-audit ${caps.has_prompt_audit ? "yes" : "no"}   cost cmd ${caps.has_cost_command ? "yes" : "no"}\n\n`);

  process.stdout.write("instruction layers, in precedence order\n");
  for (const l of INSTRUCTION_LAYERS.filter((x) => x.precedence != null).sort((a, b) => a.precedence - b.precedence)) {
    process.stdout.write(`  ${l.precedence}  ${l.id.padEnd(28)} ${l.injected ? "injected" : "on demand"}  ${l.owner}\n`);
  }
  for (const l of INSTRUCTION_LAYERS.filter((x) => x.precedence == null)) {
    process.stdout.write(`  -  ${l.id.padEnd(28)} not injected  ${l.owner}\n`);
  }

  process.stdout.write(`\nenforcement\n`);
  process.stdout.write(`  supabase-start  ${supaGuard.enforced ? "ENFORCED" : "PROMPT ONLY"}  ${supaGuard.reason}\n`);
  process.stdout.write(`  push            ${pushEnforcement.enforced ? "ENFORCED" : "PROMPT ONLY"}  ${pushEnforcement.reason}\n`);

  process.stdout.write(`\nfindings  ${audit.counts.total} (${audit.counts.problems} problem)\n`);
  for (const f of audit.findings) process.stdout.write(`  ${f.severity.toUpperCase().padEnd(8)} ${f.kind.padEnd(24)} ${f.detail}\n`);
  process.stdout.write(`\nseverity ${audit.severity}   gates maintenance: ${audit.gates_maintenance}\n`);
  process.exit(audit.counts.problems ? 2 : 0);

}
