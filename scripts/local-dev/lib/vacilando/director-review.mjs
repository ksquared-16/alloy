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

const PRECEDENCE = ["Needs Decisions", "Needs Architecture", "Needs References", "Needs Acceptance", "Needs Review"];

// Which runtime the operator should feed to resolve each verdict.
const SEND_BACK = {
  "Needs Decisions": "product-definition",
  "Needs Architecture": "product-definition",
  "Needs References": "knowledge",
  "Needs Acceptance": "acceptance",
  "Needs Review": "operator",
  Ready: null,
};

/** Map a package-validation block finding to a verdict bucket. */
function verdictForValidationCode(code) {
  if (code === "acceptance_criteria_missing" || code === "qa_plan_missing") return "Needs Acceptance";
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

  return {
    verdict,
    status: verdict === "Ready" ? "ready" : "awaiting_operator",
    send_back_to: SEND_BACK[verdict] ?? null,
    reasons,
    advisory,
    confidence: gapReport?.confidence ?? null,
    all_blocking: Object.fromEntries([...blocking.entries()]),
  };
}

export { PRECEDENCE, SEND_BACK };
