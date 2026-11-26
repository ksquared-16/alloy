/**
 * Vacilando — Mission Package store + readiness validation (durable).
 *
 * The Mission Package is the authoritative SEAM between preparation (Capability →
 * Knowledge → Compiler) and execution (Worker Runtime). A worker executes ONLY a
 * ready package — never a raw objective. Packages are durable, versioned, and
 * append-only-projected exactly like the mission + request stores, so a refresh
 * or restart always restores the exact package + its computed readiness.
 *
 * `readiness_status` is COMPUTED by validation on every write (never free-set,
 * except `superseded`). That is what makes "Start disabled unless ready" a real
 * gate rather than a label an operator/compiler could hand-wave.
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";
import { join } from "node:path";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "missions");
const PKG_LOG = join(DIR, "packages.jsonl");

export const READINESS = new Set(["draft", "blocked", "awaiting_operator", "ready", "superseded"]);
export const PACKAGE_ORIGIN = new Set(["manual", "compiled", "revised", "superseded"]);

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
function append(ev) { ensureDir(); appendFileSync(PKG_LOG, JSON.stringify(ev) + "\n", "utf8"); }
const iso = (ms) => new Date(ms).toISOString();
const arr = (x) => (Array.isArray(x) ? x : []);

/**
 * Deterministic readiness validation → { readiness_status, readiness_findings }.
 * Recomputed on every write. Block-level findings prevent `ready`.
 */
export function validatePackage(pkg) {
  const f = [];
  const block = (code, message, field) => f.push({ code, severity: "block", message, field });
  const warn = (code, message, field) => f.push({ code, severity: "warn", message, field });

  if (!pkg.objective || !String(pkg.objective).trim()) block("objective_missing", "Objective is empty.", "objective");
  if (arr(pkg.scope_included).length === 0) block("scope_missing", "scope_included is empty.", "scope_included");
  if (arr(pkg.scope_excluded).length === 0) block("exclusions_missing", "scope_excluded is empty — explicit exclusions are required.", "scope_excluded");
  if (arr(pkg.acceptance_criteria).length === 0) block("acceptance_criteria_missing", "No acceptance criteria.", "acceptance_criteria");
  if (arr(pkg.QA_plan).length === 0) block("qa_plan_missing", "QA_plan is empty.", "QA_plan");
  if (arr(pkg.expected_deliverables).length === 0) block("deliverables_missing", "No expected deliverables.", "expected_deliverables");

  const g = pkg.governance_constraints || {};
  const hard = ["no_push", "no_merge", "no_promote", "no_scope_broadening"];
  const missingGov = hard.filter((k) => g[k] !== true);
  if (missingGov.length) block("governance_missing", `Governance flags not set: ${missingGov.join(", ")}.`, "governance_constraints");

  // warn: a criterion with no bound evidence at all.
  const evByCrit = new Set();
  for (const e of arr(pkg.required_evidence)) for (const c of arr(e.criterion_ids)) evByCrit.add(c);
  for (const c of arr(pkg.acceptance_criteria)) {
    const hasEv = arr(c.evidence_required).length > 0 || evByCrit.has(c.id);
    if (!hasEv) warn("criterion_without_evidence", `Criterion ${c.id} has no bound evidence.`, "acceptance_criteria");
  }

  const openBlockingQ = arr(pkg.unresolved_questions).some((q) => q.blocking === true && !q.resolved);
  const openGate = arr(pkg.operator_decision_gates).some((gt) => gt.resolved === false);

  let status;
  if (pkg.readiness_status === "superseded" || pkg.superseded === true) status = "superseded";
  else if (f.some((x) => x.severity === "block")) status = "blocked";
  else if (openBlockingQ || openGate) status = "awaiting_operator";
  else status = "ready";

  return { readiness_status: status, readiness_findings: f };
}

/**
 * Create/compile a package. `readiness_status` is always (re)computed here.
 * `origin` distinguishes manual authoring from a compiled/revised package.
 */
export function createPackage(input, { origin = "compiled", nowMs } = {}) {
  const now = nowMs ?? Date.now();
  const id = "pkg_" + createHash("sha256").update(`${now}:${input.mission_id}:${input.title}:${Math.random()}`).digest("hex").slice(0, 18);
  const base = {
    schema_version: "vacilando.mission-package.v2",
    package_id: id, version: input.version || 1,
    // Lineage: stable across versions of the same mission's package (v1 → v2 → …).
    package_lineage_id: input.package_lineage_id || id,
    supersedes_package_id: input.supersedes_package_id || null,
    package_origin: PACKAGE_ORIGIN.has(origin) ? origin : "compiled",
    mission_id: input.mission_id || null, project_id: input.project_id || "alloy",
    capability_id: input.capability_id || null, worker_slot: input.worker_slot ?? null,
    title: input.title || "(untitled)", objective: input.objective || "",
    operator_directed: input.operator_directed || false,
    implement_phase: input.implement_phase || null,
    scope_included: arr(input.scope_included), scope_excluded: arr(input.scope_excluded),
    relevant_documents: arr(input.relevant_documents), approved_references: arr(input.approved_references),
    inherited_product_rules: arr(input.inherited_product_rules),
    accepted_decisions: arr(input.accepted_decisions), rejected_patterns: arr(input.rejected_patterns),
    acceptance_criteria: arr(input.acceptance_criteria), required_evidence: arr(input.required_evidence),
    suggested_acceptance_criteria: arr(input.suggested_acceptance_criteria),
    unresolved_questions: arr(input.unresolved_questions), operator_decision_gates: arr(input.operator_decision_gates),
    risks: arr(input.risks), questions: arr(input.questions),
    governance_constraints: input.governance_constraints || {},
    QA_plan: arr(input.QA_plan), expected_deliverables: arr(input.expected_deliverables),
    // Embedded upstream artifacts (reproducibility): the exact gap report +
    // product definition the package was compiled against are frozen here.
    gap_report: input.gap_report || null,
    product_definition_snapshot: input.product_definition_snapshot || null,
    readiness_verdict: input.readiness_verdict || null,
    diff_from_previous: input.diff_from_previous || null,
    compiled_at: iso(now), compiler_version: input.compiler_version || "manual/v1",
    compiler_trace: input.compiler_trace || null, knowledge_snapshot: input.knowledge_snapshot || null,
  };
  const v = validatePackage(base);
  const rec = { ...base, readiness_status: v.readiness_status, readiness_findings: v.readiness_findings, created_at: iso(now), updated_at: iso(now) };
  append({ event: "created", ...rec });
  return rec;
}

/** Append a lifecycle update; recompute readiness from the projected result. */
export function updatePackage(package_id, patch, { nowMs } = {}) {
  const cur = getPackage(package_id);
  if (!cur) return null;
  const merged = { ...cur, ...patch };
  const v = validatePackage(merged);
  append({ event: "update", package_id, updated_at: iso(nowMs ?? Date.now()), ...patch, readiness_status: v.readiness_status, readiness_findings: v.readiness_findings });
  return { ...merged, readiness_status: v.readiness_status, readiness_findings: v.readiness_findings };
}

/** Project the append-only log to current package states (newest first). */
export function readPackages(limit = 200) {
  let lines = [];
  try { lines = readFileSync(PKG_LOG, "utf8").split("\n").filter(Boolean); } catch { return []; }
  const byId = new Map();
  for (const line of lines) {
    let e; try { e = JSON.parse(line); } catch { continue; }
    const id = e.package_id; if (!id) continue;
    if (e.event === "created") { const { event, ...rec } = e; byId.set(id, rec); }
    else { const cur = byId.get(id); if (cur) { const { event, package_id: _p, ...p } = e; Object.assign(cur, p); } }
  }
  return [...byId.values()].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, limit);
}

export function getPackage(package_id) {
  if (!package_id) return null;
  return readPackages(1000).find((p) => p.package_id === package_id) || null;
}

/** The active (newest, non-superseded) package for a mission. */
export function packageForMission(mission_id) {
  return readPackages(1000).find((p) => p.mission_id === mission_id && p.readiness_status !== "superseded") || null;
}

/** All versions in a package's lineage, newest version first. */
export function packageLineage(package_lineage_id) {
  return readPackages(1000).filter((p) => (p.package_lineage_id || p.package_id) === package_lineage_id).sort((a, b) => b.version - a.version);
}

/** Deterministic diff between two package versions (set differences + verdict change). */
export function computeDiff(prev, next) {
  if (!prev) return { added: [], removed: [], resolved: [], verdict_change: next?.readiness_verdict?.verdict ? `→ ${next.readiness_verdict.verdict}` : null };
  const crit = (p) => new Set(arr(p.acceptance_criteria).map((c) => c.id || c.statement));
  const refs = (p) => new Set([...arr(p.relevant_documents), ...arr(p.approved_references)].map((r) => r.uri).filter(Boolean));
  const qs = (p) => new Set(arr(p.questions).map((q) => q.id || q.question));
  const diff = (a, b) => [...b].filter((x) => !a.has(x));
  const pc = crit(prev), nc = crit(next), pr = refs(prev), nr = refs(next), pq = qs(prev), nq = qs(next);
  return {
    added: [...diff(pc, nc).map((c) => `criterion ${c}`), ...diff(pr, nr).map((r) => `reference ${r}`)],
    removed: [...diff(nc, pc).map((c) => `criterion ${c}`), ...diff(nr, pr).map((r) => `reference ${r}`)],
    resolved: diff(nq, pq).map((q) => `question ${q}`), // present before, gone now → resolved
    verdict_change: (prev.readiness_verdict?.verdict || "?") !== (next.readiness_verdict?.verdict || "?")
      ? `${prev.readiness_verdict?.verdict || "?"} → ${next.readiness_verdict?.verdict || "?"}` : null,
  };
}

/**
 * Revise a package into a NEW version in the same lineage. The prior version is
 * marked superseded; the new one carries a computed diff_from_previous. Reuses the
 * existing supersede plumbing — a package is never mutated in place.
 */
export function revisePackage(prev_package_id, input, { nowMs } = {}) {
  const prev = getPackage(prev_package_id);
  if (!prev) return null;
  const next = createPackage({
    ...input,
    version: (prev.version || 1) + 1,
    package_lineage_id: prev.package_lineage_id || prev.package_id,
    supersedes_package_id: prev.package_id,
  }, { origin: "revised", nowMs });
  const diff = computeDiff(prev, next);
  const withDiff = updatePackage(next.package_id, { diff_from_previous: diff }, { nowMs });
  updatePackage(prev.package_id, { readiness_status: "superseded", superseded: true }, { nowMs });
  return withDiff || next;
}
