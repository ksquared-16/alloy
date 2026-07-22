#!/usr/bin/env node
/**
 * Vacilando Runtime — Authoritative Source adapters.
 *
 * This is the ONLY module that reads the outside world. Everything above it
 * (the six runtime projections + compose) is a pure function of what this
 * module returns. Runtime → Projection → Presentation; never a parallel store.
 *
 * The read boundary is now, wherever technically possible, the single governed
 * `alloy-ro` surface (fail-closed, read-only, redaction-safe):
 *
 *   slots/agents/servers/paths → alloy-ro worker-status/agent-status/dev-status/runtime-paths
 *   worker metadata detail      → alloy-ro worker-detail   (role, session, timestamps, objective)
 *   sprint stage + initiative   → alloy-ro sprint-manifest
 *   initiatives + decisions     → alloy-ro initiatives / initiative   (the DECISIONS boundary)
 *   evidence artifacts          → alloy-ro agent-evidence
 *
 * The ONE remaining direct read is read-only `git log` (commit facts) — the
 * canonical VCS source, identical in trust to alloy-ro's own git usage, and not
 * a "state file". It is documented as such; a future `worker-activity` verb
 * could promote it, but it is not required by the current projection.
 *
 * `alloy-ro` is invoked by ABSOLUTE path so PATH drift cannot substitute a
 * different binary. Every read fails SOFT — a missing/failed verb yields a typed
 * gap, never a thrown projection.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOLKIT_DIR = resolve(HERE, "..", "..");
const ALLOY_RO = join(TOOLKIT_DIR, "alloy-ro");

// Host can thrash under memory pressure (swap full) — alloy-ro then takes ~16s.
// Tolerate a slow-but-working read instead of killing it at 15s and blanking the board.
const EXEC_TIMEOUT_MS = 30000;
const MAX_BUFFER = 8 * 1024 * 1024;

function run(cmd, args, opts = {}) {
  return new Promise((res) => {
    execFile(
      cmd, args,
      { timeout: EXEC_TIMEOUT_MS, maxBuffer: MAX_BUFFER, cwd: opts.cwd, env: process.env },
      (err, stdout, stderr) => res({ ok: !err, code: err?.code ?? 0, stdout: stdout ?? "", stderr: stderr ?? "", error: err ? String(err.message || err) : null }),
    );
  });
}

/** Invoke an `alloy-ro` verb with --json. Returns { ok, data, error }. */
export async function ro(verb, extraArgs = []) {
  if (!existsSync(ALLOY_RO)) return { ok: false, data: null, error: `alloy-ro not found at ${ALLOY_RO}` };
  const r = await run(ALLOY_RO, [verb, ...extraArgs, "--json"]);
  if (!r.ok) return { ok: false, data: null, error: r.error || r.stderr || `alloy-ro ${verb} failed` };
  try {
    return { ok: true, data: JSON.parse(r.stdout), error: null };
  } catch {
    return { ok: false, data: null, error: `alloy-ro ${verb} returned non-JSON` };
  }
}

// ---------------------------------------------------------------------------
// High-level authoritative reads — all through alloy-ro (except git log).
// ---------------------------------------------------------------------------

export async function runtimePaths() {
  const r = await ro("runtime-paths");
  return r.ok ? r.data : {};
}
/**
 * The single git-heavy read: agent-status computes ahead/behind per worktree and
 * is the primary per-slot source (worktree, slot, provider, git, ahead_behind,
 * path, branch, branch_expected, lifecycle, agent_status, server, port). Each
 * occupied worktree is a live slot; free slots are simply absent.
 */
export async function agents() {
  const r = await ro("agent-status");
  return { ok: r.ok, agents: r.ok ? r.data.agents || [] : [], error: r.error };
}
export async function root() {
  const r = await ro("root");
  return r.ok ? r.data : {};
}

/** Extended per-worker metadata for ALL workers, as a Map keyed by worktree. */
export async function workerDetailsAll() {
  const r = await ro("worker-detail");
  const list = r.ok && Array.isArray(r.data.workers) ? r.data.workers : [];
  return new Map(list.map((w) => [w.worktree, w]));
}
/** Sprint manifest projections for ALL worktrees, as a Map keyed by worktree. */
export async function sprintManifestsAll() {
  const r = await ro("sprint-manifest");
  const list = r.ok && Array.isArray(r.data.manifests) ? r.data.manifests : [];
  return new Map(list.map((m) => [m.worktree, m]));
}
/** Evidence artifact count for a worktree (contents never read). */
export async function evidenceCount(name) {
  const r = await ro("agent-evidence", [name]);
  return r.ok && Array.isArray(r.data.artifacts) ? r.data.artifacts.length : 0;
}
/** All initiatives with presentation-safe fields + decisions. */
export async function initiatives() {
  const r = await ro("initiatives");
  return r.ok && Array.isArray(r.data.initiatives) ? r.data.initiatives : [];
}
/** Cheap staging baseline sha via read-only git (avoids the slow slot loop). */
export async function baseSha(worktreePath) {
  if (!worktreePath || !existsSync(worktreePath)) return null;
  const r = await run("git", ["rev-parse", "--short", "origin/staging"], { cwd: worktreePath });
  return r.ok ? r.stdout.trim() : null;
}

/**
 * Read-only git facts for a worktree — recent commits + last-commit time. Only
 * `git log` (read-only) is used. This is the one authoritative source not routed
 * through alloy-ro (VCS truth, not a state file); documented in RUNTIME-PHASE-1.
 */
export async function gitRecent(worktreePath, limit = 6) {
  if (!worktreePath || !existsSync(worktreePath)) return { ok: false, commits: [], last_ms: null };
  const fmt = "%H%x1f%h%x1f%an%x1f%cI%x1f%s%x1e";
  const r = await run("git", ["log", `-${limit}`, `--pretty=format:${fmt}`], { cwd: worktreePath });
  if (!r.ok) return { ok: false, commits: [], last_ms: null };
  const commits = r.stdout.split("\x1e").map((s) => s.trim()).filter(Boolean).map((rec) => {
    const [sha, short, author, iso, subject] = rec.split("\x1f");
    return { sha, short, author, at: iso, at_ms: iso ? Date.parse(iso) : null, subject };
  });
  return { ok: true, commits, last_ms: commits[0]?.at_ms ?? null };
}

/** Gather the top-level authoritative reads the projections need, once. */
export async function collectRaw() {
  const [paths, agentsR, rootR, initiativesR, detailsMap, manifestsMap] = await Promise.all([
    runtimePaths(), agents(), root(), initiatives(), workerDetailsAll(), sprintManifestsAll(),
  ]);
  return { paths, agents: agentsR, root: rootR, initiatives: initiativesR, details: detailsMap, manifests: manifestsMap };
}
