/**
 * Vacilando — heavy validation guard.
 *
 * Host-wide typecheck/build/full-test must go through `vac` / `vac-run` /
 * `alloy-validate` (lease + queue + reuse). Workers that run raw `npx tsc` /
 * `typescript/bin/tsc` / `next build` bypass the broker, spike load, and burn
 * tokens waiting on contended hosts (Access & Roles Phase 1, 2026-07-29).
 *
 * Layers:
 *   1. Claude implement `--allowedTools` (providers.mjs) — cannot invoke raw tsc.
 *   2. Policy text — workers must use vac / npm run (brokered scripts).
 *   3. Conductor watchdog — kill unbrokered heavy PIDs that slip through
 *      (e.g. old package.json still calling tsc directly under `npm run typecheck`).
 */
import { execFileSync } from "node:child_process";
import os from "node:os";
import { join } from "node:path";

/** True when a shell/command string is an unbrokered heavy validation bypass. */
export function isUnbrokeredHeavyCommand(cmd) {
  const s = String(cmd || "");
  if (!s.trim()) return false;
  // Brokered paths are always allowed.
  if (/\b(vac-run|alloy-validate)\b/.test(s)) return false;
  if (/\bvac\s+run\b/.test(s)) return false;
  if (/\bALLOY_VALIDATE_EXECUTING=1\b/.test(s)) return false;

  // Raw TypeScript compiler (the Phase 1 failure mode).
  if (/typescript\/bin\/tsc\b/.test(s)) return true;
  if (/\bnpx\s+tsc\b/.test(s)) return true;
  if (/\bnpm\s+exec\s+tsc\b/.test(s)) return true;
  if (/\btsc\s+--noEmit\b/.test(s)) return true;
  if (/\/tsc\s+--noEmit\b/.test(s)) return true;

  // Raw Next production build (package scripts must go through vac-run).
  if (/\bnpx\s+next\s+build\b/.test(s)) return true;
  if (/\bnext\s+build\b/.test(s) && !/\bvac\b/.test(s)) return true;

  return false;
}

/**
 * Claude implement-phase Bash allowlist. Deliberately omits:
 *   Bash(npx *)   — enables `npx tsc`
 *   Bash(npm *)   — enables `npm exec tsc`
 *   Bash(node *)  — enables `node …/typescript/bin/tsc`
 * Heavy validation: `vac run …` / `npm run typecheck|build|test` (brokered when
 * package.json is current) / focused `npx vitest|playwright`.
 */
export const CLAUDE_IMPLEMENT_ALLOWED_TOOLS = [
  "Bash(vac *)",
  "Bash(vac-run *)",
  "Bash(alloy-*)",
  "Bash(npm run *)",
  "Bash(npx vitest *)",
  "Bash(npx playwright *)",
  "Bash(git *)",
  "Bash(curl *)",
  "Bash(ls *)",
  "Bash(pwd)",
  "Bash(cat *)",
  "Bash(mkdir *)",
  "Bash(cp *)",
  "Bash(mv *)",
  "Bash(chmod *)",
  "Edit",
  "Write",
  "Read",
  "Glob",
  "Grep",
];

/** PATH prefix so `vac` / `alloy-*` resolve for Vacilando-spawned workers. */
export function brokerPathPrefix() {
  const home = os.homedir();
  return `${join(home, "bin", "alloy-dev")}:${join(home, ".local", "bin")}`;
}

/**
 * Scan running processes for unbrokered heavy validators.
 * Returns [{ pid, pgid, command }] candidates (does not kill).
 */
export function findUnbrokeredHeavyProcesses() {
  let out = "";
  try {
    // -ww: full argv. macOS ps supports -ax -o.
    out = execFileSync("ps", ["-ax", "-o", "pid=,pgid=,command="], {
      encoding: "utf8",
      timeout: 8000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    return [];
  }
  const hits = [];
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const pgid = Number(m[2]);
    const command = m[3];
    if (!isUnbrokeredHeavyCommand(command)) continue;
    // Skip if this process (or its env) shows broker execution.
    if (processHasBrokerEnv(pid)) continue;
    hits.push({ pid, pgid, command: command.slice(0, 240) });
  }
  return hits;
}

function processHasBrokerEnv(pid) {
  try {
    const env = execFileSync("ps", ["eww", "-p", String(pid)], {
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 2 * 1024 * 1024,
    });
    return /ALLOY_VALIDATE_EXECUTING=1/.test(env);
  } catch {
    return false;
  }
}

/**
 * Kill unbrokered heavy validators. Returns { killed: [{pid,command}], errors }.
 * Prefer killing the process group when it looks like a shell→npm→tsc tree.
 */
export function terminateUnbrokeredHeavyProcesses({ signal = "SIGTERM" } = {}) {
  const hits = findUnbrokeredHeavyProcesses();
  const killed = [];
  const errors = [];
  const seen = new Set();
  for (const h of hits) {
    const target = h.pgid > 1 ? -h.pgid : h.pid;
    const key = String(target);
    if (seen.has(key)) continue;
    seen.add(key);
    try {
      process.kill(target, signal);
      killed.push(h);
    } catch (e) {
      // Fallback: direct PID
      try {
        process.kill(h.pid, signal);
        killed.push(h);
      } catch (e2) {
        errors.push({ pid: h.pid, error: String(e2?.message || e?.message || e2) });
      }
    }
  }
  return { killed, errors, scanned: hits.length };
}
