/**
 * Deliverable Review — Director certification briefing (W-4).
 */
import assert from "node:assert/strict";
import {
  ensureDeliverableReviewsForMission,
  createDeliverableReview,
  getOpenDeliverableReview,
  deliverableReviewVm,
  acceptDeliverableReview,
  runDirectorVerification,
} from "../lib/vacilando/deliverable-review.mjs";
import { deriveMissionPosture } from "../lib/vacilando/mission-posture.mjs";
import { missionOutcomeVm, missionDashboardVm } from "../lib/vacilando/presentation/operator-views.mjs";

const mid = "msn_2d054741a54698fa4c";
const aid = "asg_d203f547736c16";

const ensured = ensureDeliverableReviewsForMission(mid);
assert.ok(ensured.ok);

const created = createDeliverableReview(mid, aid, { force: true, autoRepair: false });
assert.ok(created.ok, "create W-4 review");
assert.equal(created.review.assignment_id, aid);
assert.equal(created.review.certification_state, "ready_for_review");
assert.match(created.review.deliverable_title, /W-4|principal/i);
assert.match(created.review.recommendation_detail || "", /independently verified|W-15/i);
assert.ok(created.review.behavior_not_changed.some((x) => /route|schema|UI/i.test(x)));
assert.ok(created.review.deferred_work.some((x) => /W-15/i.test(x)));
assert.equal(created.review.recommendation, "approve");
assert.ok(created.review.approval_meaning.does_not_imply.some((x) => /exception/i.test(x)));
assert.equal(created.review.evidence_reconciliation.reconciliation_state, "consistent");
assert.ok(Array.isArray(created.review.executive_summary));
assert.ok(created.review.executive_summary.length <= 3);
assert.ok(created.review.asking_you_to_approve?.approving?.length);
assert.ok(created.review.asking_you_to_approve?.not_approving?.length);
assert.ok(created.review.approval_impact?.immediately?.length);
assert.equal(created.review.director_certification?.confidence?.pct, 97);

const verification = runDirectorVerification(mid, aid);
assert.ok(verification.ok);
assert.ok(verification.checks.some((c) => c.id === "tests_passed"));
assert.ok(verification.checks.every((c) => ["pass", "fail", "warn"].includes(c.status)));

const open = getOpenDeliverableReview(mid);
assert.ok(open);
assert.equal(open.assignment_id, aid, "open review is W-4 (newest)");

const vm = deliverableReviewVm(mid);
assert.equal(vm.kind, "deliverable_review");
assert.match(vm.headline, /Director has certified this deliverable|Director recommends certification/i);
assert.doesNotMatch(vm.headline, /Ready for your approval/i);
assert.ok(vm.operatorMayApprove);
assert.ok(vm.executiveSummary.sentences.length >= 1);
assert.ok(vm.executiveSummary.sentences.length <= 3);
assert.equal(vm.certification.confidence.pct, 97);
assert.ok(vm.certification.chips.some((c) => /Scope verified/i.test(c.label) && c.status === "pass"));
assert.ok(vm.askingYouToApprove.approving.some((x) => /enforcement guard/i.test(x)));
assert.ok(vm.askingYouToApprove.not_approving.some((x) => /exception|Schema|UI|W-15/i.test(x)));
assert.ok(vm.approvalImpact.immediately.some((x) => /Mark W-4|unlock|confidence/i.test(x)));
assert.ok(vm.whatChanged.length >= 3);
assert.ok(vm.whatDidNotChange.length >= 2);
assert.ok(vm.evidence.every((e) => e.proves && !/^document\s*[—-]\s*document$/i.test(e.title)));
assert.ok(vm.evidence.some((e) => /enforcement|baseline|build integration|commit/i.test(e.title)));
assert.ok(vm.approvalMeaning);
assert.equal(vm.actions.approve, true);

const posture = deriveMissionPosture(mid);
assert.equal(posture.id, "deliverable_review");
assert.match(posture.label, /Director recommends certifying W-4/i);
assert.doesNotMatch(posture.label, /Deliverable ready for approval/i);
assert.doesNotMatch(posture.detail || "", /review before you certify/i);

const outcome = missionOutcomeVm(mid);
assert.equal(outcome.kind, "deliverable_review");
assert.doesNotMatch(JSON.stringify(outcome), /Worker closed the assignment/i);
assert.doesNotMatch(JSON.stringify(outcome.executiveSummary || {}), /\.mjs|\.ts|asg_/i);

const dash = missionDashboardVm(mid);
assert.match(dash.summary.deliverablesLabel, /Director recommends certifying W-4/i);
assert.equal(dash.outcome?.kind, "deliverable_review");

// Accept path (then restore a ready review for the live W-4 UI)
const accepted = acceptDeliverableReview(mid, open.review_id, {
  response: "test accept",
});
assert.ok(accepted.ok, "accept");
assert.equal(accepted.review.certification_state, "accepted");

const restored = createDeliverableReview(mid, aid, { force: true, autoRepair: false });
assert.ok(restored.ok);
assert.equal(restored.review.certification_state, "ready_for_review");

console.log(JSON.stringify({
  ok: true,
  reviewId: restored.review.review_id,
  headline: vm.headline,
  recommendation: vm.directorRecommendation,
  certificationConfidence: vm.certification.confidence,
  executiveSummary: vm.executiveSummary.sentences,
  posture: posture.label,
  checks: verification.checks.map((c) => `${c.id}:${c.status}`),
}, null, 2));
