/**
 * Vacilando — Knowledge Runtime V1 (minimal).
 *
 * Owns RETRIEVAL — never capability truth. Given a capability object (which
 * SCOPES the query), it returns the relevant documents plus an IMMUTABLE
 * snapshot so the compiled package is reproducible: the exact retrieval set that
 * fed compilation is recorded and content-hashed. V1 retrieves the capability's
 * curated documentation_index + implementation code paths, verifies each exists
 * in the worktree, ranks them deterministically (a versioned function, not a
 * model opinion), and persists the snapshot.
 *
 * It does NOT reason and does NOT define capability truth. It reads only what the
 * capability object points at (plus presence/size/hash) — no generic crawl in V1.
 */
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
// lib/vacilando → local-dev → scripts → repo root
const REPO_ROOT = resolve(HERE, "..", "..", "..", "..");
const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const SNAP_DIR = join(RUNTIME_ROOT, "vacilando", "knowledge", "snapshots");

// Versioned ranking function (recorded in the snapshot). Higher = more relevant.
const RANKING_VERSION = "knowledge-rank/v1";
const KIND_WEIGHT = { code: 100, architecture: 80, spec: 70, decision: 60, qa: 50, doc: 40 };

function ensureDir(d) { if (!existsSync(d)) mkdirSync(d, { recursive: true }); }

/** Resolve a repo-relative uri to an on-disk fact (presence, size, content hash). */
function inspectDoc(uri) {
  const abs = resolve(REPO_ROOT, uri);
  // Path-safety: never resolve outside the repo root.
  if (!abs.startsWith(REPO_ROOT)) return { exists: false, bytes: 0, sha: null, outside: true };
  if (!existsSync(abs)) return { exists: false, bytes: 0, sha: null };
  try {
    const st = statSync(abs);
    if (st.isDirectory()) return { exists: true, bytes: 0, sha: null, dir: true };
    const buf = readFileSync(abs);
    return { exists: true, bytes: st.size, sha: createHash("sha256").update(buf).digest("hex").slice(0, 16) };
  } catch { return { exists: false, bytes: 0, sha: null }; }
}

/**
 * Retrieve knowledge scoped to a capability object. Returns:
 *   { snapshot_id, retrieved_at, ranking_version, capability_id, items[] }
 * `items` are ranked, typed, provenance-stamped references. Persisted immutably.
 */
export function retrieveForCapability(capability, { nowMs } = {}) {
  const now = nowMs ?? Date.now();
  const scoped = [];
  const seen = new Set();
  const add = (uri, title, kind, why) => {
    if (!uri || seen.has(uri)) return; seen.add(uri);
    const f = inspectDoc(uri);
    scoped.push({ uri, title: title || uri, kind, why_relevant: why, exists: f.exists, bytes: f.bytes, sha: f.sha, outside: f.outside || false });
  };

  // 1. curated documentation index (the capability's own pointers)
  for (const d of capability.documentation_index || []) add(d.uri, d.title, d.kind || "doc", "curated documentation for the capability");
  // 2. implementation code paths (current implementation truth)
  for (const p of capability.current_implementation?.code_paths || []) add(p, p.split("/").pop(), "code", "current implementation of the capability");
  // 3. architecture reference
  if (capability.architecture_ref?.uri) add(capability.architecture_ref.uri, "architecture reference", "architecture", "capability architecture reference");

  // deterministic ranking: kind weight, then present-before-missing, then uri.
  const items = scoped
    .map((it) => ({ ...it, rank: (KIND_WEIGHT[it.kind] || 30) + (it.exists ? 5 : 0) }))
    .sort((a, b) => b.rank - a.rank || (a.uri < b.uri ? -1 : 1));

  const snapshot_id = "ksnap_" + createHash("sha256")
    .update(RANKING_VERSION + "|" + capability.capability_id + "|" + items.map((i) => `${i.uri}:${i.sha || "-"}`).join("|"))
    .digest("hex").slice(0, 18);

  const snapshot = { snapshot_id, retrieved_at: new Date(now).toISOString(), ranking_version: RANKING_VERSION, capability_id: capability.capability_id, items };
  try { ensureDir(SNAP_DIR); writeFileSync(join(SNAP_DIR, `${snapshot_id}.json`), JSON.stringify(snapshot, null, 2), "utf8"); } catch { /* snapshot best-effort persisted; the object still returns */ }
  return snapshot;
}

export function readSnapshot(snapshot_id) {
  try { return JSON.parse(readFileSync(join(SNAP_DIR, `${snapshot_id}.json`), "utf8")); } catch { return null; }
}

export { REPO_ROOT };
