/**
 * Director Experience V2 — DX-5.5 Mission Continuation presentation.
 * Run: node scripts/local-dev/tests/mission-continuation-dx5-5.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx55-"));

const {
  missionContinuationVm,
  missionDecisionCardsVm,
  inferRecommendedContinuationKind,
} = await import("../lib/vacilando/presentation/mission-continuation.mjs");
const { composeExecutiveL1 } = await import("../lib/vacilando/presentation/executive-overview.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { listAssignments, updateAssignment } = await import("../lib/vacilando/worker-assignment.mjs");
const { attachEvidence } = await import("../lib/vacilando/evidence.mjs");
const { missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");

const mid = "msn_fixture_dx55";

const advanceChoices = [
  {
    id: "advance",
    kind: "advance_implementation",
    label: "Advance to implementation",
    explanation: "Keep this same mission. Open implementation phases.",
    missionId: mid,
  },
  {
    id: "more_work",
    kind: "reopen_work",
    label: "Need more discovery work",
    explanation: "Reopen discovery if incomplete.",
    missionId: mid,
  },
  {
    id: "park",
    kind: "park_outcome",
    label: "Park for later",
    explanation: "Stay open and idle.",
    missionId: mid,
  },
  {
    id: "close",
    kind: "certify_completion",
    label: "Close mission (no implementation)",
    explanation: "End without implementing.",
    missionId: mid,
  },
];

const discoveryPack = missionContinuationVm(mid, {
  choices: advanceChoices,
  posture: {
    id: "operator_review",
    next: "Recommended: Advance to implementation on this mission",
    secondaryAction: { kind: "advance_implementation", label: "Advance", missionId: mid },
    choices: advanceChoices,
  },
  advance: { ok: true },
});

assert.equal(discoveryPack.sectionTitle, "Recommended Next Action");
assert.equal(discoveryPack.continuationState, "discovery_complete");
assert.equal(discoveryPack.recommended?.kind, "advance_implementation");
assert.equal(discoveryPack.recommended?.buttonLabel, "Begin Implementation");
assert.match(discoveryPack.whyRecommended || "", /Discovery objectives|implementation/i);
assert.match(discoveryPack.expectedOutcome || "", /Implementation roadmap|Wave 0|implementation/i);
assert.ok(discoveryPack.feedbackSurface?.title === "Provide Feedback");

const altKinds = discoveryPack.alternatives.map((c) => c.kind);
assert.ok(altKinds.includes("reopen_work"), "Request More Discovery available");
assert.ok(altKinds.includes("provide_feedback"), "Provide Feedback available");
assert.ok(altKinds.includes("review_findings"), "Review Findings available");
assert.ok(altKinds.includes("park_outcome"), "Park available");
assert.ok(altKinds.includes("certify_completion"), "Close Without Continuing available");

const reopen = discoveryPack.alternatives.find((c) => c.kind === "reopen_work");
assert.equal(reopen.buttonLabel, "Request More Discovery");
const close = discoveryPack.alternatives.find((c) => c.kind === "certify_completion");
assert.equal(close.buttonLabel, "Close Without Continuing");
assert.match(close.whyChoose, /Abandon|intentionally will not/i);

const feedback = discoveryPack.alternatives.find((c) => c.kind === "provide_feedback");
assert.equal(feedback.presentationOnly, true);
assert.match(feedback.whyChoose, /fundamentally correct|refinements/i);
assert.notEqual(feedback.buttonLabel, reopen.buttonLabel);

const findings = discoveryPack.alternatives.find((c) => c.kind === "review_findings");
assert.equal(findings.presentationOnly, true);
assert.equal(findings.action?.kind, "review_findings");

const compat = missionDecisionCardsVm(mid, {
  choices: advanceChoices,
  posture: { id: "operator_review", choices: advanceChoices, next: "Recommended: Advance" },
  advance: { ok: true },
});
assert.equal(compat.kind, "mission_decision_cards");
assert.equal(compat.hasRecommendation, true);
assert.equal(compat.recommended?.buttonLabel, "Begin Implementation");

const blocked = missionContinuationVm(mid, {
  choices: [],
  posture: {
    id: "blocked",
    detail: "An assignment is blocked.",
    next: "Clear the blocker",
    primaryAction: { kind: "open_mission", label: "Open mission", href: `missions/${mid}`, missionId: mid },
  },
  advance: { ok: false },
});
assert.equal(blocked.continuationState, "blocked");
assert.equal(blocked.recommended?.buttonLabel, "Resolve Blockers");
assert.equal(
  inferRecommendedContinuationKind({ posture: { id: "blocked" }, choices: [] }),
  "resolve_blockers",
);

const parked = missionContinuationVm(mid, {
  choices: [],
  posture: {
    id: "paused",
    detail: "Assignments are paused.",
    needsYou: true,
    primaryAction: { kind: "resume_stalled", label: "Resume", missionId: mid },
  },
  advance: { ok: false },
});
assert.equal(parked.continuationState, "parked");
assert.equal(parked.recommended?.buttonLabel, "Resume Mission");
assert.equal(parked.recommended?.kind, "resume_stalled");

const done = missionContinuationVm(mid, {
  choices: [],
  posture: {
    id: "completed",
    detail: "You certified completion.",
    primaryAction: { kind: "open_mission", label: "View", missionId: mid },
  },
  advance: { ok: false },
});
assert.equal(done.continuationState, "completed_initiative");
assert.equal(done.recommended?.buttonLabel, "Begin Next Planned Mission");
assert.equal(done.recommended?.action?.kind, "open_missions");

const rejectedChoices = [
  { id: "more_work", kind: "reopen_work", label: "Need more work", missionId: mid },
  { id: "park", kind: "park_outcome", label: "Park", missionId: mid },
];
const rejectedPack = missionContinuationVm(mid, {
  choices: rejectedChoices,
  posture: { id: "operator_review", choices: rejectedChoices, next: "Choose next step" },
  advance: { ok: false },
});
assert.ok(rejectedPack.cards.some((c) => c.kind === "reopen_work"));

const ing = ingestMissionBrief({
  title: "DX-5.5 Continuation fixture",
  objective: "Prove recommended next action after discovery.",
  deliverables: ["Discovery package"],
  acceptance: ["Package reviewed"],
}, { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });
for (const a of listAssignments(missionId)) {
  updateAssignment(a.assignmentId, { status: "completed" });
  attachEvidence({
    missionId,
    assignmentId: a.assignmentId,
    type: "document",
    title: "Discovery notes",
    proves: "Package reviewed",
  });
}

const dash = missionDashboardVm(missionId);
assert.ok(dash, "dashboard vm available");
const l1 = composeExecutiveL1(missionId);
assert.equal(l1.continuation?.kind || l1.decisions?.kind, "mission_continuation");
assert.ok((l1.decisions?.cards || []).length >= 1, "continuation cards present");
if (l1.decisions?.hasRecommendation) {
  assert.ok(l1.decisions.recommended?.buttonLabel, "recommended has label");
  assert.ok(l1.decisions.whyRecommended || l1.decisions.recommended?.whyChoose, "why present");
}
const postureId = dash?.posture?.id;
assert.ok(
  (l1.decisions?.cards || []).some((c) => c.kind === "provide_feedback")
    || (l1.decisions?.cards || []).some((c) => c.kind === "review_findings")
    || !["operator_review", "awaiting_completion"].includes(postureId),
  "decision-moment alternatives include presentation actions when applicable",
);

console.log("mission-continuation-dx5-5.test.mjs: ok");
