/**
 * Director Experience V2 — DX-1 + DX-3 presentation adapters.
 * Run: node scripts/local-dev/tests/executive-overview-dx1-dx3.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx13-"));

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { listAssignments, updateAssignment } = await import("../lib/vacilando/worker-assignment.mjs");
const { attachEvidence } = await import("../lib/vacilando/evidence.mjs");
const { missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const {
  composeExecutiveL1,
  missionDecisionCardsVm,
  missionOutcomeHeroVm,
  confidenceGlanceVm,
} = await import("../lib/vacilando/presentation/executive-overview.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// --- Pure presentation: decision cards from known posture choices ---
const mid = "msn_fixture_dx13";
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

const advancePack = missionDecisionCardsVm(mid, {
  choices: advanceChoices,
  posture: {
    id: "operator_review",
    next: "Recommended: Advance to implementation on this mission",
    secondaryAction: { kind: "advance_implementation", label: "Advance to implementation", missionId: mid },
    choices: advanceChoices,
  },
  advance: { ok: true },
});

assert(advancePack.hasRecommendation, "advance recommended when advance.ok");
assert(advancePack.recommended?.kind === "advance_implementation", "recommended kind");
assert(advancePack.recommended?.buttonLabel === "Begin implementation", "explicit Begin implementation CTA");
assert(advancePack.primaryAction?.kind === "advance_implementation", "primary action kind");
assert(!advancePack.cards.some((c) => /Review outcome/i.test(c.buttonLabel)), "no Review outcome");
assert(advancePack.alternatives.length === 3, "three alternatives");
assert(advancePack.recommended.workLaunches === true, "advance launches work");
assert(advancePack.alternatives.find((c) => c.kind === "park_outcome")?.workLaunches === false, "park does not launch");

const discoveryHero = missionOutcomeHeroVm(mid, {
  posture: {
    id: "operator_review",
    label: "Waiting on you",
    detail: "Discovery finished.",
    next: "Recommended: Advance",
    busy: false,
    needsYou: true,
  },
  advance: { ok: true },
  progress: { accepted_deliverables: 4, total_deliverables: 4 },
});
assert(discoveryHero.stateId === "ready_implementation", `got ${discoveryHero.stateId}`);
assert(/Ready for implementation/i.test(discoveryHero.label), "outcome label");

const pausedHero = missionOutcomeHeroVm(mid, {
  posture: { id: "paused", label: "Paused", detail: "Assignments are paused.", busy: false, needsYou: true },
  advance: { ok: false },
});
assert(pausedHero.stateId === "parked", `paused → parked, got ${pausedHero.stateId}`);

const certGlance = confidenceGlanceVm(mid, {
  reviewVm: {
    kind: "deliverable_review",
    operatorMayApprove: true,
    waveLabel: "W-4",
    certification: { confidence: { pct: 97, reasons: ["Evidence covers criteria"] } },
    directorRecommendation: { headline: "Approve W-4", confidencePct: 97 },
  },
  missionConfidence: { percent: 71, bandLabel: "Moderate" },
});
assert(certGlance.primaryKind === "certification", "cert is primary when review open");
assert(certGlance.percent === 97, "cert percent");
assert(/Mission confidence/.test(certGlance.secondaryNote || ""), "mission conf demoted to note");

const closeChoices = [
  {
    id: "close",
    kind: "certify_completion",
    label: "Accept and close",
    explanation: "Certify completion and close.",
    missionId: mid,
  },
  {
    id: "more_work",
    kind: "reopen_work",
    label: "Need more work",
    explanation: "Reopen so a worker can continue.",
    missionId: mid,
  },
  {
    id: "park",
    kind: "park_outcome",
    label: "Park for later",
    explanation: "Stay idle.",
    missionId: mid,
  },
];
const closePack = missionDecisionCardsVm(mid, {
  choices: closeChoices,
  posture: { id: "awaiting_completion", next: "Choose next step", choices: closeChoices },
  advance: { ok: false },
});
assert(closePack.cards.find((c) => c.kind === "certify_completion")?.buttonLabel === "Accept and close", "accept/close copy");
assert(closePack.cards.find((c) => c.kind === "reopen_work")?.buttonLabel === "Continue discovery", "continue discovery copy");

// --- Integration smoke: dashboard nests executive L1 ---
const brief = {
  title: "DX-1 Executive Overview Fixture",
  objective: "Prove Director can see outcome and decisions in under 30 seconds.",
  plan: [
    {
      phaseId: "p1",
      order: 1,
      title: "Discovery",
      objective: "Discover",
      requiredOutputs: ["discovery.md"],
      acceptanceCriteriaIds: ["AC1"],
    },
  ],
  acceptanceCriteria: [{ id: "AC1", statement: "Discovery documented" }],
  constraints: [],
  sourceMaterials: [],
};

const ingested = ingestMissionBrief(brief, { slot: 2, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 2, actor: "operator" });
for (const a of listAssignments(missionId)) {
  updateAssignment(missionId, a.assignmentId, (row) => {
    row.status = "complete";
    row.summary = "Fixture discovery complete";
  });
}
attachEvidence({
  missionId,
  type: "diff",
  title: "Discovery note",
  description: "Proves AC1",
  fileUri: "/tmp/hidden-from-l1.md",
  acceptanceCriteriaIds: ["AC1"],
  createdBy: "fixture",
});

const dash = missionDashboardVm(missionId);
assert(dash.executive?.kind === "executive_l1", "dashboard nests executive L1");
assert(dash.executive.outcome?.label, "outcome label on dashboard");
assert(dash.executive.overview?.blocks?.length === 6, "six executive blocks");
assert(dash.executive.evidence, "evidence strip");
assert(
  !JSON.stringify(dash.executive.overview).includes("/tmp/"),
  "L1 overview must not leak evidence paths",
);
assert(dash.executive.confidence?.primaryKind, "confidence glance");

const l1 = composeExecutiveL1(missionId);
assert(l1.depthHint, "depth hint");
if (l1.decisions.hasRecommendation) {
  assert(l1.primaryAction?.kind !== "review_outcome", "recommended primary is not Review outcome");
}

console.log("executive-overview-dx1-dx3: ok", {
  missionId,
  outcome: dash.executive.outcome.stateId,
  primary: dash.summary.primaryAction?.kind,
  recommended: advancePack.recommended?.kind,
  cardButtons: advancePack.cards.map((c) => c.buttonLabel),
});
