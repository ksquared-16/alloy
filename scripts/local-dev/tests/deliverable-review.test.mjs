/**
 * Deliverable Review — Director certification briefing (W-4).
 *
 * Uses an explicit review object for shape assertions so the live mission
 * can keep W-4 certified without the test re-opening a ready briefing.
 */
import assert from "node:assert/strict";
import {
  ensureDeliverableReviewsForMission,
  createDeliverableReview,
  getOpenDeliverableReview,
  getLatestAcceptedDeliverableReview,
  deliverableReviewVm,
  acceptDeliverableReview,
  shareContextWithDirector,
  listDeliverableConversation,
  runDirectorVerification,
  listDeliverableReviews,
  supersedeOpenReviewsForAssignment,
} from "../lib/vacilando/deliverable-review.mjs";
import { listDirectorMessages } from "../lib/vacilando/director-comms.mjs";
import { missionOutcomeVm } from "../lib/vacilando/presentation/operator-views.mjs";

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

// Shape of the operator briefing (pass the review explicitly — assignment may
// already be accepted in the live store, which correctly hides it from getOpen).
const vm = deliverableReviewVm(mid, created.review);
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
assert.equal(vm.actions.shareContext, true);
assert.ok(Array.isArray(vm.conversation));

const shared = shareContextWithDirector(mid, created.review.review_id, {
  message: "Prefer shipping wave order A before B; residual risk on docs is accepted.",
  actor: "operator",
});
assert.ok(shared.ok, "share context");
const contextMsg = [...listDirectorMessages(mid, { limit: 30 })].reverse()
  .find((m) => m.reviewId === created.review.review_id && m.kind === "context");
assert.ok(contextMsg, "context message persisted with reviewId");
assert.match(contextMsg.verbatim || "", /alignment feedback|Operator context:/i);
assert.match(contextMsg.verbatim || "", /Prefer shipping wave order A before B/);
assert.ok((contextMsg.verbatim || "").includes(created.review.review_id));
assert.ok(
  listDeliverableConversation(mid, { reviewId: created.review.review_id }).some(
    (t) => t.actor === "you" && /Prefer shipping wave order/.test(t.text),
  ),
);

const acceptNote = "Accept residual risk on docs; next wave should prioritize Identity.";
const accepted = acceptDeliverableReview(mid, created.review.review_id, {
  response: acceptNote,
});
assert.ok(accepted.ok, "accept");
assert.equal(accepted.review.certification_state, "accepted");
assert.equal(accepted.review.acceptance_note, acceptNote);
assert.ok(
  (accepted.review.history || []).some((h) => h.action === "accepted" && h.note === acceptNote),
);
assert.ok(
  listDeliverableConversation(mid, { reviewId: created.review.review_id }).some(
    (t) => t.actor === "you" && /residual risk on docs/.test(t.text),
  ),
  "certify note appears in conversation",
);

// Regression: Certify must not look like a no-op.
// 1) sibling ready rows are superseded
// 2) ensure must not recreate a ready briefing for an accepted assignment
// 3) outcome shows confirmation, not another identical Certify screen
supersedeOpenReviewsForAssignment(mid, aid, { reason: "test_cleanup" });
const afterEnsure = ensureDeliverableReviewsForMission(mid);
assert.equal(
  afterEnsure.created.filter((r) => r.assignment_id === aid).length,
  0,
  "ensure must not recreate W-4 after accept",
);
assert.notEqual(
  getOpenDeliverableReview(mid)?.assignment_id,
  aid,
  "accepted assignment must not stay open",
);
const latestAccepted = getLatestAcceptedDeliverableReview(mid);
assert.equal(latestAccepted?.assignment_id, aid);

// After W-4 accept, an earlier open briefing (e.g. W-1) may still need you —
// that should win over a "You certified W-4" confirmation.
const outcome = missionOutcomeVm(mid);
const openAfter = getOpenDeliverableReview(mid);
if (openAfter) {
  assert.equal(outcome.kind, "deliverable_review", outcome.kind);
  assert.notEqual(openAfter.assignment_id, aid);
} else {
  assert.equal(outcome.kind, "deliverable_certified", outcome.kind);
  assert.match(outcome.headline, /You certified W-4/i);
}

// Force-create after accept may exist for repair tooling, but must not resurface in getOpen.
const orphan = createDeliverableReview(mid, aid, { force: true, autoRepair: false });
assert.ok(orphan.ok);
assert.equal(orphan.review.certification_state, "ready_for_review");
assert.notEqual(
  getOpenDeliverableReview(mid)?.assignment_id,
  aid,
  "force-created ready after accept must not become the open operator briefing",
);
// Leave the store clean for the live UI.
supersedeOpenReviewsForAssignment(mid, aid, { reason: "test_teardown" });
ensureDeliverableReviewsForMission(mid);

const readyLeft = listDeliverableReviews(mid)
  .filter((r) => r.assignment_id === aid && r.certification_state === "ready_for_review");
assert.equal(readyLeft.length, 0, "no leftover ready W-4 for live UI");

console.log(JSON.stringify({
  ok: true,
  headline: vm.headline,
  recommendation: vm.directorRecommendation,
  certificationConfidence: vm.certification.confidence,
  executiveSummary: vm.executiveSummary.sentences,
  afterAcceptOutcome: outcome.headline,
  checks: verification.checks.map((c) => `${c.id}:${c.status}`),
}, null, 2));
