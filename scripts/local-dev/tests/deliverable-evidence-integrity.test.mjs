/**
 * Deliverable Review Evidence Integrity V1
 */
import assert from "node:assert/strict";
import {
  parseTestEvidenceSemantics,
  reconcileDeliverableEvidence,
  workerClaimsTestsPassed,
} from "../lib/vacilando/deliverable-evidence.mjs";
import {
  createDeliverableReview,
  acceptDeliverableReview,
  deliverableReviewVm,
} from "../lib/vacilando/deliverable-review.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

const mid = "msn_2d054741a54698fa4c";
const aid = "asg_d203f547736c16";

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
  const file = join(os.homedir(), ".local/state/alloy-dev/vacilando/deliverable-reviews", `${mid}.json`);
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

// Restore clean W-4 ready review for the UI
const restored = createDeliverableReview(mid, aid, { force: true, autoRepair: false });
assert.ok(restored.ok);
assert.equal(restored.review.certification_state, "ready_for_review");
assert.equal(restored.review.recommendation, "approve");

const vmFinal = deliverableReviewVm(mid);
assert.equal(vmFinal.operatorMayApprove, true);
assert.match(vmFinal.recommendation.headline, /Approve W-4/i);

console.log(JSON.stringify({
  ok: true,
  rootCause: "naive /fail/i matched '0 failed' in passing suite text",
  w4: {
    state: restored.review.certification_state,
    recommendation: restored.review.recommendation_headline,
    testCard: (restored.review.evidence_summary || []).find((e) => /enforcement/i.test(e.title)),
    reconciliation: restored.review.evidence_reconciliation.reconciliation_state,
  },
}, null, 2));
