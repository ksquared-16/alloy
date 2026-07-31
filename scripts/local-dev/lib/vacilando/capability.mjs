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
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";
import { getProductDefinitionForCapability } from "./product-definition.mjs";
import { readMissions } from "./commands/missions.mjs";
import { readAcceptanceForCapability } from "./acceptance.mjs";

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
    schema_version: "vacilando.capability.v2",
    capability_id: "cap_access_roles", project_id: "alloy", slug: "access-roles",
    name: "Access & Roles", description: "User access control, roles, and permission assignment for the Alloy operator platform.",
    owner: { operator: "kelly", provider_default: "claude" },
    dependencies: [{ capability_id: "cap_locations", kind: "soft" }],
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
      code_paths: ["web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx"],
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
      { uri: "web/components/adminV2/settings/usersRoles/UsersRolesConfigurationPage.tsx", title: "Users & Roles configuration page", kind: "code" },
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

/** Metrics PROJECTED from the durable mission + acceptance logs (never hand-set). */
export function projectCapabilityMetrics(capability_id, cap) {
  const missions = readMissions(null, 1000).filter((m) => m.capability_id === capability_id);
  const completed = missions.filter((m) => m.status === "completed");
  const accepts = readAcceptanceForCapability(capability_id).filter((a) => a.gate === "pass" || a.gate === "needs_operator");
  return {
    missions_total: missions.length,
    missions_completed: completed.length,
    missions_active: missions.filter((m) => !["completed", "failed", "stopped"].includes(m.status)).length,
    last_accepted_at: accepts[0]?.at || null,
    open_issues: (cap?.known_issues || []).filter((k) => k.status === "open").length,
  };
}

/** Readiness PROJECTED honestly: a capability with a Product Definition and no open
 *  blocking issue is prep-ready; otherwise it names what it needs. */
export function projectReadiness(cap) {
  const reasons = [];
  if (!cap?.product_definition) reasons.push("no product definition");
  if (!(cap?.documentation_index || []).length && !(cap?.knowledge_references || []).length) reasons.push("no knowledge references");
  const level = reasons.length ? "needs_prep" : "ready";
  return { level, reasons, computed_at: iso(Date.now()) };
}

/** Full read-time enrichment: PD hydration + projected metrics/acceptance/readiness. */
function enrichCapability(cap) {
  if (!cap) return cap;
  const h = hydrateFromProductDefinition(cap);
  return {
    ...h,
    owner: h.owner || { operator: "kelly", provider_default: "claude" },
    dependencies: h.dependencies || (h.relationships || []).filter((r) => r.kind === "depends_on").map((r) => ({ capability_id: r.to, kind: "hard" })),
    related_capabilities: h.related_capabilities || (h.relationships || []).map((r) => r.to),
    acceptance_history: readAcceptanceForCapability(cap.capability_id),
    metrics: projectCapabilityMetrics(cap.capability_id, h),
    readiness: projectReadiness(h),
  };
}

/**
 * Register a NEW capability (the registry replaces the single-seed model). The
 * store now holds N capabilities; registration is idempotent by capability_id.
 * Returns { ok, capability } enriched, or an existing one unchanged.
 */
export function registerCapability(input, { nowMs } = {}) {
  ensureSeeded();
  const name = String(input?.name || "").trim();
  if (!name) return { ok: false, error: "name_required" };
  const slug = String(input?.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const id = input?.capability_id || ("cap_" + createHash("sha256").update(slug).digest("hex").slice(0, 12));
  const existing = readCapabilities().find((c) => c.capability_id === id);
  if (existing) return { ok: true, created: false, capability: enrichCapability(existing) };
  const now = nowMs ?? Date.now();
  const rec = {
    schema_version: "vacilando.capability.v2",
    capability_id: id, project_id: input.project_id || "alloy", slug,
    name, description: input.description || "",
    owner: input.owner || { operator: "kelly", provider_default: "claude" },
    status: input.status || "active", maturity: input.maturity || "new",
    roadmap: input.roadmap || [], known_issues: input.known_issues || [],
    relationships: input.relationships || [], dependencies: input.dependencies || [],
    operator_notes: input.operator_notes || [], active_missions: [], mission_history: [],
    current_implementation: input.current_implementation || { code_paths: [], entry_points: [] },
    product_definition_ref: input.product_definition_ref || null,
    architecture_ref: input.architecture_ref || null,
    documentation_index: input.documentation_index || [],
    updated_at: iso(now), updated_by: input.updated_by || "operator",
  };
  append({ event: "created", ...rec });
  return { ok: true, created: true, capability: enrichCapability(rec) };
}

/** List every registered capability, enriched. */
export function listCapabilities() {
  ensureSeeded();
  return readCapabilities().map(enrichCapability);
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
  return { ok: true, capability: enrichCapability(hit) };
}

export function getCapability(capability_id) {
  ensureSeeded();
  const hit = readCapabilities().find((c) => c.capability_id === capability_id) || null;
  return hit ? enrichCapability(hit) : null;
}
