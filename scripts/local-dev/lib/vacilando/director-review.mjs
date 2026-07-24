/**
 * Vacilando — Director Review (six-state readiness verdict).
 *
 * Director is the deterministic conductor: it does not reason, it ROLLS UP the
 * Gap Report + package validation into one operator-facing verdict and names
 * exactly which upstream stage to feed. The worker never receives an incomplete
 * package without the operator knowing why.
 *
 * Verdicts (precedence high → low):
 *   Needs Decisions > Needs Architecture > Needs References > Needs Acceptance >
 *   Needs Review > Ready
 *
 * Only BLOCKING signals push a package off "Ready":
 *   - a block-severity missing_information finding,
 *   - a blocking question,
 *   - package validation that is not `ready` (blocked / awaiting_operator).
 * Non-blocking unknowns and suggested criteria are surfaced as advisory reasons —
 * they inform the operator without falsely blocking a ready package.
 */

const PRECEDENCE = ["Needs Product Decisions", "Needs References", "Needs Acceptance Criteria", "Needs Clarification", "Needs Review"];

// Which runtime the operator should feed to resolve each verdict.
const SEND_BACK = {
  "Needs Product Decisions": "product-definition",
  "Needs References": "knowledge",
  "Needs Acceptance Criteria": "acceptance",
  "Needs Clarification": "operator",
  "Needs Review": "operator",
  Ready: null,
};

// Operator language — every blocker answers Why? / What should I do? / Where do I go?
const GUIDANCE = {
  "Needs Product Decisions": { why: "Director doesn't yet have the product decisions this work depends on.", what: "Record the decisions, goals, or constraints that shape this capability.", where_label: "Open Product Definition" },
  "Needs References": { why: "A document or file this mission points at can't be found.", what: "Repoint or remove the missing references.", where_label: "Open Knowledge" },
  "Needs Acceptance Criteria": { why: "Some of the work isn't yet covered by a way to check it's done.", what: "Adopt or adjust the suggested acceptance criteria.", where_label: "Open Acceptance" },
  "Needs Clarification": { why: "Director found open questions it can't answer on its own.", what: "Answer the open questions so Director can finish preparing.", where_label: "Answer Questions" },
  "Needs Review": { why: "Something needs your judgment before this is ready.", what: "Review the flagged items and confirm.", where_label: "Review" },
  Ready: { why: "Everything Director needs is in place.", what: "Approve the package and send it to the worker.", where_label: null },
};

/** Map a package-validation block finding to a verdict bucket. */
function verdictForValidationCode(code) {
  if (code === "acceptance_criteria_missing" || code === "qa_plan_missing") return "Needs Acceptance Criteria";
  if (code === "governance_missing") return "Needs Review";
  return "Needs Review"; // objective/scope/deliverable gaps → human review
}

/**
 * Derive the verdict. `gapReport` from Gap Analysis; `pkg` the compiled package
 * (for its computed readiness_status + validation findings).
 * Returns { verdict, status, send_back_to, reasons[], advisory[] }.
 */
export function deriveVerdict(gapReport, pkg) {
  const f = gapReport?.findings || {};
  const blocking = new Map();   // verdict → [reasons]
  const advisory = [];
  const push = (verdict, reason) => { if (!blocking.has(verdict)) blocking.set(verdict, []); blocking.get(verdict).push(reason); };

  // 1. blocking gap findings
  for (const m of f.missing_information || []) {
    if (m.severity === "block") push(m.feeds_verdict || "Needs Review", m.what);
    else advisory.push(m.what);
  }
  // 2. blocking questions → Needs Review; non-blocking → advisory
  for (const q of f.unknowns || []) {
    if (q.blocking === true) push(q.feeds_verdict || "Needs Review", q.question);
    else advisory.push(q.question);
  }
  // 3. conflicts always warrant human review
  for (const c of f.conflicts || []) push(c.feeds_verdict || "Needs Review", c.detail);
  // 4. missing files → Needs References
  for (const mf of f.missing_files || []) push("Needs References", `Missing reference: ${mf.uri}`);
  // 5. suggested criteria are advisory (the compiler authors executable criteria)
  for (const s of f.suggested_acceptance_criteria || []) advisory.push(`Suggested criterion: ${s.statement}`);

  // 6. package validation blocks (independent of gaps)
  if (pkg && pkg.readiness_status !== "ready" && pkg.readiness_status !== "superseded") {
    for (const finding of (pkg.readiness_findings || []).filter((x) => x.severity === "block")) {
      push(verdictForValidationCode(finding.code), finding.message);
    }
    if (pkg.readiness_status === "awaiting_operator") push("Needs Review", "Package awaits an operator decision (open gate or blocking question).");
  }

  let verdict = "Ready";
  for (const v of PRECEDENCE) if (blocking.has(v)) { verdict = v; break; }
  const reasons = verdict === "Ready" ? [] : blocking.get(verdict) || [];
  const g = GUIDANCE[verdict] || {};

  return {
    verdict,
    status: verdict === "Ready" ? "ready" : "awaiting_operator",
    send_back_to: SEND_BACK[verdict] ?? null,
    why: g.why || null,
    what_to_do: g.what || null,
    where_label: g.where_label || null,
    reasons,
    advisory,
    confidence: gapReport?.confidence ?? null,
    all_blocking: Object.fromEntries([...blocking.entries()]),
  };
}

export { PRECEDENCE, SEND_BACK, GUIDANCE };
