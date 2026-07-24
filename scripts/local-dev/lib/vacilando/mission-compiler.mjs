/**
 * Vacilando — Mission Compiler V1 (minimal).
 *
 * Deterministic ASSEMBLY only. It does not execute, does not reason
 * independently, does not retrieve in substance — it composes a complete Mission
 * Package from: the Capability object (truth), the Knowledge snapshot
 * (retrieval), the capability's accepted decisions + rejected patterns, and a
 * governance policy. It records a compiler_trace (what sources/decisions/
 * references were used) and binds the immutable knowledge_snapshot, so the
 * package is reproducible. Readiness is computed by the package store.
 *
 * V1 compiles ONE mission class: the capability's next planning mission — a
 * bounded, safe "produce the V2 implementation proposal" mission. That exercises
 * the whole slice (Capability → Knowledge → Compile → Execute → Acceptance)
 * with an objectively-checkable, source-safe deliverable.
 */
import { createPackage } from "./commands/mission-packages.mjs";

const COMPILER_VERSION = "vacilando.compiler.v1";

// Required proposal sections — Acceptance checks these headings exist.
export const PROPOSAL_SECTIONS = [
  "Current-State Analysis", "V2 Scope", "Data Model Changes",
  "Acceptance Criteria", "QA Plan", "Rollout",
];

/** The deliverable path is derived deterministically from the capability id. */
export function proposalPath(capability_id) {
  return `docs/platform/planning/vacilando-os/qa/vertical-slice-v1/${capability_id}-v2-proposal.md`;
}

/**
 * Compile a Mission Package for `capability` using `snapshot`, bound to `mission`.
 * Returns { package, trace }. The package is persisted (durable) and its
 * readiness is computed on write.
 */
export function compile({ capability, snapshot, mission, gapReport = null }) {
  const cid = capability.capability_id;
  const outPath = proposalPath(cid);
  const roadmapV2 = (capability.roadmap || []).filter((r) => /v2/i.test(r.item) || r.status === "planned");

  const trace = {
    stages: [
      { stage: "capability_retrieval", runtime: "capability", request: cid, result_ref: cid, at: new Date().toISOString() },
      { stage: "knowledge_retrieval", runtime: "knowledge", request: cid, result_ref: snapshot?.snapshot_id || null, at: new Date().toISOString() },
      ...(gapReport ? [{ stage: "gap_analysis", runtime: "gap-analysis", request: cid, result_ref: gapReport.gap_report_id, at: new Date().toISOString() }] : []),
      { stage: "compilation", runtime: "compiler", request: "assemble", result_ref: null, at: new Date().toISOString() },
    ],
    sources_used: (snapshot?.items || []).map((i) => i.uri),
    decisions_used: (capability.accepted_decisions || []).map((d) => d.id),
    references_used: (capability.documentation_index || []).map((d) => d.uri),
    // Now honestly populated when gap analysis has run upstream.
    reasoning_invocations: gapReport
      ? [{ runtime: "gap-analysis", analyzer: gapReport.analyzer_version, report_ref: gapReport.gap_report_id, confidence: gapReport.confidence }]
      : [],
  };

  const criteria = [
    { id: "AC1", type: "artifact", statement: `The V2 proposal exists at ${outPath}.`, evidence_required: ["file_exists"] },
    { id: "AC2", type: "completeness", statement: `The proposal contains all required sections: ${PROPOSAL_SECTIONS.join(", ")}.`, evidence_required: ["sections_present"] },
    { id: "AC3", type: "governance", statement: "No source code was changed — only the proposal document under the docs path.", evidence_required: ["git_clean_outside_docs"] },
    { id: "AC4", type: "product-fidelity", statement: `The proposal respects the capability's rejected patterns (${(capability.rejected_patterns || []).map((r) => r.id).join(", ") || "none"}).`, evidence_required: ["rejected_patterns_not_reintroduced"] },
  ];

  const input = {
    mission_id: mission.mission_id, project_id: capability.project_id, capability_id: cid,
    worker_slot: mission.worker_slot,
    title: `${capability.name} V2 — Implementation Proposal`,
    objective:
      `Analyze the current ${capability.name} implementation (${(capability.current_implementation?.code_paths || []).join(", ")}) ` +
      `and produce the ${capability.name} V2 implementation proposal covering the roadmap items ` +
      `[${roadmapV2.map((r) => r.item).join("; ")}]. Write the proposal to ${outPath}. ` +
      `Do NOT modify any source code — this is a planning proposal only.`,
    scope_included: [
      `Analyze the current ${capability.name} implementation and product decisions.`,
      `Produce a written V2 implementation proposal at ${outPath}.`,
      `Cover each planned V2 roadmap item.`,
    ],
    scope_excluded: [
      "Any source code changes (this mission produces a proposal only).",
      "Implementing V2 itself.",
      "Any push, merge, or promotion.",
    ],
    relevant_documents: (snapshot?.items || []).filter((i) => i.kind !== "code").map((i) => ({ uri: i.uri, title: i.title, why_relevant: i.why_relevant })),
    approved_references: (snapshot?.items || []).filter((i) => i.kind === "code").map((i) => ({ type: "code", uri: i.uri, note: "current implementation" })),
    inherited_product_rules: (capability.accepted_decisions || []).map((d) => ({ id: d.id, scope: "capability", rule: d.statement, provenance: d.ref })),
    accepted_decisions: capability.accepted_decisions || [],
    rejected_patterns: capability.rejected_patterns || [],
    acceptance_criteria: criteria,
    required_evidence: [
      { id: "EV1", kind: "file", description: `proposal file at ${outPath}`, criterion_ids: ["AC1", "AC2"] },
      { id: "EV2", kind: "log", description: "git status showing only the docs path changed", criterion_ids: ["AC3"] },
    ],
    unresolved_questions: [],
    operator_decision_gates: [], // mature capability → no in-package gates → package can be ready; the operator approval is the pipeline gate.
    governance_constraints: { no_push: true, no_merge: true, no_promote: true, no_scope_broadening: true, ask_before_consequential: true, loopback_only: true },
    QA_plan: [
      { id: "QA1", step: `Confirm ${outPath} exists and is non-empty.`, verifies: ["AC1"] },
      { id: "QA2", step: `Confirm all required sections are present.`, verifies: ["AC2"] },
      { id: "QA3", step: "Confirm git status shows no source changes outside the docs path.", verifies: ["AC3"] },
    ],
    expected_deliverables: [
      { id: "D1", kind: "document", description: `${capability.name} V2 implementation proposal`, path: outPath, criterion_ids: ["AC1", "AC2"] },
    ],
    // Upstream artifacts embedded for reproducibility + operator review.
    gap_report: gapReport || null,
    product_definition_snapshot: capability.product_definition || null,
    suggested_acceptance_criteria: gapReport?.findings?.suggested_acceptance_criteria || [],
    // Risks + questions are populated FROM the gap report — an incomplete package
    // always explains itself.
    risks: [
      ...(gapReport?.findings?.conflicts || []).map((c) => ({ id: `r_${c.id}`, risk: c.detail, from: `gap:${c.id}`, severity: c.severity })),
      ...(gapReport?.findings?.missing_files || []).map((f, i) => ({ id: `r_mf_${i}`, risk: `Missing reference: ${f.uri}`, from: "gap:missing_files", severity: "warn" })),
    ],
    questions: (gapReport?.findings?.unknowns || []).map((u) => ({ id: u.id, question: u.question, blocking: u.blocking === true, from: "gap:unknowns" })),
    compiler_version: COMPILER_VERSION,
    compiler_trace: trace,
    knowledge_snapshot: snapshot || null,
  };

  const pkg = createPackage(input, { origin: "compiled" });
  return { package: pkg, trace };
}

export { COMPILER_VERSION };
