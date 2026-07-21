#!/usr/bin/env node
/**
 * Vacilando Runtime — Authoritative Source adapters.
 *
 * This is the ONLY module that reads the outside world. Everything above it
 * (the six runtime projections + compose) is a pure function of what this
 * module returns. That keeps the discipline the mission demands:
 *
 *     Runtime  →  Projection  →  Presentation
 *
 * ...never Runtime → Database → Sync → Presentation. There is NO parallel
 * store here — every read resolves to one of three authoritative surfaces:
 *
 *   1. `alloy-ro` — the toolkit's own read-only, fail-closed inspection CLI.
 *      Preferred for anything it exposes (slots, agents, servers, paths).
 *      We CONSUME the toolkit; we never re-implement its reads.
 *   2. Read-only git — commit/branch facts per worktree (log/rev-list only).
 *   3. Recovery-tolerant file reads of authoritative state the toolkit writes
 *      but `alloy-ro` does not yet expose (initiative state.json, manifests,
 *      metadata .env, evidence dir). Files are parsed, never executed.
 *
 * Security posture (inherited): read-only. No writes, no process control, no
 * network, no secret access. `alloy-ro` is invoked by absolute path so PATH
 * drift cannot substitute a different binary. All reads fail SOFT — a missing
 * or corrupt source yields a typed "gap", never a thrown projection.
 */
import { execFile } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// lib/vacilando/sources.mjs → toolkit root is two levels up.
export const TOOLKIT_DIR = resolve(HERE, "..", "..");
const ALLOY_RO = join(TOOLKIT_DIR, "alloy-ro");

const EXEC_TIMEOUT_MS = 15000;
const MAX_BUFFER = 8 * 1024 * 1024;

function run(cmd, args, opts = {}) {
  return new Promise((res) => {
    execFile(
      cmd,
      args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER, cwd: opts.cwd, env: process.env },
      (err, stdout, stderr) => {
        res({ ok: !err, code: err?.code ?? 0, stdout: stdout ?? "", stderr: stderr ?? "", error: err ? String(err.message || err) : null });
      },
    );
  });
}

/** Invoke an `alloy-ro` verb with --json. Returns { ok, data, error }. */
export async function ro(verb, extraArgs = []) {
  if (!existsSync(ALLOY_RO)) {
    return { ok: false, data: null, error: `alloy-ro not found at ${ALLOY_RO}` };
  }
  const r = await run(ALLOY_RO, [verb, ...extraArgs, "--json"]);
  if (!r.ok) return { ok: false, data: null, error: r.error || r.stderr || `alloy-ro ${verb} failed` };
  try {
    return { ok: true, data: JSON.parse(r.stdout), error: null };
  } catch {
    return { ok: false, data: null, error: `alloy-ro ${verb} returned non-JSON` };
  }
}

/** Recovery-tolerant JSON file read. Never throws. */
export function readJson(path) {
  if (!path || !existsSync(path)) return { ok: false, data: null, error: "missing" };
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch (e) {
    return { ok: false, data: null, error: `unreadable:${e.code || "err"}` };
  }
  try {
    return { ok: true, data: JSON.parse(text), error: null };
  } catch {
    return { ok: false, data: null, error: "corrupt_json" };
  }
}

/** Directory listing that never throws. */
export function listDir(path) {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

/** mtime (ms) or null. */
export function mtime(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// High-level authoritative reads. Each returns a typed, soft-failing result.
// ---------------------------------------------------------------------------

/** Resolved runtime paths (metadata_dir, initiatives_dir, evidence_dir, ...). */
export async function runtimePaths() {
  const r = await ro("runtime-paths");
  return r.ok ? r.data : {};
}

/** The six-slot board: slot, sprint, provider, git, ahead_behind, server, port. */
export async function slots() {
  const r = await ro("worker-status");
  return { ok: r.ok, slots: r.ok ? r.data.slots || [] : [], base: r.data?.base, base_sha: r.data?.base_sha, error: r.error };
}

/** Richer per-worker view: path, branch, branch_expected, lifecycle, agent_status. */
export async function agents() {
  const r = await ro("agent-status");
  return { ok: r.ok, agents: r.ok ? r.data.agents || [] : [], error: r.error };
}

/** Dev-server ownership: port, server, server_pid. */
export async function servers() {
  const r = await ro("dev-status");
  return { ok: r.ok, servers: r.ok ? r.data.servers || [] : [], error: r.error };
}

/** Root/repo classification for a cwd (canonical detection). */
export async function root(cwd) {
  const r = await ro("root");
  return r.ok ? r.data : {};
}

/**
 * Per-worktree metadata .env (authoritative worker record). alloy-ro does not
 * expose the full record (timestamps, session id, role), so we parse the KV
 * file directly — parsed, never sourced. Only a fixed key allowlist is read.
 */
const META_KEYS = new Set([
  "ALLOY_WORKTREE_NAME", "ALLOY_WORKTREE_SLOT", "ALLOY_WORKTREE_PATH", "ALLOY_WORKTREE_BRANCH",
  "ALLOY_AGENT", "PORT", "ALLOY_CREATED_AT", "ALLOY_AGENT_ROLE", "ALLOY_AGENT_STATUS",
  "ALLOY_AGENT_OPENED_AT", "ALLOY_AGENT_CLOSED_AT", "ALLOY_SPRINT_NAME", "ALLOY_SPRINT_OBJECTIVE",
  "ALLOY_WORKER_LIFECYCLE", "ALLOY_PROVIDER_SESSION_ID", "ALLOY_PAUSE_RECORDED_AT", "ALLOY_FINISHED_AT",
]);
export function readMetadataEnv(path) {
  if (!path || !existsSync(path)) return {};
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const out = {};
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    if (!META_KEYS.has(key)) continue;
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    // Fail closed against any shell-active value — the read core's rule.
    if (/[$`]|\$\(/.test(val)) continue;
    out[key] = val;
  }
  return out;
}

/** Sprint manifest (stage, role, posture, initiative_key, promotion target). */
export function readManifest(manifestsDir, worktreeName) {
  return readJson(join(manifestsDir, `${worktreeName}.json`)).data;
}

/** Initiative record: state.json (lifecycle, title, human_decisions[], hashes). */
export function readInitiative(initiativesDir, key) {
  return readJson(join(initiativesDir, key, "state.json")).data;
}

/** All initiative records (state.json) in the initiatives dir. Soft-failing. */
export function readAllInitiatives(initiativesDir) {
  const out = [];
  for (const key of listDir(initiativesDir)) {
    const rec = readInitiative(initiativesDir, key);
    if (rec) {
      if (!rec.key) rec.key = key;
      out.push(rec);
    }
  }
  return out;
}

/** Count product decision files for an initiative (yaml, counted not parsed). */
export function countProductDecisions(initiativesDir, key) {
  const dir = join(initiativesDir, key, "product", "decisions");
  return listDir(dir).filter((f) => f.endsWith(".yaml")).length;
}

/** Evidence artifacts for a worktree (names + newest mtime). */
export function evidenceFor(evidenceDir, worktreeName) {
  const dir = join(evidenceDir, worktreeName);
  const files = listDir(dir);
  let newest = null;
  for (const f of files) {
    const m = mtime(join(dir, f));
    if (m && (newest === null || m > newest)) newest = m;
  }
  return { count: files.length, files, newest_ms: newest };
}

/**
 * Read-only git facts for a worktree. Returns recent commits and a last-commit
 * timestamp. Only `git log` (read-only) is used — no index/ref/worktree writes.
 */
export async function gitRecent(worktreePath, limit = 6) {
  if (!worktreePath || !existsSync(worktreePath)) return { ok: false, commits: [], last_ms: null };
  const fmt = "%H%x1f%h%x1f%an%x1f%cI%x1f%s%x1e";
  const r = await run("git", ["log", `-${limit}`, `--pretty=format:${fmt}`], { cwd: worktreePath });
  if (!r.ok) return { ok: false, commits: [], last_ms: null };
  const commits = r.stdout
    .split("\x1e")
    .map((rec) => rec.trim())
    .filter(Boolean)
    .map((rec) => {
      const [sha, short, author, iso, subject] = rec.split("\x1f");
      return { sha, short, author, at: iso, at_ms: iso ? Date.parse(iso) : null, subject };
    });
  return { ok: true, commits, last_ms: commits[0]?.at_ms ?? null };
}

/** Convenience: gather the raw authoritative reads the projections need, once. */
export async function collectRaw() {
  const [paths, slotsR, agentsR, serversR, rootR] = await Promise.all([
    runtimePaths(), slots(), agents(), servers(), root(),
  ]);
  return { paths, slots: slotsR, agents: agentsR, servers: serversR, root: rootR };
}
