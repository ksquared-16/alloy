/**
 * DX-2 Explained Confidence — presentation adapters only.
 * Run: node scripts/local-dev/tests/explained-confidence-dx2.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx2-"));

const {
  explainMissionFactors,
  explainedConfidenceVm,
} = await import("../lib/vacilando/presentation/explained-confidence.mjs");
const { composeExecutiveL1 } = await import("../lib/vacilando/presentation/executive-overview.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { listAssignments, updateAssignment } = await import("../lib/vacilando/worker-assignment.mjs");
const { attachEvidence } = await import("../lib/vacilando/evidence.mjs");
const { getMissionConfidence, CONFIDENCE_WEIGHTS } = await import("../lib/vacilando/mission-confidence.mjs");
const { missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");

// --- Pure factor explanation ---
const highFactors = {
  architecture: { score: 90, note: "4 phases · 8 acceptance criteria" },
  implementation: { score: 88, note: "12 of 12 deliverables accepted" },
  evidence: { score: 85, note: "8 of 8 criteria covered by evidence" },
  qa: { score: 80, note: "3/3 validation runs passed · 5 QA artifacts" },
  worker_health: { score: 95, note: "2 workers healthy" },
  dependencies: { score: 90, note: "Dependencies clear" },
};
const high = explainMissionFactors(highFactors, CONFIDENCE_WEIGHTS);
assert.equal(high.supporting.length, 6, "all supporting when high");
assert.equal(high.reducing.length, 0);
assert.equal(high.remainingUncertainty.length, 0);
assert.equal(high.increaseConfidence.length, 0);

const lowFactors = {
  architecture: { score: 40, note: "Brief incomplete" },
  implementation: { score: 20, note: "No deliverables assigned yet" },
  evidence: { score: 25, note: "No acceptance criteria mapped yet" },
  qa: { score: 30, note: "No validation or QA evidence yet" },
  worker_health: { score: 70, note: "No worker telemetry yet" },
  dependencies: { score: 60, note: "No dependency graph yet" },
};
const low = explainMissionFactors(lowFactors, CONFIDENCE_WEIGHTS);
assert.ok(low.supporting.some((s) => s.id === "worker_health"), "healthy factor supports");
assert.ok(low.reducing.length >= 4, "low factors reduce");
assert.ok(low.remainingUncertainty.some((u) => u.blocking), "blocking uncertainty present");
assert.ok(low.increaseConfidence.every((x) => x.what && x.why && x.expectedImprovement), "increase steps actionable");
assert.ok(low.reducing.every((r) => lowFactors[r.id]), "reducing traces to engine factors");

const midFactors = {
  architecture: { score: 75, note: "2 phases · 2 acceptance criteria" },
  implementation: { score: 55, note: "2 of 4 deliverables accepted" },
  evidence: { score: 50, note: "1 of 2 criteria covered by evidence" },
  qa: { score: 45, note: "1 QA artifacts · no formal validation runs" },
  worker_health: { score: 80, note: "1 worker healthy" },
  dependencies: { score: 70, note: "Dependencies clear" },
};
const mid = explainMissionFactors(midFactors, CONFIDENCE_WEIGHTS);
assert.ok(mid.supporting.length >= 2);
assert.ok(mid.reducing.length >= 2);
assert.ok(mid.remainingUncertainty.length >= 2);

// Injected mission confidence snapshot (no math change — presentation only)
const fakeMcHigh = {
  percent: 88,
  band: "high",
  bandLabel: "High confidence",
  factors: highFactors,
  weights: CONFIDENCE_WEIGHTS,
  certification_ready: false,
};
const explHigh = explainedConfidenceVm("msn_fake", {
  missionConfidence: fakeMcHigh,
  decisions: {
    recommended: {
      buttonLabel: "Begin implementation",
      whyChoose: "Discovery is complete enough.",
    },
  },
});
assert.equal(explHigh.kind, "explained_confidence");
assert.equal(explHigh.primaryKind, "mission");
assert.equal(explHigh.percent, 88);
assert.equal(explHigh.recommendation.verb, "Begin implementation");
assert.equal(explHigh.supporting.length, 6);
assert.equal(explHigh.blocking, false);

const fakeMcLow = {
  percent: 32,
  band: "at_risk",
  bandLabel: "At risk",
  factors: lowFactors,
  weights: CONFIDENCE_WEIGHTS,
  certification_ready: false,
};
const explLow = explainedConfidenceVm("msn_fake_low", { missionConfidence: fakeMcLow });
assert.equal(explLow.percent, 32);
assert.match(explLow.recommendation.verb, /uncertainty|ready/i);
assert.equal(explLow.blocking, true);
assert.ok(explLow.increaseConfidence.length >= 1);

const fakeMcMid = {
  percent: 53,
  band: "developing",
  bandLabel: "Developing",
  factors: midFactors,
  weights: CONFIDENCE_WEIGHTS,
  certification_ready: false,
};
const explMid = explainedConfidenceVm("msn_fake_mid", { missionConfidence: fakeMcMid });
assert.equal(explMid.percent, 53);
assert.match(explMid.recommendation.verb, /accept remaining uncertainty|Proceed/i);
assert.ok(explMid.remainingUncertainty.length >= 1);

// Certification primary — reasons from review VM, mission % demoted
const certExpl = explainedConfidenceVm("msn_fake_cert", {
  reviewVm: {
    kind: "deliverable_review",
    operatorMayApprove: true,
    waveLabel: "W-4",
    stuck: false,
    certification: {
      confidence: {
        pct: 97,
        reasons: ["Evidence covers acceptance criteria", "Tests green"],
      },
    },
    directorRecommendation: { headline: "Approve W-4", summary: "Ready to certify" },
    residualRisks: ["Allowlisted exceptions deferred"],
    blockersPlain: [],
  },
  missionConfidence: fakeMcMid,
});
assert.equal(certExpl.primaryKind, "certification");
assert.equal(certExpl.percent, 97);
assert.match(certExpl.recommendation.verb, /Certify W-4/);
assert.ok(certExpl.secondaryNote.includes("Mission confidence 53%"));
assert.ok(certExpl.supporting.some((s) => /Evidence covers/.test(s.text)));

// Integration: dashboard L1 nests explained confidence; Depth still has raw factors
const brief = {
  title: "DX-2 Explained Confidence Fixture",
  objective: "Explain confidence without changing the engine.",
  plan: [
    {
      phaseId: "p1",
      order: 1,
      title: "Discovery",
      objective: "Discover",
      requiredOutputs: ["a.md"],
      acceptanceCriteriaIds: ["AC1"],
    },
  ],
  acceptanceCriteria: [{ id: "AC1", statement: "Documented" }],
  constraints: [],
  sourceMaterials: [],
};
const ingested = ingestMissionBrief(brief, { slot: 2, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 2, actor: "operator" });
for (const a of listAssignments(missionId)) {
  updateAssignment(missionId, a.assignmentId, (row) => {
    row.status = "complete";
    row.summary = "done";
  });
}
attachEvidence({
  missionId,
  type: "diff",
  title: "Note",
  description: "Proves AC1",
  acceptanceCriteriaIds: ["AC1"],
  createdBy: "fixture",
});

const mc = getMissionConfidence(missionId);
const l1 = composeExecutiveL1(missionId, { missionConfidence: mc });
assert.equal(l1.confidence.kind, "explained_confidence");
assert.ok(l1.confidence.percent != null);
assert.ok(l1.confidence.recommendation?.verb);
assert.ok(Array.isArray(l1.confidence.supporting));
assert.ok(Array.isArray(l1.confidence.remainingUncertainty));
assert.ok(Array.isArray(l1.confidence.increaseConfidence));

const dash = missionDashboardVm(missionId);
assert.equal(dash.executive.confidence.kind, "explained_confidence");
assert.ok(dash.confidence.factors?.length >= 1, "Depth raw factors still on dashboard.confidence");
assert.ok(dash.confidence.percent != null, "Depth still exposes mission percent");
assert.ok(dash.executive.confidence.engineRef?.missionPercent != null
  || dash.executive.confidence.primaryKind === "certification",
"L1 traces to mission engine or cert primary");

// Engine weights untouched
assert.deepEqual(
  { ...CONFIDENCE_WEIGHTS },
  {
    architecture: 0.15,
    implementation: 0.25,
    evidence: 0.20,
    qa: 0.15,
    worker_health: 0.15,
    dependencies: 0.10,
  },
);

console.log("explained-confidence-dx2: ok", {
  missionId,
  percent: l1.confidence.percent,
  band: l1.confidence.band,
  supporting: l1.confidence.supporting.length,
  reducing: l1.confidence.reducing.length,
  uncertainty: l1.confidence.remainingUncertainty.length,
  recommendation: l1.confidence.recommendation.verb,
});
