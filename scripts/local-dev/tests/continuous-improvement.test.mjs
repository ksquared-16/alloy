/**
 * Continuous Improvement runtime — capture, enrich, list, timeline.
 * Run: node scripts/local-dev/tests/continuous-improvement.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-ci-"));

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");
const {
  captureImprovement,
  listImprovements,
  getImprovement,
  updateImprovement,
  inferImprovementCategory,
  improvementsHomeVm,
  purgeMissionRuntime,
} = await import("../lib/vacilando/improvements.mjs");
const { handleV2Post, handleV2Get } = await import("../lib/vacilando/v2-api.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

assert(inferImprovementCategory({ title: "Ask Director wording is confusing" }) === "Director"
  || inferImprovementCategory({ title: "Ask Director wording is confusing" }) === "Communication",
  "infer category from wording");

const brief = {
  title: "Access & Identity V2",
  objective: "CI validation mission",
  plan: [
    {
      phaseId: "p1",
      order: 1,
      title: "Authority Path Inventory",
      objective: "Inventory",
      requiredOutputs: ["inventory.md"],
      acceptanceCriteriaIds: ["AC1"],
    },
  ],
  acceptanceCriteria: [{ id: "AC1", statement: "Inventory grounded" }],
  constraints: [{ id: "C1", text: "No false completion" }],
};

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 6, actor: "operator" });

const rec = captureImprovement({
  title: "Needs Me urgency labels unclear",
  description: "Could not tell which Needs Me item was blocking vs advisory.",
  expectedBehavior: "Urgency should map to plain language (blocks work / waiting on me).",
  severity: "Medium",
  missionId,
  currentScreen: "Mission Dashboard",
  currentSection: "Needs Me",
  currentRoute: `#/missions/${missionId}`,
  createdBy: "operator",
});

assert(rec.id?.startsWith("imp_"), "id assigned");
assert(rec.missionTitle === "Access & Identity V2", "mission title enriched");
assert(rec.currentPhase, "phase enriched");
assert(rec.category, "category inferred");
assert(rec.status === "New", "status New");
assert(getImprovement(rec.id)?.title === rec.title, "persists");

const events = readTimeline(missionId);
assert(events.some((e) => e.type === "improvement_captured"), "timeline event");

const listed = listImprovements({ missionId });
assert(listed.length === 1, "list by mission");

const home = improvementsHomeVm();
assert(home.improvements[0].title === rec.title, "home vm");

const patched = updateImprovement(rec.id, { status: "Reviewed" });
assert(patched.ok && patched.improvement.status === "Reviewed", "status update");

const apiPost = await handleV2Post("/api/v2/improvements", {
  title: "Timeline headlines too technical",
  description: "Operator-facing timeline still shows engineer jargon.",
  expected_behavior: "Plain operator headlines only.",
  severity: "Low",
  mission_id: missionId,
  current_screen: "Timeline",
  current_route: `#/timeline/${missionId}`,
});
assert(apiPost.status === 201 && apiPost.body.ok, "POST improvements");

const apiGet = handleV2Get("/api/v2/views/improvements", new URL("http://x/api/v2/views/improvements"));
assert(apiGet.status === 200 && apiGet.body.improvements.length >= 2, "GET improvements");

const purged = purgeMissionRuntime(missionId);
assert(purged.ok, "purge ok");
assert(listImprovements({ missionId }).length >= 1, "observations retained after purge");

console.log("continuous-improvement.test.mjs: ok");
