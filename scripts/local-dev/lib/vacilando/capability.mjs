/**
 * Vacilando — Capability Runtime V1 (minimal).
 *
 * The authoritative home of capability TRUTH. A capability is a first-class,
 * durable runtime object — not a document pile. Director RETRIEVES a capability
 * object; it never rediscovers one. This runtime owns capability-level truth
 * (status, maturity, roadmap, known issues, relationships, curated references)
 * and holds authoritative REFERENCES into the owning runtimes (Product
 * Definition, Acceptance, Knowledge) — it never duplicates their truth and never
 * performs generic search (that is the Knowledge Runtime).
 *
 * V1 supports one seeded capability — Access & Roles V2 — enough to prove the
 * vertical slice. The store is durable + projected so the object survives
 * restart, and the seed is idempotent (written once, retrieved forever after).
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";
import { getProductDefinitionForCapability } from "./product-definition.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "capabilities");
const CAP_LOG = join(DIR, "capabilities.jsonl");

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
function append(ev) { ensureDir(); appendFileSync(CAP_LOG, JSON.stringify(ev) + "\n", "utf8"); }
const iso = (ms) => new Date(ms).toISOString();

/** The one seeded capability object for the vertical slice: Access & Roles V2. */
function seedAccessRoles(nowMs) {
  const now = nowMs ?? Date.now();
  return {
    schema_version: "vacilando.capability.v1",
    capability_id: "cap_access_roles", project_id: "alloy",
    name: "Access & Roles", description: "User access control, roles, and permission assignment for the Alloy operator platform.",
    // ---- owned directly (capability-level truth) ----
    status: "active", maturity: "mature",
    graduation_status: { level: "mature", criteria_met: ["v1_shipped", "acceptance_gates_passing", "permission_taxonomy_stable"], criteria_pending: [], graduated_at: "2026-06-01T00:00:00.000Z" },
    roadmap: [
      { id: "rm1", item: "V2: granular per-capability permissions", status: "planned" },
      { id: "rm2", item: "V2: role templates + inheritance", status: "planned" },
      { id: "rm3", item: "V2: audit trail for permission changes", status: "planned" },
    ],
    known_issues: [
      { id: "ki1", issue: "Role changes are not audited (no change history).", severity: "medium", status: "open" },
    ],
    relationships: [
      { to: "cap_locations", kind: "shares_data_with" },
      { to: "cap_programs", kind: "adjacent" },
    ],
    operator_notes: [
      { note: "V1 role model + permission taxonomy are settled; V2 is a delta, not a redesign.", actor: "operator", at: "2026-06-15T00:00:00.000Z" },
    ],
    active_missions: [], mission_history: [],
    current_implementation: {
      code_paths: ["web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx"],
      entry_points: ["/adminV2/settings/users-roles"],
      runtime_behavior_note: "Users & Roles settings surface manages user↔role assignment in adminV2.",
      last_verified_at: iso(now),
    },
    current_runtime_behavior: { summary: "Operators assign roles to users; roles grant capability access.", health: "ok" },
    // ---- authoritative references (resolve to owning runtimes; not copies) ----
    product_definition_ref: { runtime: "product-definition", product_definition_id: "pd_access_roles", scope: "capability" },
    acceptance_ref: { runtime: "acceptance", ref: "cap_access_roles/acceptance" },
    architecture_ref: { uri: "docs/platform/planning/vacilando-os/CAPABILITY-RUNTIME-V1.md" },
    documentation_index: [
      { uri: "docs/platform/planning/vacilando-os/MISSION-RUNTIMES-ARCHITECTURE-V1.md", title: "Mission Runtimes Architecture", kind: "architecture" },
      { uri: "docs/platform/planning/vacilando-os/CAPABILITY-RUNTIME-V1.md", title: "Capability Runtime V1", kind: "architecture" },
      { uri: "web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx", title: "Users & Roles settings client", kind: "code" },
    ],
    // accepted_decisions + rejected_patterns are OWNED by the Product Definition
    // Runtime (pd_access_roles) and hydrated onto this object at read time — they
    // are no longer inlined here. See hydrateFromProductDefinition().
    approved_screenshots: [],
    visual_references: [],
    qa_evidence_ref: { runtime: "acceptance", evidence_index_ref: "cap_access_roles/evidence" },
    updated_at: iso(now), updated_by: "seed",
  };
}

const SEEDS = { cap_access_roles: seedAccessRoles };

/** Ensure the V1 seed capabilities exist (idempotent). Returns count seeded. */
export function ensureSeeded({ nowMs } = {}) {
  let n = 0;
  const have = new Set(readCapabilities().map((c) => c.capability_id));
  for (const [id, fn] of Object.entries(SEEDS)) {
    if (!have.has(id)) { append({ event: "created", ...fn(nowMs) }); n++; }
  }
  return n;
}

/** Append an update to a capability object (write-back for the learning loop). */
export function updateCapability(capability_id, patch, { nowMs } = {}) {
  append({ event: "update", capability_id, updated_at: iso(nowMs ?? Date.now()), ...patch });
}

/** Project the append-only log to current capability states. */
export function readCapabilities() {
  let lines = [];
  try { lines = readFileSync(CAP_LOG, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byId = new Map();
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const id = e.capability_id; if (!id) continue;
    if (e.event === "created") { const { event, ...rec } = e; byId.set(id, rec); }
    else { const cur = byId.get(id); if (cur) { const { event, capability_id: _c, ...p } = e; Object.assign(cur, p); } }
  }
  return [...byId.values()];
}

/**
 * Overlay the capability's product truth from its Product Definition at read time.
 * Truth lives in the Product Definition Runtime; the capability RESOLVES to it and
 * never duplicates it. Hydration is authoritative: it overrides any stale inline
 * decisions a pre-migration seed may still carry in the durable log, so a live
 * store and a fresh store converge on the same source of truth without rewriting
 * history. Downstream consumers (compiler, knowledge, gap analysis) read the
 * hydrated fields exactly as before.
 */
export function hydrateFromProductDefinition(capability) {
  if (!capability) return capability;
  const pd = getProductDefinitionForCapability(capability.capability_id);
  if (!pd) return capability;
  return {
    ...capability,
    accepted_decisions: pd.accepted_decisions || [],
    rejected_patterns: pd.rejected_patterns || [],
    product_definition: pd,
  };
}

/**
 * Retrieve ONE capability object. Director calls this to RESOLVE an intent to a
 * capability — deterministic id or fuzzy name match. Returns { ok, capability }
 * or { ok:false, reason:"no_capability", suggestion } so Director can escalate to
 * "register a new capability" rather than silently discovering. The returned
 * capability is hydrated from its Product Definition.
 */
export function retrieveCapability(query) {
  ensureSeeded();
  const caps = readCapabilities();
  const q = String(query || "").toLowerCase().trim();
  // exact id
  let hit = caps.find((c) => c.capability_id.toLowerCase() === q);
  // name contained in the intent text (e.g., "build access & roles v2" → access & roles)
  if (!hit) hit = caps.find((c) => q.includes(c.name.toLowerCase()));
  // token overlap fallback (all significant words of the capability name present)
  if (!hit) {
    hit = caps.find((c) => c.name.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 2).every((w) => q.includes(w)));
  }
  if (!hit) return { ok: false, reason: "no_capability", query, known: caps.map((c) => ({ id: c.capability_id, name: c.name })) };
  return { ok: true, capability: hydrateFromProductDefinition(hit) };
}

export function getCapability(capability_id) {
  ensureSeeded();
  const hit = readCapabilities().find((c) => c.capability_id === capability_id) || null;
  return hit ? hydrateFromProductDefinition(hit) : null;
}
