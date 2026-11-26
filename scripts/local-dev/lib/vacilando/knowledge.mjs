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

/**
 * The repository this runtime is evaluating — never a guess from module layout.
 *
 * THE DEFECT THIS REPLACES: REPO_ROOT was `resolve(HERE, "..", "..", "..", "..")`,
 * which encodes ONE layout — the source checkout, where lib/vacilando sits under
 * scripts/local-dev. The Gateway runs from the immutable INSTALLED toolkit
 * (~/.local/share/alloy/toolkit/<sha>/lib/vacilando), where the same four levels
 * land on ~/.local/share/alloy: a directory that exists and is not a Git
 * repository. Every Git call anchored to REPO_ROOT then ran against a non-repo,
 * which is the `fatal: not a git repository` the Gateway logged continuously.
 *
 * The invariant: a runtime Git operation runs against an EXPLICIT repository —
 * the configured canonical repo, or the worktree being evaluated. When the
 * module's own layout is not a repository, it is not evidence of one, and the
 * explicitly configured canonical repository is used instead.
 */
function resolveRepoRoot() {
  // lib/vacilando -> local-dev -> scripts -> repo root, in a source checkout.
  const byLayout = resolve(HERE, "..", "..", "..", "..");
  // `.git` is a directory in a clone and a FILE in a linked worktree.
  if (existsSync(join(byLayout, ".git"))) return byLayout;
  const canonical = canonicalRepoFromConfig();
  if (canonical && existsSync(join(canonical, ".git"))) return canonical;
  // Neither is a repository. Return the layout value so path-containment below
  // keeps behaving, rather than silently widening to some other directory.
  return byLayout;
}

/**
 * ALLOY_REPO as the operator configured it. Read directly rather than through
 * workspace-facts so this module stays free of an import cycle.
 */
function canonicalRepoFromConfig() {
  const home = process.env.HOME || os.homedir();
  const files = [
    process.env.ALLOY_CONFIG_FILE || join(home, ".config", "alloy-dev", "config"),
    resolve(HERE, "..", "..", "alloy-config.example"),
  ];
  for (const f of files) {
    try {
      const m = readFileSync(f, "utf8").match(/^\s*ALLOY_REPO=\"?([^\"\n]*)\"?/m);
      const v = m?.[1]?.trim();
      if (v) return v.replace(/^\$HOME/, home).replace(/^~/, home);
    } catch { /* try the next source */ }
  }
  const fallback = join(home, "Alloy");
  return existsSync(fallback) ? fallback : null;
}

const REPO_ROOT = resolveRepoRoot();
const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const SNAP_DIR = join(RUNTIME_ROOT, "vacilando", "knowledge", "snapshots");

// Versioned ranking function (recorded in the snapshot). Higher = more relevant.
const RANKING_VERSION = "knowledge-rank/v2";
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
 * Retrieve knowledge scoped to a capability object → an IMMUTABLE, reproducible
 * snapshot. V2 expands the snapshot from "files" to "context": the ranked
 * referenced files PLUS sectioned context the compiler and gap analysis need —
 * accepted decisions, capability data, mission + acceptance history, evidence.
 *
 * Still context PREPARATION, not search and not reasoning: every section is
 * derived from what the (enriched) capability + its Product Definition already
 * point at, plus presence/size/hash facts. The snapshot_id hashes the content of
 * every section, so it is a PURE FUNCTION OF STATE — re-running yields the same id
 * unless a source actually changed.
 *
 * Returns { snapshot_id, retrieved_at, ranking_version, capability_id, items[],
 *           sections{}, provenance{} }. `items` is preserved for back-compat (it
 * equals sections.referenced_files) so existing consumers keep working.
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
  // 3. architecture reference(s) — capability + product definition
  if (capability.architecture_ref?.uri) add(capability.architecture_ref.uri, "architecture reference", "architecture", "capability architecture reference");
  for (const a of capability.product_definition?.architecture_references || []) add(a.uri, a.title || "architecture reference", a.kind || "architecture", "product-definition architecture reference");

  // deterministic ranking: kind weight, then present-before-missing, then uri.
  const items = scoped
    .map((it) => ({ ...it, rank: (KIND_WEIGHT[it.kind] || 30) + (it.exists ? 5 : 0) }))
    .sort((a, b) => b.rank - a.rank || (a.uri < b.uri ? -1 : 1));

  // Sectioned context (all derived from the enriched capability + product definition).
  const pd = capability.product_definition || null;
  const accepted_decisions = (capability.accepted_decisions || []).map((d) => ({ id: d.id, statement: d.statement, source: pd?.product_definition_id || null }));
  const capability_data = {
    status: capability.status || null, maturity: capability.maturity || null,
    roadmap: capability.roadmap || [], known_issues: capability.known_issues || [],
    relationships: capability.relationships || [],
    goals: pd?.goals || [], constraints: pd?.constraints || [],
  };
  const mission_history = (capability.mission_history || []).map((h) => ({ mission_id: h.mission_id, outcome: h.outcome, at: h.at }));
  const acceptance_history = capability.acceptance_history || [];
  const relevant_evidence = [
    ...items.filter((i) => i.kind === "qa" || i.kind === "evidence"),
    ...((pd?.referenced_documents || []).filter((r) => r.kind === "qa" || r.kind === "evidence")),
  ];

  const sections = {
    referenced_files: items,
    architecture: items.filter((i) => i.kind === "architecture"),
    accepted_decisions, capability_data, mission_history, acceptance_history, relevant_evidence,
  };

  // Reproducibility: the id hashes the identifying content of EVERY section.
  const digestInput = [
    RANKING_VERSION, capability.capability_id,
    items.map((i) => `${i.uri}:${i.sha || "-"}`).join(","),
    accepted_decisions.map((d) => d.id).join(","),
    `${capability_data.status}|${(capability_data.roadmap || []).map((r) => r.id).join(",")}|${(capability_data.known_issues || []).map((k) => k.id).join(",")}`,
    mission_history.map((h) => h.mission_id).join(","),
    acceptance_history.map((a) => `${a.mission_id}:${a.gate}`).join(","),
  ].join("|");
  const snapshot_id = "ksnap_" + createHash("sha256").update(digestInput).digest("hex").slice(0, 18);

  const snapshot = {
    schema_version: "vacilando.knowledge-snapshot.v2",
    snapshot_id, retrieved_at: new Date(now).toISOString(), ranking_version: RANKING_VERSION,
    capability_id: capability.capability_id, items, sections,
    provenance: { capability_updated_at: capability.updated_at || null, product_definition_updated_at: pd?.updated_at || null },
  };
  try { ensureDir(SNAP_DIR); writeFileSync(join(SNAP_DIR, `${snapshot_id}.json`), JSON.stringify(snapshot, null, 2), "utf8"); } catch { /* snapshot best-effort persisted; the object still returns */ }
  return snapshot;
}

export function readSnapshot(snapshot_id) {
  try { return JSON.parse(readFileSync(join(SNAP_DIR, `${snapshot_id}.json`), "utf8")); } catch { return null; }
}

export { REPO_ROOT };
