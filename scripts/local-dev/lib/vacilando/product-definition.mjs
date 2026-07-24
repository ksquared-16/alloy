/**
 * Vacilando — Product Definition Runtime V1.
 *
 * The durable LONG-TERM MEMORY of a capability. This is the runtime that removes
 * manual context assembly: over many missions it ACCRETES the accepted/rejected
 * decisions, constraints, patterns, goals, tradeoffs, and operator notes that an
 * operator used to re-type into every prompt.
 *
 * Ownership contract:
 *   - Product truth (decisions/patterns/constraints/goals/…) lives HERE, not on
 *     the Capability object. The Capability holds a `product_definition_ref` and
 *     RESOLVES to this runtime; it never duplicates this truth.
 *   - Append-only JSONL, projected to current state per product_definition_id,
 *     rooted at ALLOY_RUNTIME_ROOT — durable across restart, browser is never the
 *     source of truth (identical pattern to capability/mission/package stores).
 *   - Non-reasoning: this runtime stores and projects; it never generates.
 *
 * Learning loop: on mission `accept`, the decisions a mission settled are written
 * back here (append-only, provenance-stamped to the mission). That accretion is
 * what makes the next mission need less manual preparation.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "product-definitions");
const PD_LOG = join(DIR, "product-definitions.jsonl");

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
function append(ev) { ensureDir(); appendFileSync(PD_LOG, JSON.stringify(ev) + "\n", "utf8"); }
const iso = (ms) => new Date(ms).toISOString();

/**
 * The seeded Product Definition for the vertical slice — Access & Roles.
 * This is the MIGRATION target: the accepted_decisions + rejected_patterns that
 * used to live inline on the capability seed now live here as authoritative truth,
 * enriched with the constraints/patterns/goals/tradeoffs a Product Definition owns.
 */
function seedAccessRoles(nowMs) {
  const now = nowMs ?? Date.now();
  return {
    schema_version: "vacilando.product-definition.v1",
    product_definition_id: "pd_access_roles",
    capability_id: "cap_access_roles",
    accepted_decisions: [
      { id: "ad1", statement: "Roles are the unit of permission grant; users receive capability access via roles, never directly.",
        rationale: "Governable at scale; a role is the auditable unit.", decided_at: "2026-06-01T00:00:00.000Z", decided_by: "operator", provenance: "seed", ref: "cap_access_roles/product-definition#ad1", supersedes: null },
      { id: "ad2", statement: "Permission taxonomy is capability-scoped (one permission set per capability).",
        rationale: "Keeps permissions legible and mappable to what a capability actually exposes.", decided_at: "2026-06-01T00:00:00.000Z", decided_by: "operator", provenance: "seed", ref: "cap_access_roles/product-definition#ad2", supersedes: null },
    ],
    rejected_patterns: [
      { id: "rp1", statement: "Per-user direct permission grants (bypassing roles).", reason: "Ungovernable at scale; V1 explicitly rejected it.", rejected_at: "2026-06-01T00:00:00.000Z", revisit_if: "A per-user exception model with its own audit surface is ever justified.", ref: "cap_access_roles/product-definition#rp1" },
      { id: "rp2", statement: "A single global admin flag instead of granular capability permissions.", reason: "Too coarse; the V2 delta exists precisely to replace it.", rejected_at: "2026-06-01T00:00:00.000Z", revisit_if: "never", ref: "cap_access_roles/product-definition#rp2" },
    ],
    constraints: [
      { id: "c1", statement: "Permission checks must be evaluable without a network call to a third party.", kind: "technical", hard: true },
      { id: "c2", statement: "Every permission change must be attributable to an actor.", kind: "product", hard: true },
    ],
    patterns: [
      { id: "p1", statement: "Roles compose from capability-scoped permission sets.", status: "endorsed", ref: "cap_access_roles/product-definition#ad2" },
    ],
    goals: [
      { id: "g1", statement: "Granular per-capability permissions (replace the global admin flag).", status: "active" },
      { id: "g2", statement: "Role templates + inheritance.", status: "active" },
      { id: "g3", statement: "Audit trail for permission changes.", status: "active" },
    ],
    architecture_references: [
      { uri: "docs/platform/planning/vacilando-os/CAPABILITY-RUNTIME-V1.md", title: "Capability Runtime V1", kind: "architecture" },
    ],
    known_tradeoffs: [
      { id: "t1", chose: "Role-mediated grants", over: "Direct per-user grants", because: "Auditability and scale beat per-user flexibility for the operator platform." },
    ],
    relationships: [
      { to: "pd_locations", kind: "shares_data_with" },
      { to: "pd_programs", kind: "adjacent" },
    ],
    referenced_documents: [
      { uri: "web/app/adminV2/settings/users-roles/UsersRolesSettingsClient.tsx", title: "Users & Roles settings client", kind: "code" },
    ],
    operator_notes: [
      { note: "V1 role model + permission taxonomy are settled; V2 is a delta, not a redesign.", actor: "operator", at: "2026-06-15T00:00:00.000Z" },
    ],
    mission_history: [],
    updated_at: iso(now), updated_by: "seed",
  };
}

const SEEDS = { pd_access_roles: seedAccessRoles };

/** Ensure the V1 seed product definitions exist (idempotent). Returns count seeded. */
export function ensureSeeded({ nowMs } = {}) {
  let n = 0;
  const have = new Set(readProductDefinitions().map((p) => p.product_definition_id));
  for (const [id, fn] of Object.entries(SEEDS)) {
    if (!have.has(id)) { append({ event: "created", ...fn(nowMs) }); n++; }
  }
  return n;
}

/** Append an update (write-back for the learning loop). Recompute is projection-side. */
export function updateProductDefinition(product_definition_id, patch, { nowMs } = {}) {
  append({ event: "update", product_definition_id, updated_at: iso(nowMs ?? Date.now()), ...patch });
}

/** Project the append-only log to current product-definition states. */
export function readProductDefinitions() {
  let lines = [];
  try { lines = readFileSync(PD_LOG, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byId = new Map();
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const id = e.product_definition_id; if (!id) continue;
    if (e.event === "created") { const { event, ...rec } = e; byId.set(id, rec); }
    else { const cur = byId.get(id); if (cur) { const { event, product_definition_id: _p, ...p } = e; Object.assign(cur, p); } }
  }
  return [...byId.values()];
}

export function getProductDefinition(product_definition_id) {
  ensureSeeded();
  return readProductDefinitions().find((p) => p.product_definition_id === product_definition_id) || null;
}

/** Resolve the Product Definition that owns a capability's product truth. */
export function getProductDefinitionForCapability(capability_id) {
  ensureSeeded();
  return readProductDefinitions().find((p) => p.capability_id === capability_id) || null;
}

/**
 * Ensure a capability has a Product Definition, creating an EMPTY one if it has
 * none (so a newly-defined capability can immediately receive its first decision).
 * Returns the product definition.
 */
export function ensureProductDefinitionForCapability(capability_id, { name, nowMs } = {}) {
  const existing = getProductDefinitionForCapability(capability_id);
  if (existing) return existing;
  const now = nowMs ?? Date.now();
  const pd_id = "pd_" + String(capability_id).replace(/^cap_/, "");
  const rec = {
    schema_version: "vacilando.product-definition.v1",
    product_definition_id: pd_id, capability_id, name: name || capability_id,
    accepted_decisions: [], rejected_patterns: [], constraints: [], patterns: [], goals: [],
    architecture_references: [], known_tradeoffs: [], relationships: [], referenced_documents: [],
    operator_notes: [], mission_history: [],
    updated_at: iso(now), updated_by: "operator",
  };
  append({ event: "created", ...rec });
  return rec;
}

/** Add a decision to a capability's Product Definition, creating the PD if needed. */
export function addDecisionForCapability(capability_id, decision, { name, nowMs } = {}) {
  const pd = ensureProductDefinitionForCapability(capability_id, { name, nowMs });
  return addAcceptedDecision(pd.product_definition_id, decision, { nowMs });
}

/**
 * Append an accepted decision (learning loop). Idempotent by decision id — a
 * decision already present is not duplicated. Provenance is required so every
 * decision traces to the mission (or operator) that settled it.
 */
export function addAcceptedDecision(product_definition_id, decision, { nowMs } = {}) {
  const pd = getProductDefinition(product_definition_id);
  if (!pd) return { ok: false, error: "unknown_product_definition" };
  const existing = pd.accepted_decisions || [];
  if (decision?.id && existing.some((d) => d.id === decision.id)) return { ok: true, added: false, product_definition_id };
  const rec = {
    id: decision.id || `ad_${existing.length + 1}`,
    statement: decision.statement || "",
    rationale: decision.rationale || null,
    decided_at: iso(nowMs ?? Date.now()),
    decided_by: decision.decided_by || "operator",
    provenance: decision.provenance || "operator",
    ref: decision.ref || null,
    supersedes: decision.supersedes || null,
  };
  updateProductDefinition(product_definition_id, { accepted_decisions: [...existing, rec] }, { nowMs });
  return { ok: true, added: true, decision: rec, product_definition_id };
}

/** Record a mission into the product definition's history (learning loop). */
export function recordMissionInHistory(product_definition_id, entry, { nowMs } = {}) {
  const pd = getProductDefinition(product_definition_id);
  if (!pd) return { ok: false, error: "unknown_product_definition" };
  const hist = pd.mission_history || [];
  if (entry?.mission_id && hist.some((h) => h.mission_id === entry.mission_id)) return { ok: true, added: false };
  updateProductDefinition(product_definition_id, {
    mission_history: [...hist, { mission_id: entry.mission_id, title: entry.title || null, outcome: entry.outcome || "completed", decisions_added: entry.decisions_added || [], at: iso(nowMs ?? Date.now()) }],
  }, { nowMs });
  return { ok: true, added: true };
}
