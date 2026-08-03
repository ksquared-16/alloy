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

const STATE_DIR = join(os.homedir(), ".local/state/alloy-dev/engineering-health");
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
