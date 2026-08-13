#!/usr/bin/env node
/**
 * Vacilando Runtime — Authoritative Source adapters.
 *
 * Hot-path board status uses ONE Node workspace snapshot (workspace-facts.mjs)
 * with singleflight + TTL. The previous design spawned six parallel `alloy-ro`
 * Bash processes per refresh (plus per-slot evidence + concurrent `du`), which
 * drove sustained host load into the 30–90+ range on an 8-core Mac.
 *
 * `alloy-ro` remains available for explicit/on-demand verbs and as a fallback
 * when the Node snapshot fails. It is no longer on the normal poll path.
 */
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  buildWorkspaceFacts,
  clearWorkspaceFactCaches,
  evidenceCountFor,
  resolveRuntimeConfig,
  WORKSPACE_FACT_TTLS,
} from "./workspace-facts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
export const TOOLKIT_DIR = resolve(HERE, "..", "..");
const ALLOY_RO = join(TOOLKIT_DIR, "alloy-ro");

const EXEC_TIMEOUT_MS = 30000;
const MAX_BUFFER = 8 * 1024 * 1024;

/** Stable workspace metadata + agent projection TTL (human-visible Director cadence). */
export const RAW_TTL_MS = 30_000;
/** Git log / activity enrichment — slower than board poll. */
export const GIT_RECENT_TTL_MS = 90_000;
/** Worktree `du` is never on the status hot path; explicit/slow only. */
export const DISK_SIZE_TTL_MS = 15 * 60_000;

const metrics = {
  status_requests: 0,
  collect_raw_starts: 0,
  collect_raw_shared: 0,
  collect_raw_cache_hits: 0,
  alloy_ro_spawns: 0,
  du_executions: 0,
  max_overlapping_collect_raw: 0,
  last_collect_raw_ms: 0,
  last_mode: "none", // node | alloy-ro-fallback
};

let overlappingCollectRaw = 0;

export function getOrchestrationMetrics() {
  return { ...metrics, overlapping_collect_raw: overlappingCollectRaw, ttls: { raw_ms: RAW_TTL_MS, git_recent_ms: GIT_RECENT_TTL_MS, disk_size_ms: DISK_SIZE_TTL_MS, ...WORKSPACE_FACT_TTLS } };
}

export function resetOrchestrationMetrics() {
  for (const k of Object.keys(metrics)) {
    if (typeof metrics[k] === "number") metrics[k] = 0;
    else metrics[k] = "none";
  }
  overlappingCollectRaw = 0;
}

export function noteStatusRequest() {
  metrics.status_requests += 1;
}

export function noteDuExecution() {
  metrics.du_executions += 1;
}

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
  metrics.alloy_ro_spawns += 1;
  if (!existsSync(ALLOY_RO)) return { ok: false, data: null, error: `alloy-ro not found at ${ALLOY_RO}` };
  const r = await run(ALLOY_RO, [verb, ...extraArgs, "--json"]);
  if (!r.ok) return { ok: false, data: null, error: r.error || r.stderr || `alloy-ro ${verb} failed` };
  try {
    return { ok: true, data: JSON.parse(r.stdout), error: null };
  } catch {
    return { ok: false, data: null, error: `alloy-ro ${verb} returned non-JSON` };
  }
}

export async function runtimePaths() {
  try {
    const cfg = resolveRuntimeConfig();
    return {
      config_file: cfg.config_file,
      runtime_root: cfg.runtime_root,
      metadata_dir: cfg.metadata_dir,
      pids_dir: cfg.pids_dir,
      logs_dir: cfg.logs_dir,
      locks_dir: cfg.locks_dir,
      auth_dir: cfg.auth_dir,
      evidence_dir: cfg.evidence_dir,
      initiatives_dir: cfg.initiatives_dir,
      runtime_root_exists: cfg.runtime_root_exists,
    };
  } catch {
    const r = await ro("runtime-paths");
    return r.ok ? r.data : {};
  }
}

export async function agents() {
  const raw = await collectRaw();
  return raw.agents;
}

export async function root() {
  const raw = await collectRaw();
  return raw.root;
}

export async function workerDetailsAll() {
  const raw = await collectRaw();
  return raw.details;
}

export async function sprintManifestsAll() {
  const raw = await collectRaw();
  return raw.manifests;
}

/** Evidence artifact count — Node readdir, never alloy-ro on the hot path. */
export async function evidenceCount(name) {
  try {
    const cfg = resolveRuntimeConfig();
    return evidenceCountFor(cfg, name);
  } catch {
    const r = await ro("agent-evidence", [name]);
    return r.ok && Array.isArray(r.data.artifacts) ? r.data.artifacts.length : 0;
  }
}

export async function initiatives() {
  const raw = await collectRaw();
  return raw.initiatives;
}

export async function baseSha(worktreePath) {
  if (!worktreePath || !existsSync(worktreePath)) return null;
  const r = await run("git", ["rev-parse", "--short", "origin/staging"], { cwd: worktreePath });
  return r.ok ? r.stdout.trim() : null;
}

const gitRecentCache = new Map(); // path -> { at, value, inflight }

export async function gitRecent(worktreePath, limit = 6) {
  if (!worktreePath || !existsSync(worktreePath)) return { ok: false, commits: [], last_ms: null };
  const now = Date.now();
  const hit = gitRecentCache.get(worktreePath);
  if (hit?.value && now - hit.at < GIT_RECENT_TTL_MS) return hit.value;
  if (hit?.inflight) return hit.inflight;

  const inflight = (async () => {
    const fmt = "%H%x1f%h%x1f%an%x1f%cI%x1f%s%x1e";
    const r = await run("git", ["log", `-${limit}`, `--pretty=format:${fmt}`], { cwd: worktreePath });
    if (!r.ok) return { ok: false, commits: [], last_ms: null };
    const commits = r.stdout.split("\x1e").map((s) => s.trim()).filter(Boolean).map((rec) => {
      const [sha, short, author, iso, subject] = rec.split("\x1f");
      return { sha, short, author, at: iso, at_ms: iso ? Date.parse(iso) : null, subject };
    });
    return { ok: true, commits, last_ms: commits[0]?.at_ms ?? null };
  })();

  gitRecentCache.set(worktreePath, { at: 0, value: null, inflight });
  try {
    const value = await inflight;
    gitRecentCache.set(worktreePath, { at: Date.now(), value, inflight: null });
    return value;
  } catch (e) {
    gitRecentCache.set(worktreePath, { at: 0, value: null, inflight: null });
    throw e;
  }
}

const rawState = { at: 0, value: null, inflight: null, error: null };

export function invalidateRawCache() {
  rawState.at = 0;
  rawState.value = null;
  rawState.error = null;
  clearWorkspaceFactCaches();
  gitRecentCache.clear();
}

async function collectRawViaAlloyRo() {
  metrics.last_mode = "alloy-ro-fallback";
  const [paths, agentsR, rootR, initiativesR, detailsMap, manifestsMap] = await Promise.all([
    (async () => { const r = await ro("runtime-paths"); return r.ok ? r.data : {}; })(),
    (async () => { const r = await ro("agent-status"); return { ok: r.ok, agents: r.ok ? r.data.agents || [] : [], error: r.error }; })(),
    (async () => { const r = await ro("root"); return r.ok ? r.data : {}; })(),
    (async () => { const r = await ro("initiatives"); return r.ok && Array.isArray(r.data.initiatives) ? r.data.initiatives : []; })(),
    (async () => {
      const r = await ro("worker-detail");
      const list = r.ok && Array.isArray(r.data.workers) ? r.data.workers : [];
      return new Map(list.map((w) => [w.worktree, w]));
    })(),
    (async () => {
      const r = await ro("sprint-manifest");
      const list = r.ok && Array.isArray(r.data.manifests) ? r.data.manifests : [];
      return new Map(list.map((m) => [m.worktree, m]));
    })(),
  ]);
  return {
    paths,
    agents: agentsR,
    root: rootR,
    initiatives: initiativesR,
    details: detailsMap,
    manifests: manifestsMap,
    evidence: new Map(),
    servers: [],
    mode: "alloy-ro-fallback",
  };
}

async function computeRaw() {
  const t0 = Date.now();
  overlappingCollectRaw += 1;
  metrics.collect_raw_starts += 1;
  metrics.max_overlapping_collect_raw = Math.max(metrics.max_overlapping_collect_raw, overlappingCollectRaw);
  try {
    try {
      const facts = await buildWorkspaceFacts();
      metrics.last_mode = "node";
      return {
        paths: facts.paths,
        agents: facts.agents,
        root: facts.root,
        initiatives: facts.initiatives,
        details: facts.details,
        manifests: facts.manifests,
        evidence: facts.evidence,
        servers: facts.servers,
        mode: "node",
      };
    } catch (e) {
      // Soft fallback — preserve Director correctness if Node discovery fails.
      return collectRawViaAlloyRo();
    }
  } finally {
    overlappingCollectRaw = Math.max(0, overlappingCollectRaw - 1);
    metrics.last_collect_raw_ms = Date.now() - t0;
  }
}

/**
 * Singleflight + TTL workspace snapshot. Concurrent callers share one compute.
 * A slow computation cannot overlap with another identical computation.
 */
export async function collectRaw({ force = false } = {}) {
  const now = Date.now();
  if (!force && rawState.value && now - rawState.at < RAW_TTL_MS) {
    metrics.collect_raw_cache_hits += 1;
    return rawState.value;
  }
  if (rawState.inflight) {
    metrics.collect_raw_shared += 1;
    return rawState.inflight;
  }
  rawState.inflight = computeRaw()
    .then((value) => {
      rawState.value = value;
      rawState.at = Date.now();
      rawState.error = null;
      rawState.inflight = null;
      return value;
    })
    .catch((e) => {
      rawState.inflight = null;
      rawState.error = String(e.message || e);
      if (rawState.value) return rawState.value;
      throw e;
    });
  return rawState.inflight;
}
