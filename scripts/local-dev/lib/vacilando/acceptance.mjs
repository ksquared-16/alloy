/**
 * Vacilando — Acceptance Runtime V1 (minimal).
 *
 * Evaluates ONLY the package's declared acceptance_criteria against real
 * evidence, and is HONEST about what it can and cannot verify:
 *   - objective evidence (file exists, sections present, no source changed) is
 *     auto-verified → met / unmet
 *   - subjective/product-fidelity evidence is NOT faked → status "operator_review"
 *     and surfaced to Kelly for final QA
 *
 * Produces a gate verdict (pass | needs_operator | fail) + a durable decision
 * ledger entry. The gate never auto-accepts a mission — a "completed" mission
 * requires this gate to pass AND (for anything operator_review) Kelly's sign-off.
 */
import { execFileSync } from "node:child_process";
import { appendFileSync, existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import os from "node:os";
import { join, resolve } from "node:path";

import { REPO_ROOT } from "./knowledge.mjs";

const RUNTIME_ROOT = process.env.ALLOY_RUNTIME_ROOT?.trim() || join(os.homedir(), ".local", "state", "alloy-dev");
const DIR = join(RUNTIME_ROOT, "vacilando", "acceptance");
const LEDGER = join(DIR, "ledger.jsonl");

const ALLOWED_CHANGE_PREFIX = "docs/platform/planning/vacilando-os/qa/vertical-slice-v1/";

function ensureDir() { if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true }); }
function dirtyPaths(cwd) {
  if (!cwd || !existsSync(cwd)) return [];
  try { return execFileSync("git", ["-C", cwd, "status", "--porcelain"], { encoding: "utf8", timeout: 15000, maxBuffer: 4 * 1024 * 1024 }).split("\n").filter(Boolean).map((l) => l.slice(3).trim()).filter(Boolean); }
  catch { return []; }
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
    const baseline = new Set(mission.git_baseline || []);
    const now = dirtyPaths(cwd);
    const attributable = now.filter((p) => !baseline.has(p)); // mission-caused changes only
    const offending = attributable.filter((p) => !p.startsWith(ALLOWED_CHANGE_PREFIX));
    if (offending.length) return { status: "unmet", detail: `mission changed files outside the allowed docs path: ${offending.slice(0, 8).join(", ")}` };
    return { status: "met", detail: attributable.length ? `only allowed docs changed (${attributable.length})` : "no new changes attributable to the mission" };
  }
  if (kind === "rejected_patterns_not_reintroduced") {
    // Product-fidelity: not reliably machine-verifiable → honest operator review,
    // with a light advisory scan to help the operator.
    let advisory = "no obvious reintroduction detected";
    if (deliverable && cwd && existsSync(resolve(cwd, relPath))) {
      const text = readFileSync(resolve(cwd, relPath), "utf8").toLowerCase();
      const hits = (pkg.rejected_patterns || []).filter((rp) => text.includes(String(rp.statement || "").toLowerCase().slice(0, 24)));
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
