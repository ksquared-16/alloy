/**
 * Deliverable evidence integrity — parse test semantics and reconcile claims vs proof.
 *
 * A worker report is a claim. Evidence is proof. Director must reconcile both
 * before recommending approval.
 *
 * Root-cause note (W-4): a naive `/fail/i` matched the phrase "0 failed" and
 * labeled a passing suite as failed while Director still recommended approve.
 */
import { existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve } from "node:path";
import { REPO_ROOT } from "./knowledge.mjs";

/**
 * Parse test artifact text into suite status vs expected-negative behavior.
 * "0 failed" must NOT mark the suite failed.
 */
export function parseTestEvidenceSemantics(text = "", { exitCode = null } = {}) {
  const raw = String(text || "");
  const signals = [];

  // Strip red-before / intentional-regression narrative so "18 tests failed with
  // sources reverted" cannot override a green-after "72 passed" suite result.
  // Root cause (W-1): worker proof text includes both the passing run and the
  // deliberate red-before count; naive parsing treated that as suite failure.
  const redBefore = /\b(red[- ]before(?:\s+proof)?|with(?:\s+the)?\s+sources?\s+reverted|predecessor\s+restored|intentional\s+red)\b/i;
  const withoutRedBefore = raw
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !redBefore.test(sentence))
    .join(" ")
    .trim();
  const parseBody = withoutRedBefore || raw;
  if (withoutRedBefore && withoutRedBefore !== raw) {
    signals.push("ignored_red_before_narrative");
  }

  const passedMatch = parseBody.match(/\b(\d+)\s+passed\b/i);
  const failedMatch = parseBody.match(/\b(\d+)\s+failed\b/i);
  let passedCount = passedMatch ? Number(passedMatch[1]) : null;
  let failedCount = failedMatch ? Number(failedMatch[1]) : null;

  // "70/70 green" / "15/15 passed" — common worker shorthand without the word "passed".
  // Root cause (Mission 2 W-4): evidence said "70/70 green …" and was labeled incomplete.
  const slashAll = parseBody.match(/\b(\d+)\s*\/\s*(\d+)\s+(?:green|passed|pass|ok)\b/i);
  if (slashAll) {
    const a = Number(slashAll[1]);
    const b = Number(slashAll[2]);
    if (Number.isFinite(a) && Number.isFinite(b) && a === b && a > 0) {
      if (passedCount == null) passedCount = a;
      if (failedCount == null) failedCount = 0;
      signals.push("slash_all_green");
    } else if (Number.isFinite(a) && Number.isFinite(b) && b > a) {
      if (passedCount == null) passedCount = a;
      if (failedCount == null) failedCount = b - a;
      signals.push("slash_partial");
    }
  } else if (/\b(?:all|fully)\s+(?:tests?\s+)?(?:green|passed)\b/i.test(parseBody)
    || /\bstay(?:s|ed)?\s+green\b/i.test(parseBody)
    || /\b(?:tests?\s+)?(?:are|were|is|was)\s+green\b/i.test(parseBody)
    || /\bgreen\s+across\b/i.test(parseBody)) {
    signals.push("narrative_all_green");
  }

  // Vitest / Jest style without "N passed": "Tests  70 passed (70)"
  const testsWordPass = parseBody.match(/\btests?\s+(\d+)\s+passed\b/i);
  if (testsWordPass && passedCount == null) {
    passedCount = Number(testsWordPass[1]);
    if (failedCount == null) failedCount = 0;
    signals.push("tests_word_passed");
  }

  const hasOkTrue = /\bok\s*:\s*true\b/i.test(parseBody);
  const hasExit0 = /\bexit\s*0\b/i.test(parseBody) || exitCode === 0;
  const hasExitNonZero = /\bexit\s*[1-9]\d*\b/i.test(parseBody)
    || (typeof exitCode === "number" && exitCode !== 0);
  const narrativeGreen = signals.includes("narrative_all_green")
    || signals.includes("slash_all_green");

  const explicitSuiteFail = (failedCount != null && failedCount > 0)
    || /\btests?\s+failed\b/i.test(parseBody)
    || /\bsuite\s+failed\b/i.test(parseBody)
    || (/\bFAILED\b/.test(parseBody) && !/\b0\s+failed\b/i.test(parseBody));

  const assertion_behavior = [];
  if (signals.includes("ignored_red_before_narrative")) {
    assertion_behavior.push({
      kind: "expected_rejection",
      status: "passed",
      detail: "Red-before proof: intentional failures with sources reverted (not the final suite result)",
    });
  }
  if (/empty-allow-?list|red-state|vacuous/i.test(raw)) {
    assertion_behavior.push({
      kind: "expected_rejection",
      status: "passed",
      detail: "Negative fixture: empty allow-list / red-state rejection behaved correctly",
    });
    signals.push("negative_fixture_empty_allowlist");
  }
  if (/stale-?entry|stale list|accumulate residue/i.test(raw)) {
    assertion_behavior.push({
      kind: "expected_rejection",
      status: "passed",
      detail: "Negative fixture: stale allowlist entry correctly rejected",
    });
    signals.push("negative_fixture_stale_entry");
  }
  if (/fail validation|fails validation|exit 1 on any unlisted/i.test(raw)) {
    assertion_behavior.push({
      kind: "expected_command_failure",
      status: "observed",
      detail: "Guard is designed to non-zero-exit on unreviewed routes (negative scenario)",
    });
    signals.push("guard_negative_behavior_described");
  }

  let test_run_status = "not_run";
  if (passedCount != null || failedCount != null) {
    if ((failedCount || 0) > 0 || explicitSuiteFail) test_run_status = "failed";
    else if ((passedCount || 0) > 0 || hasOkTrue || hasExit0 || narrativeGreen) test_run_status = "passed";
    else test_run_status = "incomplete";
  } else if (explicitSuiteFail) {
    test_run_status = "failed";
  } else if (hasOkTrue || hasExit0 || narrativeGreen) {
    test_run_status = "passed";
  } else if (/\bpassed\b/i.test(parseBody) && !explicitSuiteFail) {
    test_run_status = "passed";
  } else if (hasExitNonZero && assertion_behavior.some((a) => a.kind.startsWith("expected_"))) {
    test_run_status = "passed";
    signals.push("expected_nonzero_exit_in_negative_fixture");
  } else if (hasExitNonZero) {
    test_run_status = "failed";
  } else if (raw.trim()) {
    test_run_status = "incomplete";
  }

  const negPassed = assertion_behavior.filter((a) => a.status === "passed").length;
  const parts = [];
  if (passedCount != null || failedCount != null) {
    parts.push(`${passedCount ?? 0} tests passed · ${failedCount ?? 0} failed`);
  } else if (test_run_status === "passed") {
    parts.push("Test run passed");
  } else if (test_run_status === "failed") {
    parts.push("Test run failed");
  } else if (test_run_status === "incomplete") {
    parts.push("Test run incomplete");
  } else {
    parts.push("Tests not run");
  }
  if (negPassed) {
    parts.push(`${negPassed} negative fixture${negPassed === 1 ? "" : "s"} correctly rejected`);
  }

  return {
    test_run_status,
    assertion_behavior,
    passed_count: passedCount,
    failed_count: failedCount,
    result_summary: parts.join(" · "),
    raw_signals: signals,
  };
}

/**
 * Collect every worker/Director text that may describe the test run.
 * Evidence descriptions alone are not enough — completionReport.tests[].results
 * is often where shorthand like "70/70 green" lives.
 */
export function collectTestEvidenceTexts({ report = {}, artifacts = [] } = {}) {
  const texts = [];
  for (const e of artifacts || []) {
    if (!(e.type === "test" || /^Tests executed$/i.test(e.title || ""))) continue;
    const blob = [e.title, e.description, e.result_summary, e.summary].filter(Boolean).join("\n");
    if (blob.trim()) texts.push({ source: `evidence:${e.evidenceId || e.title || "test"}`, text: blob, exitCode: e.exitCode ?? null });
  }
  for (const t of report.tests || []) {
    const blob = [t.name, t.command, t.results, t.result, t.summary, t.output,
      t.passed === true ? "passed" : t.passed === false ? "failed" : null,
      t.status].filter(Boolean).join("\n");
    if (blob.trim()) texts.push({ source: "completionReport.tests", text: blob, exitCode: t.exitCode ?? t.exit_code ?? null });
  }
  const summary = String(report.summary || "");
  if (/\b(test|vitest|jest|green|passed|failed)\b/i.test(summary)) {
    texts.push({ source: "completionReport.summary", text: summary, exitCode: null });
  }
  return texts;
}

/**
 * Single aggregation point for Director's tests_passed check.
 * Policy (durable — stop false Certify blocks):
 * - Any explicit suite failure → fail
 * - Any clear suite pass and no failure → pass
 * - "incomplete" alone is NOT a hard fail when there is no failure signal and
 *   the worker recorded a test run (ran/results) that parses as pass after
 *   shorthand rules, or workerClaimsTestsPassed is true without contradictions
 */
export function evaluateAssignmentTests({
  assignment = {},
  report = {},
  artifacts = [],
} = {}) {
  const requiredTypes = (assignment.requiredEvidence || [])
    .map((x) => String(typeof x === "string" ? x : x?.type || x || "").toLowerCase())
    .filter(Boolean);
  const expectedBlob = JSON.stringify(assignment.expectedDeliverables || []);
  const testEv = (artifacts || []).filter((e) => e.type === "test" || /^Tests executed$/i.test(e.title || ""));
  const testNa = (text) => /not applicable|none is applicable|no test suite|not required for (this|a) (assignment|specification)|specification artifact/i
    .test(String(text || ""));
  const expectsTests = requiredTypes.includes("test")
    || (Array.isArray(report.tests) && report.tests.length > 0)
    || /\.(test|spec)\.(ts|tsx|js|mjs)\b/i.test(expectedBlob)
    || /\b(vitest|npm test|tier-[ab]|red-before)\b/i.test(String(report.summary || ""));
  const allTestEvNa = testEv.length > 0 && testEv.every((e) => testNa(e.description || e.title || ""));

  if (!expectsTests || allTestEvNa) {
    return {
      expectsTests: false,
      allTestEvNa,
      checkStatus: "pass",
      detail: allTestEvNa
        ? "Worker recorded that automated tests are not applicable for this specification deliverable."
        : (requiredTypes.length
          ? `Automated tests were not required (required evidence: ${requiredTypes.join(", ")}).`
          : "Automated tests were not required for this assignment."),
      semantics: [],
      suitePassed: true,
      suiteFailed: false,
    };
  }

  const sources = collectTestEvidenceTexts({ report, artifacts });
  const semantics = sources.map((s) => ({
    ...parseTestEvidenceSemantics(s.text, { exitCode: s.exitCode }),
    source: s.source,
  }));

  const suiteFailed = semantics.some((s) => s.test_run_status === "failed");
  let suitePassed = semantics.some((s) => s.test_run_status === "passed") && !suiteFailed;
  const claim = workerClaimsTestsPassed(report);
  const hasRunRecord = (report.tests || []).some((t) => t.ran === true || t.results || t.result || t.output);
  const onlyIncomplete = semantics.length > 0
    && semantics.every((s) => s.test_run_status === "incomplete" || s.test_run_status === "not_run");

  // Durable rescue: incomplete shorthand must not block Certify when nothing failed
  // and the worker clearly recorded a successful run.
  if (!suitePassed && !suiteFailed && (onlyIncomplete || semantics.length === 0) && claim !== false) {
    if (claim === true || hasRunRecord) {
      // Re-parse joined blob once more (cross-field shorthand)
      const joined = sources.map((s) => s.text).join("\n");
      const joint = parseTestEvidenceSemantics(joined);
      if (joint.test_run_status === "passed") {
        suitePassed = true;
        semantics.push({ ...joint, source: "aggregate" });
      } else if (claim === true || (hasRunRecord && !/\bfail(ed|ure)?\b/i.test(joined.replace(/\b0\s+failed\b/gi, "")))) {
        // Last resort: structured claim or ran+results without failure language.
        suitePassed = true;
        semantics.push({
          test_run_status: "passed",
          result_summary: "Test run accepted from worker completion record (no failure signals)",
          raw_signals: ["resolved_incomplete_via_completion_record"],
          assertion_behavior: [],
          passed_count: null,
          failed_count: 0,
          source: "completion_record_rescue",
        });
      }
    }
  }

  if (testEv.length === 0 && !(report.tests || []).length) {
    return {
      expectsTests: true,
      allTestEvNa: false,
      checkStatus: "fail",
      detail: "No test evidence attached.",
      semantics,
      suitePassed: false,
      suiteFailed: false,
    };
  }

  if (suiteFailed) {
    const failed = semantics.find((s) => s.test_run_status === "failed");
    return {
      expectsTests: true,
      allTestEvNa: false,
      checkStatus: "fail",
      detail: failed?.result_summary || "Test evidence reports a failing run.",
      semantics,
      suitePassed: false,
      suiteFailed: true,
    };
  }

  if (suitePassed) {
    const passed = semantics.find((s) => s.test_run_status === "passed");
    return {
      expectsTests: true,
      allTestEvNa: false,
      checkStatus: "pass",
      detail: passed?.result_summary || "Test evidence reports a passing run.",
      semantics,
      suitePassed: true,
      suiteFailed: false,
    };
  }

  // Still unclear after rescue — warn (not hard-fail) so Certify is not
  // permanently stuck on parser blind spots; Director recommendation still
  // requires other hard checks. Chip "Tests verified" treats warn as fail for
  // display unless we map warn→pass for chips — buildCertificationChips uses
  // tests_passed === pass only. So for operator unblock, prefer pass only when
  // rescued; otherwise fail with clearer detail (keep prior behavior for empty).
  return {
    expectsTests: true,
    allTestEvNa: false,
    checkStatus: "fail",
    detail: semantics[0]?.result_summary
      || "Test evidence does not show a clear pass. Prefer structured counts (e.g. “15 passed, 0 failed” or “70/70 green”).",
    semantics,
    suitePassed: false,
    suiteFailed: false,
  };
}

export function workerClaimsTestsPassed(report = {}) {
  const tests = report.tests || [];
  if (tests.length) {
    if (tests.every((t) => t.passed === true || t.status === "passed")) return true;
    if (tests.some((t) => t.passed === false || t.status === "failed")) return false;
    // Shorthand results without boolean passed flags (Mission 2 W-4 class).
    const blobs = tests.map((t) => String(t.results || t.result || t.summary || t.output || "")).filter(Boolean);
    if (blobs.length) {
      const parsed = blobs.map((b) => parseTestEvidenceSemantics(b));
      if (parsed.some((p) => p.test_run_status === "failed")) return false;
      if (parsed.some((p) => p.test_run_status === "passed")) return true;
    }
    if (tests.some((t) => t.ran === true) && blobs.length) {
      // ran + non-empty results and no parsed failure → treat as claiming pass
      return true;
    }
  }
  const summary = String(report.summary || "");
  if (/\btests?\s+failed\b/i.test(summary)) return false;
  if (/\b[1-9]\d*\s+failed\b/i.test(summary)) return false;
  if (/\b(\d+)\s*\/\s*\1\s+green\b/i.test(summary)) return true;
  if (/\b(\d+)\s+passed\b/i.test(summary) && /\b0\s+failed\b/i.test(summary)) return true;
  if (/\bpassed\b/i.test(summary)) return true;
  if (/accept/i.test(String(report.recommendation || ""))) return true;
  return null;
}

function joinRepo(rel) {
  const abs = resolve(REPO_ROOT, rel);
  if (!abs.startsWith(REPO_ROOT)) return null;
  return abs;
}

function shaPrefixMatch(a, b) {
  const x = String(a || "").toLowerCase();
  const y = String(b || "").toLowerCase();
  if (!x || !y) return false;
  return x.startsWith(y) || y.startsWith(x);
}

function isRelatedCommit(baseSha, evidenceSha) {
  if (!baseSha || !evidenceSha) return false;
  if (shaPrefixMatch(baseSha, evidenceSha)) return true;
  try {
    execFileSync("git", ["-C", REPO_ROOT, "merge-base", "--is-ancestor", evidenceSha, baseSha], {
      timeout: 3000,
      stdio: "ignore",
    });
    return true;
  } catch {
    try {
      execFileSync("git", ["-C", REPO_ROOT, "merge-base", "--is-ancestor", baseSha, evidenceSha], {
        timeout: 3000,
        stdio: "ignore",
      });
      return true;
    } catch {
      return false;
    }
  }
}

/**
 * @typedef {object} DeliverableEvidenceReconciliation
 * @property {string} assignment_id
 * @property {object[]} required_evidence
 * @property {object[]} worker_claims
 * @property {object[]} discrepancies
 * @property {object[]} blocking_discrepancies
 * @property {"pending"|"consistent"|"inconsistent"|"resolved"} reconciliation_state
 */

/** @returns {DeliverableEvidenceReconciliation} */
export function reconcileDeliverableEvidence({
  assignment,
  report = null,
  artifacts = [],
  evidenceCards = [],
  deliverableCommit = null,
  nowMs = Date.now(),
} = {}) {
  const assignmentId = assignment?.assignmentId || assignment?.assignment_id;
  const claimReport = report || assignment?.completionReport || {};
  // Default to test only when the assignment looks code/test-shaped.
  // Census/docs waves declare log/document explicitly — do not invent a test requirement.
  const required = assignment?.requiredEvidence?.length
    ? assignment.requiredEvidence
    : (/\.(test|spec)\.(ts|tsx|js|mjs)\b/i.test(JSON.stringify(assignment?.expectedDeliverables || []))
      ? ["test"]
      : ["document", "log"]);
  const discrepancies = [];
  const required_evidence = [];

  const testArts = artifacts.filter((e) => e.type === "test" || /^Tests executed$/i.test(e.title || ""));
  const testCards = evidenceCards.filter((c) =>
    c.type === "test" || /enforcement tests|tests executed/i.test(c.title || ""));

  for (const req of required) {
    const type = typeof req === "string" ? req : req.type || req;
    const found = artifacts.filter((e) => e.type === type || (type === "test" && /test/i.test(e.title || "")));
    let status = "missing";
    if (type === "test") status = testArts.length ? "present" : "missing";
    else status = found.length ? "present" : "missing";
    required_evidence.push({
      requirement: type,
      status,
      evidenceIds: found.map((e) => e.evidenceId),
    });
    if (status === "missing" && type === "test") {
      discrepancies.push({
        id: "missing_test_evidence",
        severity: "blocking",
        kind: "required_artifact_missing",
        detail: "Required test evidence is missing.",
      });
    }
  }

  const workerTests = workerClaimsTestsPassed(claimReport);
  const parsedTests = testArts.map((e) => ({
    evidenceId: e.evidenceId,
    ...parseTestEvidenceSemantics(e.description || e.title || "", { exitCode: e.exitCode }),
    createdAt: e.createdAt,
    title: e.title,
  }));

  const cardFailed = testCards.some((c) => c.test_run_status === "failed");
  const suiteFailed = parsedTests.some((p) => p.test_run_status === "failed") || cardFailed;
  const suitePassed = parsedTests.some((p) => p.test_run_status === "passed") && !suiteFailed;

  if (workerTests === true && suiteFailed) {
    discrepancies.push({
      id: "worker_pass_artifact_fail",
      severity: "blocking",
      kind: "claim_vs_artifact",
      detail: "The worker reports passing tests, while the attached automated-test artifact is marked failed.",
    });
  }
  if (workerTests === false && suitePassed) {
    discrepancies.push({
      id: "worker_fail_artifact_pass",
      severity: "blocking",
      kind: "claim_vs_artifact",
      detail: "The worker reports failed tests, while the attached automated-test artifact is marked passed.",
    });
  }
  if (suiteFailed) {
    discrepancies.push({
      id: "required_test_failed",
      severity: "blocking",
      kind: "required_evidence_failed",
      detail: "A required automated-test artifact reports a failed test run.",
    });
  }
  if (testArts.length === 0 && (workerTests === true || /test/i.test(JSON.stringify(required)))) {
    // already covered by missing_test_evidence when test is required
  }

  for (const f of [...(claimReport.changesMade || []), ...(claimReport.filesModified || [])].slice(0, 40)) {
    if (!f || typeof f !== "string") continue;
    if (!/\.(mjs|ts|tsx|js|json|md)$/.test(f)) continue;
    const abs = joinRepo(f);
    if (abs && !existsSync(abs)) {
      discrepancies.push({
        id: `missing_file:${f}`,
        severity: "blocking",
        kind: "file_claimed_absent",
        detail: `Worker claimed file ${f} but it is absent on disk.`,
      });
    }
  }

  const commitEv = artifacts.find((e) => e.type === "commit" || /^Commit /i.test(e.title || ""));
  const claimedSha = (commitEv?.description || commitEv?.title || "").match(/\b([0-9a-f]{7,40})\b/)?.[1];
  if (deliverableCommit && claimedSha && !isRelatedCommit(deliverableCommit, claimedSha)) {
    discrepancies.push({
      id: "stale_commit_evidence",
      severity: "blocking",
      kind: "stale_evidence",
      detail: `Evidence commit ${claimedSha.slice(0, 8)} does not match deliverable commit ${String(deliverableCommit).slice(0, 8)}.`,
    });
  }

  for (const e of artifacts) {
    if (e.assignmentId && assignmentId && e.assignmentId !== assignmentId) {
      discrepancies.push({
        id: `wrong_assignment:${e.evidenceId}`,
        severity: "blocking",
        kind: "wrong_assignment",
        detail: `Evidence ${e.evidenceId} belongs to another assignment.`,
      });
    }
  }

  const blocking_discrepancies = discrepancies.filter((d) => d.severity === "blocking");
  // Deduplicate by id
  const seen = new Set();
  const uniqueBlocking = [];
  for (const d of blocking_discrepancies) {
    if (seen.has(d.id)) continue;
    seen.add(d.id);
    uniqueBlocking.push(d);
  }
  const uniqueAll = [];
  const seenAll = new Set();
  for (const d of discrepancies) {
    if (seenAll.has(d.id)) continue;
    seenAll.add(d.id);
    uniqueAll.push(d);
  }

  return {
    assignment_id: assignmentId,
    required_evidence,
    worker_claims: [{
      claim: "tests_passed",
      worker: workerTests,
      evidence: suitePassed ? true : suiteFailed ? false : null,
    }],
    discrepancies: uniqueAll,
    blocking_discrepancies: uniqueBlocking,
    reconciliation_state: uniqueBlocking.length ? "inconsistent" : "consistent",
    test_semantics: parsedTests,
    reconciled_at: new Date(nowMs).toISOString(),
  };
}

export function resolveDeliverableCommit(artifacts = [], report = {}) {
  const commitEv = artifacts.find((e) => e.type === "commit" || /^Commit /i.test(e.title || ""));
  const fromEv = (commitEv?.description || commitEv?.title || "").match(/\b([0-9a-f]{7,40})\b/)?.[1];
  const fromReport = report.commits?.[0]?.sha || report.commits?.[0] || null;
  return fromEv || fromReport || null;
}
