/**
 * THE owner of "does Vacilando know this worktree, and with what provenance?"
 *
 * Two facts were being conflated because nothing owned this question:
 *
 *   registration/provenance   managed · discovered · archived · unknown
 *   lifecycle/state           active · dormant · unmanaged · retirable · protected
 *
 * They are independent. A live worktree someone created outside Vacilando is
 * provenance=discovered AND lifecycle=active, and calling it "unmanaged"
 * because it has no slot conflated the two.
 *
 * WHY NOT metadata/*.env. That store is durable SLOT configuration — name,
 * slot, path, branch, agent, port — read by identity and others to answer
 * "what slot config does this managed worktree have". There are 6 records and
 * ~38 worktrees; writing discovered ones there would fabricate 30 slot
 * assignments that do not exist. Discovery must never mint management.
 *
 * WHY NOT the reconciliation adoption store. It was private to reconciliation,
 * so adopting a worktree changed nothing any other consumer could see and the
 * same correction was proposed forever.
 *
 * So: managed registration is READ from metadata/*.env, discovered
 * registration is read and written here, and consumers ask this module rather
 * than either file.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export const REGISTRATION_SCHEMA = "vacilando.worktree_registration.v1";
export const PROVENANCE = Object.freeze(["managed", "discovered", "archived", "unknown"]);

/**
 * Fields a discovered registration may NEVER carry. Discovery records that a
 * worktree EXISTS; it does not hand it a slot, a port, an agent, or ownership.
 */
export const MANAGEMENT_ONLY_FIELDS = Object.freeze(["slot", "port", "agent", "managed"]);

export function registrationStorePath(root) {
  return join(root, "registrations", "worktrees.json");
}
function managedMetadataDir(root) {
  return join(root, "metadata");
}

function readStore(root) {
  try {
    const j = JSON.parse(readFileSync(registrationStorePath(root), "utf8"));
    return { schema_version: REGISTRATION_SCHEMA, registrations: j.registrations || {} };
  } catch { return { schema_version: REGISTRATION_SCHEMA, registrations: {} }; }
}
function writeStore(root, store) {
  const p = registrationStorePath(root);
  mkdirSync(dirname(p), { recursive: true });
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(store, null, 2)}\n`, "utf8");
  renameSync(tmp, p);
}

/** Repository-aware key, so the same branch or path name in another repository cannot collide. */
export function registrationKey({ repositoryId = null, name = null, path = null } = {}) {
  const id = String(repositoryId || "unknown_repository").trim();
  const leaf = String(name || (path ? String(path).split("/").pop() : "")).trim();
  return leaf ? `${id}::${leaf}` : null;
}

/** Managed registrations, read from the canonical slot store. Never written here. */
function readManaged(root) {
  const dir = managedMetadataDir(root);
  const out = [];
  if (!existsSync(dir)) return out;
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".env")) continue;
    const name = f.replace(/\.env$/, "");
    const body = readFileSync(join(dir, f), "utf8");
    const g = (k) => (body.match(new RegExp(`^${k}="?([^"\n]*)"?`, "m")) || [])[1] || null;
    out.push({
      name,
      path: g("ALLOY_WORKTREE_PATH"),
      branch: g("ALLOY_WORKTREE_BRANCH"),
      slot: g("ALLOY_WORKTREE_SLOT"),
      agent: g("ALLOY_AGENT"),
      port: g("PORT"),
      repository_id: g("ALLOY_REPOSITORY_ID") || "repo_alloy",
      provenance: "managed",
      managed: true,
      source: "slot_metadata",
    });
  }
  return out;
}

/** Every worktree Vacilando knows, from every registration source. */
export function listRegisteredWorktrees({ root } = {}) {
  const managed = readManaged(root);
  const managedNames = new Set(managed.map((m) => m.name));
  const discovered = Object.values(readStore(root).registrations)
    // Managed wins: once a worktree has real slot ownership, its discovered
    // record is history rather than a competing answer.
    .filter((r) => !managedNames.has(r.name))
    .map((r) => ({ ...r, managed: false }));
  return [...managed, ...discovered];
}

/** The answer for one worktree. Unknown is a real answer, not an absence. */
export function resolveWorktreeRegistration({ root, name = null, path = null, repositoryId = null } = {}) {
  const leaf = String(name || (path ? String(path).split("/").pop() : "")).trim();
  if (!leaf) return { provenance: "unknown", managed: false, known: false };
  const all = listRegisteredWorktrees({ root });
  const hit = all.find((r) => r.name === leaf
    && (!repositoryId || !r.repository_id || r.repository_id === repositoryId));
  if (!hit) return { provenance: "unknown", managed: false, known: false, name: leaf };
  return { ...hit, known: true };
}

export function isManagedWorktree(args) {
  return resolveWorktreeRegistration(args).managed === true;
}
export function registrationProvenance(args) {
  return resolveWorktreeRegistration(args).provenance;
}

/**
 * Record that a worktree EXISTS and was discovered rather than created here.
 *
 * Refuses to mint management: any management-only field supplied is rejected
 * outright rather than dropped, because silently ignoring a slot is how a
 * caller comes to believe one was assigned.
 */
export function registerDiscoveredWorktree({
  root, name, path = null, repositoryId = null, branch = null,
  evidence = null, nowMs = Date.now(), extra = null,
} = {}) {
  const leaf = String(name || (path ? String(path).split("/").pop() : "")).trim();
  if (!leaf) return { ok: false, error: "missing_worktree_identity" };
  if (!root) return { ok: false, error: "missing_runtime_root" };
  if (extra) {
    for (const f of MANAGEMENT_ONLY_FIELDS) {
      if (extra[f] != null) return { ok: false, error: "discovery_may_not_assign_management", field: f };
    }
  }
  const key = registrationKey({ repositoryId, name: leaf });
  const store = readStore(root);
  const existing = store.registrations[key] || null;
  const record = {
    schema_version: REGISTRATION_SCHEMA,
    name: leaf,
    path: path || existing?.path || null,
    repository_id: repositoryId || existing?.repository_id || null,
    branch: branch || existing?.branch || null,
    provenance: "discovered",
    managed: false,
    // Original discovery is audit. Re-adopting does not rewrite when it happened.
    registered_at: existing?.registered_at || new Date(nowMs).toISOString(),
    last_seen_at: new Date(nowMs).toISOString(),
    evidence: evidence || existing?.evidence || null,
  };
  store.registrations[key] = record;
  writeStore(root, store);
  return { ok: true, registration: record };
}

/**
 * Bring historical reconciliation adoption records into the canonical store.
 *
 * A record whose worktree no longer exists in git must NOT create a
 * registration — migration may preserve evidence, never manufacture presence.
 */
export function migrateAdoptionRecords({ root, existsInGit = null, nowMs = Date.now() } = {}) {
  const dir = join(root, "reconciliation");
  const migrated = [];
  const rejected = [];
  if (!existsSync(dir)) return { migrated, rejected };
  for (const f of readdirSync(dir)) {
    if (!f.startsWith("worktree-") || !f.endsWith(".json")) continue;
    let rec = null;
    try { rec = JSON.parse(readFileSync(join(dir, f), "utf8")); } catch { rec = null; }
    if (!rec?.path) { rejected.push({ file: f, reason: "unreadable_or_pathless" }); continue; }
    if (rec.managed === true || rec.provenance !== "discovered") {
      rejected.push({ file: f, reason: "record_claims_management" });
      continue;
    }
    if (typeof existsInGit === "function" && existsInGit(rec.path) !== true) {
      rejected.push({ file: f, path: rec.path, reason: "worktree_absent_from_git" });
      continue;
    }
    const out = registerDiscoveredWorktree({
      root, name: rec.path, repositoryId: rec.repository_id || null,
      evidence: { migrated_from: f, adopted_at: rec.adopted_at || null, kind: rec.kind || null },
      nowMs,
    });
    (out.ok ? migrated : rejected).push(out.ok ? { file: f, name: rec.path } : { file: f, reason: out.error });
  }
  return { migrated, rejected };
}
