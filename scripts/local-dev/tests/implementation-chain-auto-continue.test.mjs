/**
 * Implementation chain auto-continue after an accepted wave.
 * Run: node scripts/local-dev/tests/implementation-chain-auto-continue.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = mkdtempSync(join(os.tmpdir(), "vac-auto-chain-"));
process.env.ALLOY_RUNTIME_ROOT = root;
delete process.env.VACILANDO_AUTO_CONTINUE;

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const {
  advanceMissionToImplementation,
  continueImplementationChain,
  shouldAutoContinueImplementation,
  peekNextImplementationPhase,
} = await import("../lib/vacilando/mission-advance.mjs");
const { listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");
const { createDeliverableReview, getOpenDeliverableReview } = await import("../lib/vacilando/deliverable-review.mjs");

const brief = {
  title: "Auto chain mission",
  objective: "Test auto continue",
  plan: [{
    phaseId: "p1", order: 1, title: "Discovery",
    objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
  }],
  acceptanceCriteria: [{ id: "AC1", statement: "Done" }],
  constraints: [],
  sourceMaterials: [],
};

const ing = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });
const adv = advanceMissionToImplementation(missionId, { actor: "operator" });
assert.ok(adv.ok, adv.error || adv.detail);

const path = join(root, "vacilando", "assignments", `${missionId}.json`);
const store = JSON.parse(readFileSync(path, "utf8"));
for (const a of store.assignments) {
  if (["impl_w0", "impl_w1", "impl_w1b", "impl_w2"].includes(a.phaseId)) {
    a.status = "complete";
    a.completionReport = {
      summary: "done",
      recommendation: "Accept deliverable",
      acceptanceCriteriaResults: [{ id: "AC", status: "met" }],
      status: "complete",
    };
  }
}
writeFileSync(path, JSON.stringify(store, null, 2));

assert.equal(shouldAutoContinueImplementation(missionId).ok, true);
assert.equal(peekNextImplementationPhase(missionId)?.phaseId, "impl_w2b");

const w5 = listAssignments(missionId).find((a) => a.phaseId === "impl_w2");
createDeliverableReview(missionId, w5.assignmentId, { actor: "director", force: true });

const out = continueImplementationChain(missionId, {
  fromAssignmentId: w5.assignmentId,
  actor: "director",
});
assert.ok(out.ok, out.reason || out.detail);
assert.ok(out.continued, "should open next wave");
assert.equal(out.opened?.readyAssignment?.phaseId || out.opened?.phase?.phaseId, "impl_w2b");
assert.equal(getOpenDeliverableReview(missionId), null, "open review should be auto-accepted");

const w6 = listAssignments(missionId).find((a) => a.phaseId === "impl_w2b");
assert.ok(w6);
assert.equal(w6.status, "ready");

console.log("implementation-chain-auto-continue.test.mjs: ok", {
  missionId,
  next: w6.title,
  status: w6.status,
});
process.exit(0);
