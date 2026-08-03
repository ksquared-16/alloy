/**
 * Vacilando — Acceptance Runtime V1 (minimal).
 *
 * Evaluates ONLY the package's declared acceptance_criteria against real
 * evidence, and is HONEST about what it can and cannot verify:
 *   - objective evidence (file exists, sections present, no source changed,
 *     source_changed, tests_pass, qa_evidence, migration_accounted) is
 *     auto-verified → met / unmet (awaiting_authorization → operator_review)
 *   - subjective/product-fidelity evidence is NOT faked → status "operator_review"
 *     and surfaced to Kelly for final QA
 *
 * Produces a gate verdict (pass | needs_operator | fail) + a durable decision
 * ledger entry. The gate never auto-accepts a mission — a "completed" mission
 * requires this gate to pass AND (for anything operator_review) Kelly's sign-off.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { join, resolve, extname } from "node:path";

import { REPO_ROOT } from "./knowledge.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "acceptance");
const LEDGER = join(DIR, "ledger.jsonl");
const OUT_ROOT = join(RUNTIME_ROOT, "vacilando", "missions", "outputs");

// Mission outputs (proposals and operator-directed deliverables) both live under
// the vacilando-os QA docs tree; changes there are allowed, application source is not.
const ALLOWED_CHANGE_PREFIX = "docs/platform/planning/vacilando-os/qa/";
const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
/** Local copy of the mission-report reader — do NOT import mission-executor (cycle). */
function readMissionReport(mission_id) {
  if (!mission_id) return null;
  try {
    const idxPath = join(OUT_ROOT, mission_id, "outputs.jsonl");
    const idx = readFileSync(idxPath, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
    const withReport = idx.filter((o) => o.has_report);
    const turn = (withReport.length ? withReport : idx).slice(-1)[0]?.turn;
    if (turn == null) return null;
    return JSON.parse(readFileSync(join(OUT_ROOT, mission_id, `turn-${turn}.report.json`), "utf8"));
  } catch { return null; }
}
function dirtyPaths(cwd) {
  if (!cwd || !existsSync(cwd)) return [];
  try { return execFileSync("git", ["-C", cwd, "status", "--porcelain"], { encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 }).split("\n").filter(Boolean).map((l) => l.slice(3).trim()).filter(Boolean); }
  catch { return []; }
}
function attributablePaths(mission, cwd) {
  const baseline = new Set(mission.git_baseline || []);
  return dirtyPaths(cwd).filter((p) => !baseline.has(p));
}
function isAppSource(p) {
  // Application / test / schema code — not planning docs under the QA tree.
  if (p.startsWith(ALLOWED_CHANGE_PREFIX)) return false;
  if (p.startsWith("docs/")) return false;
  return /^(web\/|supabase\/|scripts\/|packages\/)/.test(p)
    || /\.(ts|tsx|js|jsx|mjs|cjs|sql|json)$/.test(p);
}
function walkImages(absDir, out = [], depth = 0) {
  if (depth > 6 || !absDir || !existsSync(absDir)) return out;
  let entries = [];
  try { entries = readdirSync(absDir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(absDir, e.name);
    if (e.isDirectory()) walkImages(p, out, depth + 1);
    else if (IMAGE_EXTS.has(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}
function testsPassed(results) {
  if (results == null) return false;
  if (results === true || results === "pass" || results === "passed" || results === "ok") return true;
  if (typeof results !== "object") return false;
  if (results.pass === true || results.passed === true || results.ok === true || results.success === true) return true;
  if (typeof results.status === "string" && /^(pass|passed|ok|success)$/i.test(results.status)) return true;
  // Node test runner / vitest-ish shapes
  if (typeof results.fail === "number" && results.fail === 0 && (results.pass > 0 || results.passed > 0 || results.total > 0)) return true;
  if (typeof results.failed === "number" && results.failed === 0 && (results.passed > 0 || results.tests > 0)) return true;
  return false;
}

/** The evidence-kind checks. Each returns { status, detail }. */
function checkEvidence(kind, { pkg, mission, cwd }) {
  const deliverable = (pkg.expected_deliverables || []).find((d) => d.path) || null;
  const relPath = deliverable?.path || null;
  const absPath = relPath && cwd ? resolve(cwd, relPath) : null;

  if (kind === "file_exists") {
    if (!absPath) return { status: "unmet", detail: "no deliverable path declared" };
    if (!existsSync(absPath)) return { status: "unmet", detail: `${relPath} does not exist` };
    const sz = statSync(absPath).size;
    return sz > 0 ? { status: "met", detail: `${relPath} exists (${sz} bytes)` } : { status: "unmet", detail: `${relPath} is empty` };
  }
  if (kind === "sections_present") {
    if (!absPath || !existsSync(absPath)) return { status: "unmet", detail: "deliverable missing; cannot check sections" };
    const text = readFileSync(absPath, "utf8");
    // Section list is derived from the criteria statement / compiler; check headings.
    const sections = ["Current-State Analysis", "V2 Scope", "Data Model Changes", "Acceptance Criteria", "QA Plan", "Rollout"];
    const missing = sections.filter((s) => !new RegExp(`^#+\\s*.*${s.replace(/[.*+?^${}()|[\]\\-]/g, "\\$&")}`, "im").test(text) && !text.includes(s));
    return missing.length ? { status: "unmet", detail: `missing sections: ${missing.join(", ")}` } : { status: "met", detail: "all required sections present" };
  }
  if (kind === "git_clean_outside_docs") {
    const attributable = attributablePaths(mission, cwd);
    const offending = attributable.filter((p) => !p.startsWith(ALLOWED_CHANGE_PREFIX));
    if (offending.length) return { status: "unmet", detail: `mission changed files outside the allowed docs path: ${offending.slice(0, 8).join(", ")}` };
    return { status: "met", detail: attributable.length ? `only allowed docs changed (${attributable.length})` : "no new changes attributable to the mission" };
  }
  if (kind === "source_changed") {
    // Implement phases MUST touch application source (not only docs).
    const attributable = attributablePaths(mission, cwd);
    const source = attributable.filter(isAppSource);
    // Prefer live git; fall back to the mission report's changed_files if the tree
    // was cleaned/committed after the turn (still evidence the work happened).
    if (!source.length) {
      let report = null;
      try { report = readMissionReport(mission.mission_id); } catch { /* none */ }
      const reported = (report?.changed_files || []).filter(isAppSource);
      if (reported.length) return { status: "met", detail: `report lists ${reported.length} source change(s): ${reported.slice(0, 6).join(", ")}` };
      return { status: "unmet", detail: attributable.length ? `mission changed files but none look like application source (${attributable.slice(0, 6).join(", ")})` : "no attributable source changes in the worktree or mission report" };
    }
    return { status: "met", detail: `application source changed (${source.length}): ${source.slice(0, 6).join(", ")}` };
  }
  if (kind === "tests_pass") {
    let report = null;
    try { report = readMissionReport(mission.mission_id); } catch { /* none */ }
    const tests = report?.tests;
    if (!tests || tests.ran !== true) {
      return { status: "unmet", detail: tests ? "mission report says tests did not run (tests.ran !== true)" : "no mission report with tests block" };
    }
    if (!testsPassed(tests.results)) {
      return { status: "unmet", detail: `tests ran but results do not show a pass: ${JSON.stringify(tests.results).slice(0, 160)}` };
    }
    return { status: "met", detail: "mission report: tests ran and passed" };
  }
  if (kind === "qa_evidence") {
    // Prefer the evidence deliverable path (QA dir); fall back to any pathed deliverable.
    const qaDeliv = (pkg.expected_deliverables || []).find((d) => d.path && (d.kind === "evidence" || /qa|screenshot/i.test(d.description || ""))) || deliverable;
    const qaRel = qaDeliv?.path || null;
    if (!qaRel || !cwd) return { status: "unmet", detail: "no QA evidence path declared on the package" };
    const qaAbs = resolve(cwd, qaRel);
    if (!qaAbs.startsWith(cwd)) return { status: "unmet", detail: "QA path escapes worktree" };
    const images = walkImages(qaAbs);
    if (!images.length) return { status: "unmet", detail: `no screenshots under ${qaRel}` };
    return { status: "met", detail: `${images.length} screenshot(s) under ${qaRel}` };
  }
  if (kind === "migration_accounted") {
    // Implement phases must not silently skip schema migrations. Attribution:
    // new/changed *.sql under supabase/migrations (git or report) must appear
    // in vacilando-report.migrations[] with an explicit status. No migration
    // files → met (not_required). awaiting_authorization → operator_review
    // (honest gate; not auto-pass). applied* / not_required → met.
    const attributable = attributablePaths(mission, cwd);
    let report = null;
    try { report = readMissionReport(mission.mission_id); } catch { /* none */ }
    const reportedFiles = (report?.changed_files || []).filter((p) => typeof p === "string");
    const migPaths = [...new Set([
      ...attributable.filter((p) => /^supabase\/migrations\/.+\.sql$/i.test(p)),
      ...reportedFiles.filter((p) => /^supabase\/migrations\/.+\.sql$/i.test(p)),
    ])];
    const entries = Array.isArray(report?.migrations) ? report.migrations : null;
    if (!migPaths.length) {
      // No migration files attributed — optional explicit not_required is fine.
      if (entries?.length) {
        const bad = entries.filter((e) => e && !/^(applied|awaiting_authorization|not_required)/i.test(String(e.status || "")));
        if (bad.length) return { status: "unmet", detail: `migrations[] has unknown status: ${bad.map((b) => b.status).join(", ")}` };
      }
      return { status: "met", detail: "no supabase migration files attributed to this mission" };
    }
    if (!entries) {
      return { status: "unmet", detail: `migration file(s) present (${migPaths.slice(0, 4).join(", ")}) but vacilando-report has no migrations[]` };
    }
    const byPath = new Map(entries.filter((e) => e?.path).map((e) => [String(e.path).replace(/^\.\//, ""), e]));
    const missing = migPaths.filter((p) => !byPath.has(p) && ![...byPath.keys()].some((k) => k.endsWith(p) || p.endsWith(k)));
    if (missing.length) {
      return { status: "unmet", detail: `migration file(s) not accounted in migrations[]: ${missing.slice(0, 4).join(", ")}` };
    }
    const statuses = migPaths.map((p) => {
      const e = byPath.get(p) || [...byPath.entries()].find(([k]) => k.endsWith(p) || p.endsWith(k))?.[1];
      return { path: p, status: String(e?.status || "").toLowerCase(), target: e?.target || null };
    });
    const unknown = statuses.filter((s) => !/^(applied|awaiting_authorization|not_required)/.test(s.status));
    if (unknown.length) {
      return { status: "unmet", detail: `unknown migration status: ${unknown.map((u) => `${u.path}=${u.status || "(empty)"}`).join(", ")}` };
    }
    const awaiting = statuses.filter((s) => s.status === "awaiting_authorization");
    if (awaiting.length) {
      // Shared/live targets require a documented preflight before the operator is asked
      // to authorize apply. Local/none may still use bare awaiting_authorization.
      const sharedish = (t) => /^(shared|live|staging|production)$/i.test(String(t || ""));
      const needsPreflight = awaiting.filter((a) => {
        const e = byPath.get(a.path) || [...byPath.entries()].find(([k]) => k.endsWith(a.path) || a.path.endsWith(k))?.[1];
        return sharedish(e?.target || a.target);
      });
      const missingPf = [];
      const failedPf = [];
      for (const a of needsPreflight) {
        const e = byPath.get(a.path) || [...byPath.entries()].find(([k]) => k.endsWith(a.path) || a.path.endsWith(k))?.[1];
        const pf = e?.preflight;
        if (!pf || typeof pf !== "object") {
          missingPf.push(a.path);
          continue;
        }
        if (pf.ok !== true) failedPf.push(`${a.path}${pf.summary ? ` (${pf.summary})` : ""}`);
      }
      if (missingPf.length) {
        return {
          status: "unmet",
          detail: `shared/live migration(s) awaiting_authorization without preflight{ok}: ${missingPf.slice(0, 4).join(", ")} — run read-only apply preflight (orphan grants, unexpected FKs, catalog width) and attach results before asking the operator`,
        };
      }
      if (failedPf.length) {
        return {
          status: "unmet",
          detail: `shared/live migration preflight failed: ${failedPf.slice(0, 4).join(", ")} — harden the migration, then re-run preflight`,
        };
      }
      return {
        status: "operator_review",
        detail: `migration(s) awaiting operator authorization (preflight ok): ${awaiting.map((a) => `${a.path}${a.target ? ` → ${a.target}` : ""}`).join(", ")}`,
      };
    }
    return { status: "met", detail: `all ${statuses.length} migration(s) accounted (${statuses.map((s) => s.status).join(", ")})` };
  }
  if (kind === "intent_fidelity") {
    // Load-bearing integrity: whether the deliverables satisfy the APPROVED
    // objective (not a generic substitute) is a semantic judgment only the
    // operator can make. It is never auto-met, so a mission can never pass by
    // producing an unrelated artifact — the operator must consciously confirm.
    return { status: "operator_review", detail: "Requires the operator to confirm the outputs satisfy the objective they approved." };
  }
  if (kind === "rejected_patterns_not_reintroduced") {
    // Product-fidelity: not reliably machine-verifiable when patterns exist →
    // honest operator review, with a light advisory scan to help the operator.
    // When the capability declares NO rejected patterns, auto-met so implement
    // phases can complete unattended under evidence-only auto-accept.
    const patterns = pkg.rejected_patterns || [];
    if (!patterns.length) return { status: "met", detail: "capability declares no rejected patterns" };
    let advisory = "no obvious reintroduction detected";
    if (deliverable && cwd && absPath && existsSync(absPath)) {
      const text = readFileSync(absPath, "utf8").toLowerCase();
      const hits = patterns.filter((rp) => text.includes(String(rp.statement || "").toLowerCase().slice(0, 24)));
      if (hits.length) advisory = `advisory: proposal text references rejected pattern(s) ${hits.map((h) => h.id).join(", ")} — operator should confirm they are cited as rejected, not proposed`;
    }
    return { status: "operator_review", detail: advisory };
  }
  return { status: "operator_review", detail: `evidence kind "${kind}" is not auto-verifiable in V1` };
}

/**
 * Evaluate a mission's package criteria. Returns the gate result and persists a
 * durable ledger entry. Does not mutate the mission — the caller decides the
 * next mission state from the gate.
 */
export function evaluateMission(mission, pkg, { nowMs, worktreePath } = {}) {
  // Evaluate in the SAME authoritative worktree the mission executed in — never
  // an inferred path. `executed_in` is what the Worker Runtime actually used.
  const cwd = worktreePath || mission.executed_in || REPO_ROOT;
  const criteria = (pkg.acceptance_criteria || []).map((c) => {
    const kinds = c.evidence_required?.length ? c.evidence_required : ["operator_review"];
    const results = kinds.map((k) => ({ kind: k, ...checkEvidence(k, { pkg, mission, cwd }) }));
    // criterion status: unmet if any unmet; met if all met; else operator_review.
    let status = "met";
    if (results.some((r) => r.status === "unmet")) status = "unmet";
    else if (results.some((r) => r.status === "operator_review")) status = "operator_review";
    return { criterion_id: c.id, statement: c.statement, status, evidence: results };
  });

  const anyUnmet = criteria.some((c) => c.status === "unmet");
  const anyReview = criteria.some((c) => c.status === "operator_review");
  const gate = anyUnmet ? "fail" : anyReview ? "needs_operator" : "pass";
  const missing_evidence = criteria.filter((c) => c.status === "unmet").map((c) => c.criterion_id);

  const result = {
    schema_version: "vacilando.acceptance.v1",
    mission_id: mission.mission_id, package_id: pkg.package_id, capability_id: pkg.capability_id,
    gate, criteria, missing_evidence,
    operator_review_required: anyReview,
    evaluated_at: new Date(nowMs ?? Date.now()).toISOString(),
  };
  try { ensureDir(); appendFileSync(LEDGER, JSON.stringify(result) + "\n", "utf8"); } catch { /* best-effort */ }
  return result;
}

/** Read acceptance evaluations for a mission (newest first). */
export function readAcceptance(mission_id) {
  try { return readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.mission_id === mission_id).reverse(); }
  catch { return []; }
}

/** Acceptance history for a capability (one entry per mission, newest first). */
export function readAcceptanceForCapability(capability_id) {
  let rows = [];
  try { rows = readFileSync(LEDGER, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { return []; }
  const latestByMission = new Map();
  for (const r of rows) if (r.capability_id === capability_id && r.mission_id) latestByMission.set(r.mission_id, r);
  return [...latestByMission.values()]
    .map((r) => ({ mission_id: r.mission_id, gate: r.gate, at: r.evaluated_at }))
    .sort((a, b) => (a.at < b.at ? 1 : -1));
}
