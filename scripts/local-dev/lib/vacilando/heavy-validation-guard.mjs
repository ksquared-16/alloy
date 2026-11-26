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
import { createRequire } from "node:module";
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
export function findUnbrokeredHeavyProcesses(deps = {}) {
  let out = "";
  if (typeof deps.psOut === "string") {
    // Injected for deterministic tests. A guard that can only be exercised
    // against whatever happens to be running is a guard nobody can prove.
    out = deps.psOut;
  } else {
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
  }
  // Ownership is resolved ONCE per scan, from the broker's own record of what it
  // admitted, rather than per-process by guessing at an environment.
  const { pgids, owned } = brokerOwnedPids(deps);
  const hits = [];
  for (const line of out.split("\n")) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const pgid = Number(m[2]);
    const command = m[3];
    if (!isUnbrokeredHeavyCommand(command)) continue;
    // AUTHORITATIVE: a descendant of a live broker claim is broker-owned, even
    // when nothing about the process itself advertises it.
    if (owned.has(pid)) continue;
    if (pgids.has(pgid)) continue;
    // Secondary, and no longer load-bearing: honoured when the environment does
    // happen to be readable.
    if (processHasBrokerEnv(pid)) continue;
    hits.push({ pid, pgid, command: command.slice(0, 240) });
  }
  return hits;
}

/**
 * THE BROKER ALREADY KNOWS WHAT IT ADMITTED. ASK IT.
 *
 * THE DEFECT. Ownership was inferred by reading a descendant's environment for
 * ALLOY_VALIDATE_EXECUTING=1 via `ps eww`. That environment is not reliably
 * observable — for `npm exec next build` and the node processes it spawns, ps
 * returns nothing usable — so the lookup returned false, the guard classified
 * broker-owned work as unbrokered, and SIGTERMed it. Measured live: a brokered
 * `vac run build` died rc=143 class=cancelled about six seconds after START,
 * with pid 64288 `npm exec next build` reported as an unbrokered hit, while the
 * host was idle (0/9 brokered budget, ~9.9 GB free against a 4.8 GB reserve).
 * Not capacity — the guard killed its own broker's job.
 *
 * Environment inspection is a guess about a process. A claim is a RECORD of a
 * decision: the broker admitted the job and wrote down the pid holding the
 * claim. Descendants of that pid are broker-owned by construction, whether or
 * not any of them happens to expose an environment variable.
 *
 * PID REUSE. Only LIVE claims are consulted. readClaimStore reaps claims whose
 * holder has exited, so a finished job cannot leave behind an exemption that a
 * later, unrelated process inherits by landing on the same pid.
 */
function brokerOwnedPids({ readClaims = defaultReadClaims, procTable = null } = {}) {
  const roots = new Set();
  const pgids = new Set();
  for (const c of readClaims()) {
    const pid = Number(c?.pid);
    if (Number.isInteger(pid) && pid > 0) roots.add(pid);
    const rp = Number(c?.root_provider_pid);
    if (Number.isInteger(rp) && rp > 0) roots.add(rp);
  }
  if (!roots.size) return { roots, pgids, owned: new Set() };

  // Walk the live process table once: a pid is owned when any ancestor is a
  // claim root. Depth is bounded because the table is finite and each step moves
  // strictly toward pid 1.
  const parent = new Map();
  const pgidOf = new Map();
  for (const row of procTable || readProcTable()) {
    parent.set(row.pid, row.ppid);
    pgidOf.set(row.pid, row.pgid);
  }
  for (const r of roots) if (pgidOf.has(r)) pgids.add(pgidOf.get(r));

  const owned = new Set(roots);
  for (const pid of parent.keys()) {
    let cur = pid;
    for (let hop = 0; hop < 64; hop += 1) {
      if (owned.has(cur)) { owned.add(pid); break; }
      const next = parent.get(cur);
      if (next == null || next === cur || next <= 1) break;
      cur = next;
    }
  }
  return { roots, pgids, owned };
}

/** pid/ppid/pgid for every live process. Separate so tests can inject one. */
export function readProcTable() {
  try {
    const out = execFileSync("ps", ["-ax", "-o", "pid=,ppid=,pgid="], {
      encoding: "utf8", timeout: 8000, maxBuffer: 8 * 1024 * 1024,
    });
    const rows = [];
    for (const line of out.split("\n")) {
      const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)$/);
      if (m) rows.push({ pid: Number(m[1]), ppid: Number(m[2]), pgid: Number(m[3]) });
    }
    return rows;
  } catch {
    return [];
  }
}

const requireFromHere = createRequire(import.meta.url);

function defaultReadClaims() {
  try {
    // Loaded lazily: hooks that only classify a command string must not pay for
    // the claim store, and a broken store must never make the guard throw.
    const { readClaimStore } = requireFromHere("./validation-admission.mjs");
    return readClaimStore()?.claims || [];
  } catch {
    return [];
  }
}

/**
 * Secondary signal, kept because it is free when it works and costs nothing when
 * it does not. It may no longer be the ONLY thing standing between a brokered
 * build and a SIGTERM.
 */
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
