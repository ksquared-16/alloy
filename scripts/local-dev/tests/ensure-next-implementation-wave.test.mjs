/**
 * Next-wave open (Wave 2 / W-5) after Wave 1 complete.
 * Run: node scripts/local-dev/tests/ensure-next-implementation-wave.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = mkdtempSync(join(os.tmpdir(), "vac-wave-next-"));
process.env.ALLOY_RUNTIME_ROOT = root;

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const {
  parseWaveStartIntent,
  ensureNextImplementationWave,
  advanceMissionToImplementation,
} = await import("../lib/vacilando/mission-advance.mjs");
const { listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");
const { classifyMissionComposerIntent } = await import("../lib/vacilando/mission-conversation-director.mjs");

assert.deepEqual(parseWaveStartIntent("open and start wave 2 - w5"), { wave: 2, workstream: 5 });
assert.equal(classifyMissionComposerIntent("open and start wave 2 - w5").mode, "action");
assert.equal(
  parseWaveStartIntent("Continue Access & Identity V2 from the completed W-0…W-12 implementation tranche through promotion"),
  null,
  "promotion brief must not parse as open W-0",
);
assert.deepEqual(parseWaveStartIntent("continue"), { wave: "next", workstream: null });
assert.deepEqual(parseWaveStartIntent("next wave"), { wave: "next", workstream: null });

const brief = {
  title: "Identity wave advance test",
  objective: "Test next wave open",
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

// Mark wave 0–1b complete so W-5 can open ready.
const path = join(root, "vacilando", "assignments", `${missionId}.json`);
const store = JSON.parse(readFileSync(path, "utf8"));
for (const a of store.assignments) {
  if (["impl_w0", "impl_w1", "impl_w1b"].includes(a.phaseId)) {
    a.status = "complete";
    a.completionReport = { summary: "done", recommendation: "Accept deliverable" };
  }
}
writeFileSync(path, JSON.stringify(store, null, 2));

const opened = ensureNextImplementationWave(missionId, {
  actor: "operator",
  waveHint: parseWaveStartIntent("start wave 2 w5"),
});
assert.ok(opened.ok, opened.error || opened.detail);
assert.equal(opened.readyAssignment?.phaseId || opened.phase?.phaseId, "impl_w2");
assert.ok(opened.readyAssignment, "W-5 must be ready when deps complete");
assert.equal(opened.readyAssignment.status, "ready");
assert.equal(opened.nextAction?.kind, "dispatch_ready");

const again = ensureNextImplementationWave(missionId, {
  actor: "operator",
  waveHint: { wave: 2, workstream: 5 },
});
assert.ok(again.ok && again.reused);

console.log("ensure-next-implementation-wave.test.mjs: ok", {
  missionId,
  w5: opened.readyAssignment.title,
  status: opened.readyAssignment.status,
});
process.exit(0);
