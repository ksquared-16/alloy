/**
 * Productize Improve Vacilando & Mission Interpretation.
 * Run: node scripts/local-dev/tests/productize-improve-interp.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-prod-"));

const {
  ingestMissionBrief,
  approveMissionExecution,
  inferMissionTitle,
  interpretMissionBrief,
  reviewMissionReadiness,
} = await import("../lib/vacilando/mission-kickoff.mjs");
const {
  captureImprovement,
  interpretObservation,
  interruptToSeverity,
} = await import("../lib/vacilando/improvements.mjs");
const {
  timelineEventVm,
  deriveWorkerLifecycle,
  missionDashboardVm,
} = await import("../lib/vacilando/presentation/operator-views.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");
const { listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(interruptToSeverity("Blocked me") === "Blocker", "interrupt map");
assert(inferMissionTitle({ title: "Untitled Mission", objective: "Establish authority model for Alloy." })
  === "Establish authority model for Alloy", "infer title from objective");
assert(inferMissionTitle({ title: "Untitled", objective: "", plan: [{ title: "Authority Path Inventory" }] })
  === "Authority Path Inventory", "infer title from phase");

const untitledReady = reviewMissionReadiness({
  title: "Untitled Mission",
  objective: "Do the thing",
  plan: [{ phaseId: "p1", order: 1, title: "One", requiredOutputs: [], acceptanceCriteriaIds: ["AC1"] }],
  acceptanceCriteria: [{ id: "AC1", statement: "Done" }],
});
assert(untitledReady.ready === false, "untitled blocks readiness");
assert(untitledReady.directorAssessment === "Needs clarification", "needs clarification");

const brief = {
  title: "Access & Identity V2",
  objective: "Establish a grounded authority model for Alloy.",
  plan: [
    {
      phaseId: "p0", order: 1, title: "Authority Path Inventory",
      objective: "Inventory paths", requiredOutputs: ["inv.md"], acceptanceCriteriaIds: ["AC1"],
    },
    {
      phaseId: "p1", order: 2, title: "Canonical Authority Model",
      objective: "Model", requiredOutputs: ["model.md"], dependencies: ["p0"], acceptanceCriteriaIds: ["AC2"],
    },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory grounded" },
    { id: "AC2", statement: "Model documented" },
  ],
  constraints: [{ id: "C1", text: "No false completion" }],
};

const interp = interpretMissionBrief(brief);
assert(interp.directorAssessment === "Ready", "ready assessment");
assert(interp.recommendedWorkerDisciplines.length >= 1, "disciplines");
assert(interp.deliverables.length === 2, "deliverables");

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
assert(ingested.interpretation?.title === "Access & Identity V2", "ingest interpretation");
const mid = ingested.brief.missionId;
approveMissionExecution(mid, ingested.brief.version, { slot: 6, actor: "operator" });

const events = readTimeline(mid).map(timelineEventVm);
assert(events.some((e) => e.headline === "Director reviewed your Mission Brief"), "timeline story created");
assert(events.some((e) => e.headline === "You approved execution"), "timeline story approved");
assert(events.some((e) => /first workstream/i.test(e.headline)), "timeline story phase");

const asg = listAssignments(mid)[0];
const life = deriveWorkerLifecycle(asg, null);
assert(life.state === "assigning", `expected assigning, got ${life.state}`);
assert(life.label !== "Unassigned", "no bare Unassigned");

const dash = missionDashboardVm(mid);
assert(dash.summary.workerCountLabel !== "0 active" || dash.summary.executionLifecycle, "worker label explained");
assert(Array.isArray(dash.confidence.why) && dash.confidence.why.length >= 1, "confidence why");
assert(!/Unassigned/.test(dash.currentWork[0]?.handledByLabel || ""), "no Unassigned without explanation");

const obs = captureImprovement({
  whatHappened: "I approved the mission but had no idea if Claude actually started.",
  expectedBehavior: "I should see a worker starting on the first deliverable.",
  interrupt: "Significant",
  missionId: mid,
  currentScreen: "Mission Dashboard",
  currentSection: "Current Work",
  currentRoute: `#/missions/${mid}`,
});
assert(obs.severity === "High", "interrupt→severity");
assert(obs.directorInterpretation?.directorInterpretation, "director interpretation");
assert(/lifecycle|worker|visibility/i.test(obs.directorInterpretation.directorInterpretation), "interp content");
assert(obs.directorEnrichment?.confidencePercent != null, "confidence attached");

const di = interpretObservation({
  description: "I couldn't find the evidence",
  expectedBehavior: "Evidence should be obvious on the dashboard",
  category: "Evidence",
  severity: "Medium",
  screen: "Evidence",
});
assert(di.potentialFutureMission, "future mission suggestion");

console.log("productize-improve-interp.test.mjs: ok");
