/**
 * Scan result cache — expensive collectors refresh on TTL; cheap ones always run.
 */
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import os from "node:os";

/*
 * Overridable so a control can exercise this store without writing to the live
 * host cache. It was not overridable, and a test of the provider-backoff record
 * wrote a fabricated "Docker is down" entry into the real one — harmless only
 * because a genuine collector run happened to overwrite it minutes later. A
 * store that cannot be pointed somewhere else is a store whose tests mutate
 * production.
 */
const STATE_DIR = process.env.ALLOY_ENGINEERING_HEALTH_DIR?.trim()
  || join(os.homedir(), ".local/state/alloy-dev/engineering-health");
const CACHE_PATH = join(STATE_DIR, "collector-cache.json");
const HISTORY_PATH = join(STATE_DIR, "disk-history.jsonl");

const DEFAULT_TTL_MS = {
  disk: 30_000,
  docker: 120_000,
  node: 180_000,
  ide_caches: 180_000,
  git_repos: 300_000,
  logs: 300_000,
  processes: 20_000,
  services: 60_000,
  large_files: 600_000,
};

function ensureDir() {
  if (!existsSync(STATE_DIR)) mkdirSync(STATE_DIR, { recursive: true });
}

export function stateDir() {
  ensureDir();
  return STATE_DIR;
}

export function readCache() {
  try {
    ensureDir();
    if (!existsSync(CACHE_PATH)) return {};
    return JSON.parse(readFileSync(CACHE_PATH, "utf8"));
  } catch {
    return {};
  }
}

export function writeCache(cache) {
  ensureDir();
  writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2));
}

export async function cachedCollect(key, fn, { refresh = false, ttlMs } = {}) {
  const cache = readCache();
  const ttl = ttlMs ?? DEFAULT_TTL_MS[key] ?? 120_000;
  const hit = cache[key];
  if (!refresh && hit?.at && Date.now() - Date.parse(hit.at) < ttl) {
    return { ...hit.value, _cache: "hit", _cached_at: hit.at };
  }
  const value = await fn();
  cache[key] = { at: new Date().toISOString(), value };
  writeCache(cache);
  return { ...value, _cache: "miss", _cached_at: cache[key].at };
}

export function recordDiskHistory(sample) {
  ensureDir();
  appendFileSync(HISTORY_PATH, `${JSON.stringify({ ...sample, at: new Date().toISOString() })}\n`);
}

export function readDiskHistory({ limit = 48 } = {}) {
  try {
    if (!existsSync(HISTORY_PATH)) return [];
    const lines = readFileSync(HISTORY_PATH, "utf8").trim().split("\n").filter(Boolean);
    return lines.slice(-limit).map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * AN OPTIONAL PROVIDER THAT IS ABSENT IS A STATE, NOT A PROBE TO REPEAT.
 *
 * THE DEFECT THIS CLOSES. Docker was not running on September 11. Every health
 * cycle nonetheless re-ran `docker version` and `docker info`, each one failing
 * to reach `~/.docker/run/docker.sock`, each one writing the same connection
 * error to Gateway stderr. Expected unavailability was rediscovered from
 * scratch, forever — the same shape as the stale-PID loop, in a different
 * subsystem.
 *
 * Docker is OPTIONAL. Vacilando must be healthy without it, so "absent" has to
 * be a cheap remembered fact rather than a subprocess and a log line.
 *
 * Backoff doubles from 1 minute to a 30-minute ceiling: a daemon someone starts
 * is noticed within half an hour without being asked every cycle meanwhile. Two
 * things still force an immediate probe — an explicit refresh, and any caller
 * that genuinely needs the provider right now — so a provider-dependent
 * operation is never answered from a stale "down".
 */
const PROVIDER_BACKOFF_FLOOR_MS = 60_000;
const PROVIDER_BACKOFF_CEILING_MS = 30 * 60_000;

export function readProviderHealth(name) {
  const cache = readCache();
  return cache.__providers?.[name] || null;
}

/** Should we spend a subprocess on this provider right now? */
export function providerProbeDue(name, { nowMs = Date.now(), force = false } = {}) {
  if (force) return true;
  const rec = readProviderHealth(name);
  if (!rec || rec.available !== false) return true;
  const next = Date.parse(rec.next_probe_at || "") || 0;
  return !next || nowMs >= next;
}

export function recordProviderHealth(name, { available, detail = null, nowMs = Date.now() } = {}) {
  const cache = readCache();
  cache.__providers = cache.__providers || {};
  const prev = cache.__providers[name] || null;
  if (available) {
    cache.__providers[name] = {
      provider: name, available: true, detail,
      observed_at: new Date(nowMs).toISOString(),
      consecutive_failures: 0, next_probe_at: null,
      unavailable_since: null,
    };
  } else {
    const failures = (prev?.available === false ? (prev.consecutive_failures || 0) : 0) + 1;
    const backoff = Math.min(PROVIDER_BACKOFF_FLOOR_MS * (2 ** (failures - 1)), PROVIDER_BACKOFF_CEILING_MS);
    cache.__providers[name] = {
      provider: name, available: false, detail,
      observed_at: new Date(nowMs).toISOString(),
      consecutive_failures: failures,
      backoff_ms: backoff,
      next_probe_at: new Date(nowMs + backoff).toISOString(),
      // Kept across failures so the operator can see how long it has been down,
      // not merely that the last probe failed.
      unavailable_since: prev?.unavailable_since || new Date(nowMs).toISOString(),
    };
  }
  writeCache(cache);
  return cache.__providers[name];
}
