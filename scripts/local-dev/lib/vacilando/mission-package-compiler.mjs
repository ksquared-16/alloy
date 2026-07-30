/**
 * Vacilando — Mission Package Compiler (legacy capability path).
 *
 * Assembles Mission Packages from Capability + Knowledge for the legacy
 * Director compile pipeline. Brief → Compiled Mission lives in
 * `mission-compiler.mjs` (product Mission Compiler V1).
 */
import { createPackage, revisePackage } from "./commands/mission-packages.mjs";

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

// Operator-directed missions write their outputs under a mission-scoped docs path,
// distinct from the generic proposal path — so producing the generic proposal can
// never satisfy an operator-directed mission's deliverable.
function missionOutputPath(capability, mission) {
  const slug = capability.slug || capability.capability_id;
  const short = String(mission.mission_id || "msn_x").replace(/^msn_/, "").slice(0, 10);
  return `docs/platform/planning/vacilando-os/qa/missions/${slug}-${short}.md`;
}

/**
 * Is this an operator-DIRECTED mission — i.e., the operator gave a substantial
 * direction — versus the default templated proposal mission? Authority: a real
 * operator direction outranks the generic capability template.
 */
export function isOperatorDirected(mission, capability) {
  const intent = String(mission?.intent || "").trim();
  if (!intent) return false;
  const name = String(capability?.name || "").trim();
  const residue = intent
    .replace(new RegExp(name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), "")
    .replace(/\bv\d+\b/ig, "").replace(/[—\-:]/g, " ").replace(/\s+/g, " ").trim();
  // Substantial = more than a short label of direction (a sentence or a spec),
  // not merely "<Capability> V2".
  return residue.split(/\s+/).filter(Boolean).length >= 6 || intent.length >= 90;
}

const firstLine = (s) => String(s || "").split(/[\n.]/)[0].trim().slice(0, 160);

/** Explicit negative-scope the operator stated ("do not …", "avoid …", "must not …"). */
function deriveExclusions(intent) {
  const out = [];
  const re = /\b(?:do not|don't|do n't|avoid|must not|never|explicitly avoid|not to)\b[^.;\n]{3,140}/ig;
  let m; while ((m = re.exec(String(intent || "")))) out.push(m[0].replace(/\s+/g, " ").trim().replace(/^./, (c) => c.toUpperCase()));
  return [...new Set(out)].slice(0, 6);
}

/**
 * Compile a Mission Package for `capability` using `snapshot`, bound to `mission`.
 * Returns { package, trace }. The package is persisted (durable) and its
 * readiness is computed on write.
 */
export function compile({ capability, snapshot, mission, gapReport = null, reviseOf = null }) {
  const cid = capability.capability_id;
  // Use the human-readable slug in the deliverable path — never the raw cap_ id.
  const outPath = proposalPath(capability.slug || cid);
  const roadmapV2 = (capability.roadmap || []).filter((r) => /v2/i.test(r.item) || r.status === "planned");
  const codePaths = (capability.current_implementation?.code_paths || []).join(", ");
  const roadmapStr = roadmapV2.map((r) => r.item).join("; ");

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

  // ---- IMPLEMENT MODE: a conductor phase mission that actually BUILDS — code +
  // tests + browser QA — following the already-accepted plan as its spec. This is
  // the "implementation" step of audit → recommendations → plan → implementation.
  // Autonomy operating rules come from WORKER_POLICY (turn protocol). Logins use the
  // worker's stored session — no operator action. Source changes are the POINT here
  // (unlike the proposal), but push/merge/promote stay forbidden. ----
  if (/—\s*implement:/i.test(String(mission.intent || ""))) {
    const phaseTitle = String(mission.intent).split(/—\s*implement:/i)[1]?.trim() || String(mission.intent);
    const qaDir = `docs/platform/planning/vacilando-os/qa/${capability.slug || cid}-v2/`;
    const clarBlock2 = (mission.clarifications || []).map((c) => c.answer).filter(Boolean);
    const clarStr = clarBlock2.length ? `\n\n[OPERATOR CLARIFICATIONS]\n${clarBlock2.map((a) => `- ${a}`).join("\n")}` : "";
    const input = {
      mission_id: mission.mission_id, project_id: capability.project_id, capability_id: cid, worker_slot: mission.worker_slot,
      title: `${capability.name} V2 — implement: ${phaseTitle}`, operator_directed: false, implement_phase: phaseTitle,
      objective: `Implement "${phaseTitle}" for ${capability.name} V2, following the accepted plan at ${outPath}. Change application source as the plan requires, add/adjust tests, and VALIDATE via the host broker only: \`vac run typecheck|typecheck:tests|build|test\` or \`cd web && npm run typecheck|build|test\` (brokered scripts). NEVER \`npx tsc\`, \`npm exec tsc\`, \`node …/typescript/bin/tsc\`, or raw \`next build\` — Vacilando refuses/kills unbrokered heavy checks. Focused Vitest files may run directly (\`npx vitest run <file>\`). Perform browser QA — log in via the worker's stored session (no operator needed) and capture screenshots as evidence under ${qaDir}. Bash allowlist is vac/alloy/npm-run/vitest/playwright only — do not claim a command-approval wall for brokered validation. If this phase introduces a supabase migration, you MUST either apply it (when authorized for the target DB) or account for it in the vacilando-report migrations[] with status awaiting_authorization — never silently skip it. For target shared/live/staging/production: BEFORE asking the operator to authorize apply, run read-only preflight on that DB (catalog/orphan-grant/FK/dependency checks appropriate to the SQL), harden the migration if anything is unsafe, write evidence under ${qaDir}, and set migrations[].preflight={ok:true, summary, evidence_path}. Do not present bare awaiting_authorization for shared without preflight. Honor every inherited product rule and rejected pattern. If a step needs a NEW product decision the plan did not settle, STOP and ask the operator rather than guess.${clarStr}`,
      scope_included: [
        `Implement the "${phaseTitle}" requirements from the accepted plan (${outPath}).`,
        "Modify application source and add/adjust tests as the plan requires.",
        "Run the relevant tests and perform browser QA (login via stored session), capturing screenshots as evidence.",
        "Heavy validation only via vac run / brokered npm run scripts — never raw tsc or next build.",
        "Account for any schema migrations this phase introduces (apply when authorized, or report awaiting_authorization).",
        "For shared/live migrations: run read-only apply preflight, harden until safe, attach migrations[].preflight before operator authorization.",
      ],
      scope_excluded: [
        "Work beyond this phase — later phases run as their own missions.",
        "Any product decision the plan did not settle — pause and ask the operator instead.",
        "Any push, merge, or promotion.",
        "Applying a migration to a shared/live database without explicit operator authorization.",
        "Asking the operator to authorize a shared/live migration without documented preflight{ok:true}.",
        "Raw npx tsc / npm exec tsc / node …/tsc / next build (bypasses host validation lease).",
      ],
      relevant_documents: [{ uri: outPath, title: `${capability.name} V2 plan`, why_relevant: "the accepted plan this phase implements" }, ...(snapshot?.items || []).filter((i) => i.kind !== "code").map((i) => ({ uri: i.uri, title: i.title, why_relevant: i.why_relevant }))],
      approved_references: (snapshot?.items || []).filter((i) => i.kind === "code").map((i) => ({ type: "code", uri: i.uri, note: "current implementation" })),
      inherited_product_rules: (capability.accepted_decisions || []).map((d) => ({ id: d.id, scope: "capability", rule: d.statement, provenance: d.ref })),
      accepted_decisions: capability.accepted_decisions || [],
      rejected_patterns: capability.rejected_patterns || [],
      acceptance_criteria: [
        { id: "AC1", type: "implementation", statement: `The "${phaseTitle}" requirements from the plan are implemented in application source.`, evidence_required: ["source_changed"] },
        { id: "AC2", type: "validation", statement: "The relevant tests were run and pass.", evidence_required: ["tests_pass"] },
        { id: "AC3", type: "qa", statement: `Browser QA was performed and screenshots captured under ${qaDir}.`, evidence_required: ["qa_evidence"] },
        { id: "AC4", type: "product-fidelity", statement: `No rejected pattern reintroduced (${(capability.rejected_patterns || []).map((r) => r.id).join(", ") || "none"}); no push/merge/promote.`, evidence_required: ["rejected_patterns_not_reintroduced"] },
        { id: "AC5", type: "migration", statement: "Any schema migrations this phase introduced are applied or explicitly accounted for (status + target) — never silently skipped. Shared/live awaiting_authorization requires preflight{ok:true}.", evidence_required: ["migration_accounted"] },
      ],
      required_evidence: [
        { id: "EV1", kind: "log", description: "git diff of the implemented source changes", criterion_ids: ["AC1"] },
        { id: "EV2", kind: "log", description: "test run results (pass)", criterion_ids: ["AC2"] },
        { id: "EV3", kind: "file", description: `QA screenshots under ${qaDir}`, criterion_ids: ["AC3"] },
        { id: "EV4", kind: "log", description: "migrations[] in vacilando-report accounting for every new migration file (shared: include preflight)", criterion_ids: ["AC5"] },
      ],
      unresolved_questions: [], operator_decision_gates: [],
      governance_constraints: { no_push: true, no_merge: true, no_promote: true, no_scope_broadening: true, ask_before_consequential: true, loopback_only: true },
      QA_plan: [
        { id: "QA1", step: "Run the tests relevant to this phase; confirm they pass.", verifies: ["AC2"] },
        { id: "QA2", step: "Perform browser QA (login via stored session); capture screenshots.", verifies: ["AC3"] },
        { id: "QA3", step: "Confirm git diff shows the intended source changes and no rejected pattern.", verifies: ["AC1", "AC4"] },
        { id: "QA4", step: "Account for migrations: apply when authorized, or report awaiting_authorization with path + target. For shared/live: run read-only preflight, harden if needed, set preflight{ok:true, evidence_path}.", verifies: ["AC5"] },
      ],
      expected_deliverables: [
        { id: "D1", kind: "code", description: `Implementation of "${phaseTitle}"`, path: null, criterion_ids: ["AC1"] },
        { id: "D2", kind: "evidence", description: "Test results + QA screenshots", path: qaDir, criterion_ids: ["AC2", "AC3"] },
      ],
      gap_report: gapReport || null, product_definition_snapshot: capability.product_definition || null,
      suggested_acceptance_criteria: [], risks: [], questions: [],
      compiler_version: COMPILER_VERSION, compiler_trace: trace, knowledge_snapshot: snapshot || null,
    };
    const pkg = reviseOf ? revisePackage(reviseOf, input) : createPackage(input, { origin: "compiled" });
    return { package: pkg, trace };
  }

  // ---- AUTHORITY: a substantial operator direction is the mission; the generic
  // template is only the fallback when the operator gave no direction. ----
  const directed = isOperatorDirected(mission, capability);
  const opPath = directed ? missionOutputPath(capability, mission) : null;

  const criteria = directed ? [
    { id: "AC1", type: "artifact", statement: `The mission's requested outputs exist at ${opPath}.`, evidence_required: ["file_exists"] },
    // The load-bearing integrity criterion: the deliverables must satisfy the
    // APPROVED objective, not a generic substitute. Not machine-decidable → it
    // is an explicit operator confirmation, so a mission can never auto-pass by
    // producing an unrelated artifact.
    { id: "ACF", type: "intent-fidelity", statement: `The deliverables satisfy the objective the operator approved: “${firstLine(mission.intent)}” — not a generic substitute.`, evidence_required: ["intent_fidelity"] },
    { id: "AC3", type: "governance", statement: "No application source code was changed — the mission's outputs live under its docs path.", evidence_required: ["git_clean_outside_docs"] },
  ] : [
    { id: "AC1", type: "artifact", statement: `The V2 proposal exists at ${outPath}.`, evidence_required: ["file_exists"] },
    { id: "AC2", type: "completeness", statement: `The proposal contains all required sections: ${PROPOSAL_SECTIONS.join(", ")}.`, evidence_required: ["sections_present"] },
    { id: "AC3", type: "governance", statement: "No source code was changed — only the proposal document under the docs path.", evidence_required: ["git_clean_outside_docs"] },
    { id: "AC4", type: "product-fidelity", statement: `The proposal respects the capability's rejected patterns (${(capability.rejected_patterns || []).map((r) => r.id).join(", ") || "none"}).`, evidence_required: ["rejected_patterns_not_reintroduced"] },
  ];

  // Operator clarifications (answers given in the Understanding stage) are carried
  // into the objective so the worker executes with the operator's answers in hand.
  const clarifications = (mission.clarifications || []).map((c) => c.answer).filter(Boolean);
  const clarBlock = clarifications.length ? `\n\n[OPERATOR CLARIFICATIONS]\n${clarifications.map((a) => `- ${a}`).join("\n")}` : "";

  const objective = (directed
    ? `${String(mission.intent).trim()}\n\n[EXECUTION NOTES] Write the outputs this objective requires to ${opPath}. Governance: do not push, merge, or promote; do not modify application source code unless the objective explicitly requires it.`
    : `Analyze the current ${capability.name} implementation${codePaths ? ` (${codePaths})` : ""} ` +
      `and produce the ${capability.name} V2 implementation proposal${roadmapStr ? ` covering the roadmap items [${roadmapStr}]` : ""}. ` +
      `Write the proposal to ${outPath}. Do NOT modify any source code — this is a planning proposal only. ` +
      `Also, in your vacilando-report, include an "implementation_phases" array — the ORDERED list of short implementation-phase titles this plan defines (e.g. ["Phase 0 — role-catalog integrity", "Phase 1 — audit trail", …]) — so Director can conduct them as the implementation steps.`) + clarBlock;

  const scope_included = directed ? [
    "Perform the work described in the objective, in full.",
    `Write the resulting outputs to ${opPath}.`,
  ] : [
    `Analyze the current ${capability.name} implementation and product decisions.`,
    `Produce a written V2 implementation proposal at ${outPath}.`,
    `Cover each planned V2 roadmap item.`,
  ];

  const scope_excluded = directed ? [
    ...deriveExclusions(mission.intent),
    "Substituting a generic proposal for the objective above.",
    "Any push, merge, or promotion.",
    "Broadening scope beyond the stated objective.",
  ] : [
    "Any source code changes (this mission produces a proposal only).",
    "Implementing V2 itself.",
    "Any push, merge, or promotion.",
  ];

  const deliverablePath = directed ? opPath : outPath;

  const input = {
    mission_id: mission.mission_id, project_id: capability.project_id, capability_id: cid,
    worker_slot: mission.worker_slot,
    title: directed ? `${capability.name} — ${firstLine(mission.intent) || "operator-directed mission"}` : `${capability.name} V2 — Implementation Proposal`,
    // The mission is operator-directed when the operator gave a substantial
    // direction; this flag drives proposal presentation + verification integrity.
    operator_directed: directed,
    objective,
    scope_included,
    scope_excluded,
    relevant_documents: (snapshot?.items || []).filter((i) => i.kind !== "code").map((i) => ({ uri: i.uri, title: i.title, why_relevant: i.why_relevant })),
    approved_references: (snapshot?.items || []).filter((i) => i.kind === "code").map((i) => ({ type: "code", uri: i.uri, note: "current implementation" })),
    inherited_product_rules: (capability.accepted_decisions || []).map((d) => ({ id: d.id, scope: "capability", rule: d.statement, provenance: d.ref })),
    accepted_decisions: capability.accepted_decisions || [],
    rejected_patterns: capability.rejected_patterns || [],
    acceptance_criteria: criteria,
    required_evidence: directed ? [
      { id: "EV1", kind: "file", description: `mission outputs at ${deliverablePath}`, criterion_ids: ["AC1"] },
      { id: "EV2", kind: "operator", description: "operator confirms the outputs satisfy the approved objective", criterion_ids: ["ACF"] },
    ] : [
      { id: "EV1", kind: "file", description: `proposal file at ${outPath}`, criterion_ids: ["AC1", "AC2"] },
      { id: "EV2", kind: "log", description: "git status showing only the docs path changed", criterion_ids: ["AC3"] },
    ],
    unresolved_questions: [],
    operator_decision_gates: [], // mature capability → no in-package gates → package can be ready; the operator approval is the pipeline gate.
    governance_constraints: { no_push: true, no_merge: true, no_promote: true, no_scope_broadening: true, ask_before_consequential: true, loopback_only: true },
    QA_plan: directed ? [
      { id: "QA1", step: `Confirm ${deliverablePath} exists and is non-empty.`, verifies: ["AC1"] },
      { id: "QA2", step: "Confirm the outputs address the approved objective (operator judgment).", verifies: ["ACF"] },
      { id: "QA3", step: "Confirm git status shows no application source changes.", verifies: ["AC3"] },
    ] : [
      { id: "QA1", step: `Confirm ${outPath} exists and is non-empty.`, verifies: ["AC1"] },
      { id: "QA2", step: `Confirm all required sections are present.`, verifies: ["AC2"] },
      { id: "QA3", step: "Confirm git status shows no source changes outside the docs path.", verifies: ["AC3"] },
    ],
    expected_deliverables: directed ? [
      { id: "D1", kind: "document", description: "The outputs the approved objective requires", path: deliverablePath, criterion_ids: ["AC1", "ACF"] },
    ] : [
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

  // Recompilation revises the prior package into a new version (with a diff);
  // a first compile creates v1.
  const pkg = reviseOf ? revisePackage(reviseOf, input) : createPackage(input, { origin: "compiled" });
  return { package: pkg, trace };
}

export { COMPILER_VERSION };
