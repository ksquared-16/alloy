/**
 * Deliverable Review Evidence Integrity V1
 *
 * SEEDED, NOT BORROWED. This read a hard-coded mission and assignment out of the
 * LIVE gateway store with no isolated root. Those records aged out of a rolling
 * store, so every case that needed a review failed at
 * `createDeliverableReview -> { ok: false, error: "assignment_not_found" }`.
 *
 * The evidence semantics below are pure functions and were always sound; only
 * the cases that needed a real assignment were affected. The fixture builds one
 * and attaches evidence through the real `attachEvidence` API, so a case that
 * omits evidence still fails `evidence_present` - omission stays visible, which
 * is the whole point of this file.
 *
 * Imports are dynamic because ESM hoists static ones and the library captures
 * ALLOY_RUNTIME_ROOT at module load.
 */
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const root = mkdtempSync(join(os.tmpdir(), "vac-deliverable-evidence-"));
process.env.ALLOY_RUNTIME_ROOT = root;

const { seedW4Assignment, seedW4Evidence } = await import("./helpers/deliverable-review-fixture.mjs");
const { missionId: mid, assignmentId: aid } = seedW4Assignment(root);
await seedW4Evidence({ missionId: mid, assignmentId: aid });

const {
  parseTestEvidenceSemantics,
  reconcileDeliverableEvidence,
  workerClaimsTestsPassed,
  evaluateAssignmentTests,
} = await import("../lib/vacilando/deliverable-evidence.mjs");
const {
  createDeliverableReview,
  acceptDeliverableReview,
  deliverableReviewVm,
  supersedeOpenReviewsForAssignment,
} = await import("../lib/vacilando/deliverable-review.mjs");

// --- Semantics: "0 failed" must not mark suite failed (W-4 root cause) ---
{
  const w4 = parseTestEvidenceSemantics(
    "web/tests/access/serviceClientPrincipalCheck.test.ts — 15 passed, 0 failed (vitest run). "
    + "npm run check:service-client-principal — exit 0, ok:true. "
    + "Includes an empty-allow-list red-state assertion proving the check is not vacuous, "
    + "and a stale-entry assertion proving the lists cannot accumulate residue.",
  );
  assert.equal(w4.test_run_status, "passed", "0 failed must be suite passed");
  assert.equal(w4.failed_count, 0);
  assert.equal(w4.passed_count, 15);
  assert.ok(w4.assertion_behavior.some((a) => a.kind === "expected_rejection"));
  assert.match(w4.result_summary, /15 tests passed · 0 failed/i);
  assert.match(w4.result_summary, /negative fixture/i);
}

// --- Semantics: "70/70 green" shorthand must not be incomplete (Mission 2 W-4) ---
{
  const slash = parseTestEvidenceSemantics(
    "70/70 green across all four Wave 1 suites (serviceClientPrincipalCheck 15, "
    + "analyticsRouteGates 36, selfAuthorityMutation 14, permissionGrid 5). "
    + "W-4's 15 match the 2026-07-31 record exactly, and stay green at the tightened ceiling. "
    + "Typecheck NOT run — command-approval wall.",
  );
  assert.equal(slash.test_run_status, "passed", "70/70 green must be suite passed");
  assert.equal(slash.passed_count, 70);
  assert.equal(slash.failed_count, 0);
  assert.ok(slash.raw_signals.includes("slash_all_green"));
  assert.match(slash.result_summary, /70 tests passed/i);
}

// --- Durable: incomplete shorthand must not block when completionReport.tests is clear ---
{
  const evaled = evaluateAssignmentTests({
    assignment: {
      assignmentId: "asg_test",
      requiredEvidence: ["log", "document"],
      expectedDeliverables: ["web/tests/access/serviceClientPrincipalCheck.test.ts"],
    },
    report: {
      summary: "Re-verified W-4. Check is green.",
      tests: [{
        ran: true,
        results: "70/70 green across all four Wave 1 suites. Typecheck NOT run — command-approval wall.",
      }],
    },
    artifacts: [{
      evidenceId: "ev_tests",
      type: "test",
      title: "Tests executed",
      // Deliberately ambiguous alone — used to yield "incomplete"
      description: "Wave 1 suites executed; see completion report.",
    }],
  });
  assert.equal(evaled.checkStatus, "pass", "completionReport.tests shorthand must unblock tests_passed");
  assert.equal(evaled.suitePassed, true);
  assert.equal(evaled.suiteFailed, false);
}

{
  const failed = evaluateAssignmentTests({
    assignment: { requiredEvidence: ["test"] },
    report: { tests: [{ ran: true, results: "3 passed, 2 failed — suite FAILED" }] },
    artifacts: [{ type: "test", title: "Tests executed", description: "3 passed, 2 failed — suite FAILED" }],
  });
  assert.equal(failed.checkStatus, "fail");
  assert.equal(failed.suiteFailed, true);
}

{
  assert.equal(
    workerClaimsTestsPassed({
      tests: [{ ran: true, results: "70/70 green across suites" }],
    }),
    true,
  );
}


{
  const negExit = parseTestEvidenceSemantics(
    "Negative fixture correctly rejected with exit 1 on unlisted route; suite summary: 8 passed, 0 failed",
  );
  assert.equal(negExit.test_run_status, "passed");
}

{
  const realFail = parseTestEvidenceSemantics("3 passed, 2 failed — suite FAILED");
  assert.equal(realFail.test_run_status, "failed");
}

// --- Semantics: red-before proof must not override green-after pass (W-1 root cause) ---
{
  const w1 = parseTestEvidenceSemantics(
    "72 passed across tests/access/, tests/admin/permissionGrid, tests/admin/usersRolesAuth, "
    + "tests/metrics/metricsResolveRoute, tests/metrics/metricsTrendsRoute. "
    + "Red-before proof: 18 tests failed with the sources reverted and the tests kept (W-1 9, W-2 7, W-3 2). "
    + "Typecheck: npm run typecheck via the broker, rc=0, whole workspace.",
  );
  assert.equal(w1.test_run_status, "passed", "red-before failure count must not mark suite failed");
  assert.equal(w1.passed_count, 72);
  assert.equal(w1.failed_count, null);
  assert.ok(w1.raw_signals.includes("ignored_red_before_narrative"));
  assert.ok(w1.assertion_behavior.some((a) => /red-before/i.test(a.detail)));
}

// --- Reconciliation discrepancies ---
{
  const assignment = {
    assignmentId: aid,
    requiredEvidence: ["test"],
    completionReport: {
      summary: "All tests passed",
      recommendation: "Accept",
      changesMade: ["web/scripts/checkServiceClientPrincipal.mjs"],
      tests: [{ name: "suite", passed: true }],
    },
  };
  const failedArt = {
    evidenceId: "ev_fake_fail",
    assignmentId: aid,
    type: "test",
    title: "Tests executed",
    description: "2 passed, 3 failed",
    createdAt: new Date().toISOString(),
  };
  const cards = [{
    title: "Automated enforcement tests",
    type: "test",
    test_run_status: "failed",
    result: "failed",
  }];
  const recon = reconcileDeliverableEvidence({
    assignment,
    artifacts: [failedArt],
    evidenceCards: cards,
  });
  assert.equal(recon.reconciliation_state, "inconsistent");
  assert.ok(recon.blocking_discrepancies.some((d) => d.id === "worker_pass_artifact_fail"));
  assert.ok(recon.blocking_discrepancies.some((d) => d.id === "required_test_failed"));
}

{
  const assignment = {
    assignmentId: aid,
    requiredEvidence: ["test"],
    completionReport: {
      summary: "Tests failed; cannot recommend",
      tests: [{ passed: false }],
    },
  };
  const passedArt = {
    evidenceId: "ev_fake_pass",
    assignmentId: aid,
    type: "test",
    title: "Tests executed",
    description: "10 passed, 0 failed",
  };
  const recon = reconcileDeliverableEvidence({
    assignment,
    artifacts: [passedArt],
    evidenceCards: [{ title: "Automated enforcement tests", test_run_status: "passed", result: "passed" }],
  });
  assert.ok(recon.blocking_discrepancies.some((d) => d.id === "worker_fail_artifact_pass"));
}

{
  const recon = reconcileDeliverableEvidence({
    assignment: { assignmentId: aid, requiredEvidence: ["test"], completionReport: { summary: "done" } },
    artifacts: [],
    evidenceCards: [],
  });
  assert.ok(recon.blocking_discrepancies.some((d) => d.kind === "required_artifact_missing"));
}

{
  const recon = reconcileDeliverableEvidence({
    assignment: {
      assignmentId: aid,
      requiredEvidence: ["test"],
      completionReport: {
        summary: "15 passed, 0 failed",
        changesMade: ["web/scripts/checkServiceClientPrincipal.mjs"],
      },
    },
    artifacts: [{
      evidenceId: "ev_ok",
      assignmentId: aid,
      type: "test",
      title: "Tests executed",
      description: "15 passed, 0 failed",
    }, {
      evidenceId: "ev_commit",
      assignmentId: aid,
      type: "commit",
      title: "Commit deadbeef",
      description: "deadbeefabcdef0123456789",
    }],
    evidenceCards: [{ title: "Automated enforcement tests", test_run_status: "passed", result: "passed" }],
    deliverableCommit: "23b4c671dfffffffffffffffffffffffffffffff",
  });
  assert.ok(
    recon.blocking_discrepancies.some((d) => d.kind === "stale_evidence"),
    "stale commit evidence blocks",
  );
}

assert.equal(workerClaimsTestsPassed({ summary: "15 passed, 0 failed" }), true);

// --- Live W-4: after fix, consistent + approvable ---
{
  const created = createDeliverableReview(mid, aid, { force: true, autoRepair: false });
  assert.ok(created.ok, "create W-4");
  const review = created.review;
  assert.equal(review.evidence_reconciliation.reconciliation_state, "consistent");
  assert.equal(review.certification_state, "ready_for_review");
  assert.equal(review.recommendation, "approve");
  assert.match(review.recommendation_headline, /Approve W-4/i);

  const testCard = (review.evidence_summary || []).find((e) => /enforcement tests/i.test(e.title));
  assert.ok(testCard, "test evidence card present");
  assert.equal(testCard.test_run_status, "passed");
  assert.equal(testCard.result, "passed");
  assert.match(testCard.result_summary, /passed/i);
  assert.doesNotMatch(String(testCard.result), /^failed$/i);

  const vm = deliverableReviewVm(mid, review);
  assert.equal(vm.operatorMayApprove, true);
  assert.equal(vm.recommendation.action, "approve");
  assert.match(vm.recommendation.headline, /Approve/i);
  assert.ok((vm.verification?.yourJudgment || []).every((j) => !("status" in j) || j.status == null));
  assert.ok((vm.verification?.checks || []).every((c) => c.source !== "judgment"));

}

{
  const r = createDeliverableReview(mid, aid, { force: true, autoRepair: false }).review;
  // THE ISOLATED ROOT, not the operator's home. This reached into the live
  // gateway store to corrupt a review row on purpose - which only worked while
  // the live mission existed, and would have written to real state if it did.
  const file = join(root, "vacilando", "deliverable-reviews", `${mid}.json`);
  const store = JSON.parse(readFileSync(file, "utf8"));
  const row = store.reviews.find((x) => x.review_id === r.review_id);
  row.certification_state = "evidence_discrepancy";
  row.recommendation = "not_ready";
  row.evidence_reconciliation = {
    reconciliation_state: "inconsistent",
    blocking_discrepancies: [{ id: "worker_pass_artifact_fail", detail: "conflict" }],
  };
  writeFileSync(file, JSON.stringify(store, null, 2));
  const denied = acceptDeliverableReview(mid, r.review_id, { response: "should block" });
  assert.equal(denied.ok, false);
  assert.ok(["evidence_not_reconciled", "not_approvable", "director_could_not_certify"].includes(denied.error));
}

// W-4 shape still builds correctly (assignment may already be operator-accepted).
const restored = createDeliverableReview(mid, aid, { force: true, autoRepair: false });
assert.ok(restored.ok);
assert.equal(restored.review.certification_state, "ready_for_review");
assert.equal(restored.review.recommendation, "approve");

const vmFinal = deliverableReviewVm(mid, restored.review);
assert.equal(vmFinal.operatorMayApprove, true);
assert.match(vmFinal.recommendation.headline, /Approve W-4/i);

/*
 * A SECOND deliverable in the same mission, seeded rather than borrowed.
 *
 * This named another live assignment - asg_d77353d7377647 - purely to leave the
 * operator's real W-1 briefing open at teardown. In an isolated root there is no
 * operator briefing to preserve, but the contract the block checks is real: a
 * different assignment also reaches ready_for_review. So the assertion stays and
 * the live id goes.
 */
const w1 = "asg_deliverable_review_fixture_w1";
seedW4Assignment(root, {
  missionId: mid, assignmentId: w1, append: true,
  title: "W-1 — Service-client principal check (second deliverable)",
});
await seedW4Evidence({ missionId: mid, assignmentId: w1 });
supersedeOpenReviewsForAssignment(mid, aid, { reason: "test_teardown_keep_w1" });
const w1Ready = createDeliverableReview(mid, w1, { force: true, autoRepair: false });
assert.ok(w1Ready.ok);
assert.equal(w1Ready.review.certification_state, "ready_for_review", w1Ready.review.recommendation_detail);

console.log(JSON.stringify({
  ok: true,
  rootCause: "naive /fail/i matched '0 failed' in passing suite text; red-before narrative also fooled the parser",
  w4: {
    state: restored.review.certification_state,
    recommendation: restored.review.recommendation_headline,
    testCard: (restored.review.evidence_summary || []).find((e) => /enforcement/i.test(e.title)),
    reconciliation: restored.review.evidence_reconciliation.reconciliation_state,
  },
  w1Open: {
    state: w1Ready.review.certification_state,
    recommendation: w1Ready.review.recommendation_headline,
  },
}, null, 2));
