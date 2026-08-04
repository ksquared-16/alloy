/**
 * DX-4 Mission Journey — presentation adapters only.
 * Run: node scripts/local-dev/tests/mission-journey-dx4.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx4-"));

const {
  missionJourneyVm,
  missionJourneyStripVm,
} = await import("../lib/vacilando/presentation/mission-journey.mjs");
const { composeExecutiveL1 } = await import("../lib/vacilando/presentation/executive-overview.mjs");
const { timelinePageVm, missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { listAssignments, updateAssignment } = await import("../lib/vacilando/worker-assignment.mjs");

const brief = {
  title: "DX-4 Mission Journey Fixture",
  objective: "Explain operational progress without redesigning the engine.",
  plan: [
    {
      phaseId: "p1",
      order: 1,
      title: "Discovery",
      objective: "Discover architecture",
      requiredOutputs: ["discovery.md"],
      acceptanceCriteriaIds: ["AC1"],
    },
    {
      phaseId: "p2",
      order: 2,
      title: "Implementation",
      objective: "Deliver the slice",
      requiredOutputs: ["impl.md"],
      acceptanceCriteriaIds: ["AC2"],
    },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Architecture understood" },
    { id: "AC2", statement: "Slice delivered" },
  ],
  constraints: [],
  sourceMaterials: [],
};

const ingested = ingestMissionBrief(brief, { slot: 2, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 2, actor: "operator" });

const journey = missionJourneyVm(missionId);
assert.equal(journey.kind, "mission_journey");
assert.ok(journey.stages.length >= 2, "kickoff + plan phases");
assert.equal(journey.stages[0].id, "mission_kickoff");
assert.equal(journey.stages[0].status, "complete", "kickoff complete after approve");
assert.ok(journey.stages.some((s) => s.title === "Discovery"));
assert.ok(journey.stages.some((s) => s.title === "Implementation"));
assert.ok(journey.currentStageId, "current stage marked");
assert.match(journey.youAreHereLabel, /You are here/i);
assert.equal(journey.stages.filter((s) => s.status === "current").length, 1, "exactly one current");

const strip = missionJourneyStripVm(missionId);
assert.equal(strip.kind, "mission_journey_strip");
assert.ok(strip.rail.length >= 2);
assert.ok(strip.rail.some((r) => r.current || r.status === "current"));

const l1 = composeExecutiveL1(missionId);
assert.equal(l1.journey?.kind, "mission_journey_strip");
assert.ok(l1.journey.rail.length >= 2);

const dash = missionDashboardVm(missionId);
assert.equal(dash.journey?.kind, "mission_journey");
assert.equal(dash.executive?.journey?.kind, "mission_journey_strip");

const page = timelinePageVm(missionId);
assert.equal(page.kind, "timeline_page");
assert.ok(page.journey?.stages?.length >= 2, "timeline page nests journey");
assert.ok(Array.isArray(page.events), "engineering events still present");

// Complete Discovery → current should advance
const asgs = listAssignments(missionId);
const discovery = asgs.filter((a) => a.phaseId === "p1");
assert.ok(discovery.length >= 1, "discovery assignments exist");
for (const a of discovery) {
  updateAssignment(missionId, a.assignmentId, (row) => {
    row.status = "complete";
    row.summary = "Fixture discovery complete";
  });
}
const afterDiscovery = missionJourneyVm(missionId);
const disc = afterDiscovery.stages.find((s) => s.id === "p1" || s.title === "Discovery");
assert.equal(disc?.status, "complete");
assert.ok(disc?.outcome, "completed phase has outcome");
assert.ok(disc?.decisionProduced, "completed phase exposes decision produced");
const current = afterDiscovery.stages.find((s) => s.status === "current");
assert.ok(current, "still has a current stage after discovery completes");
assert.notEqual(current.id, disc.id, "current is not the completed discovery phase");
// Completing discovery often opens deliverable certification — that is the operational "here".
assert.ok(
  current.kind === "certification" || current.title === "Implementation" || current.kind === "plan_phase",
  `expected cert or next plan phase, got ${current.id}`,
);

// Each stage answers Outcome / Decision / Next shape
for (const s of afterDiscovery.stages) {
  assert.ok(s.title && s.status && s.outcome != null, `stage ${s.id} has title/status/outcome`);
}

console.log("mission-journey-dx4: ok");
console.log(JSON.stringify({
  missionId,
  youAreHere: afterDiscovery.youAreHereLabel,
  stages: afterDiscovery.stages.map((s) => ({
    id: s.id, title: s.title, status: s.status, outcome: s.outcome,
  })),
}, null, 2));
// Some Vacilando imports leave open handles (kqueue); exit explicitly like a CLI probe.
process.exit(0);
