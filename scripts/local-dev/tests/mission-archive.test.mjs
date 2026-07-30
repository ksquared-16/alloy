/**
 * Mission archive — active list excludes archived; history retains them.
 * Run: node scripts/local-dev/tests/mission-archive.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "vac-archive-"));
process.env.ALLOY_RUNTIME_ROOT = root;
process.env.VACILANDO_AUTO_DISPATCH = "0";

const { createMission, updateMission, getMission } = await import("../lib/vacilando/commands/missions.mjs");
const { createBrief } = await import("../lib/vacilando/mission-brief.mjs");
const {
  archiveMission,
  restoreMission,
  isMissionArchived,
  archiveValidationMissionsForCloseout,
  classifyMissionForCloseout,
} = await import("../lib/vacilando/mission-archive.mjs");
const { listMissionsV2 } = await import("../lib/vacilando/director-summary.mjs");
const { missionsHomeVm, listNeedsYou } = await import("../lib/vacilando/presentation/operator-views.mjs");
const {
  captureImprovement,
  improvementsHomeVm,
  listImprovements,
} = await import("../lib/vacilando/improvements.mjs");

const active = createMission({
  slot: 6,
  worktree: root,
  provider: "claude",
  title: "Real Product Mission",
  objective: "Stay active after closeout",
});
createBrief({
  missionId: active.mission_id,
  title: "Real Product Mission",
  objective: "Stay active after closeout",
  plan: [],
  acceptanceCriteria: [],
});
const validation = createMission({
  slot: 6,
  worktree: root,
  provider: "claude",
  title: "Access & Identity V2 — Operational Closeout",
  objective: "Runtime validation proof",
});
createBrief({
  missionId: validation.mission_id,
  title: "Access & Identity V2 — Operational Closeout",
  objective: "Runtime validation proof",
  plan: [],
  acceptanceCriteria: [],
});
updateMission(validation.mission_id, { status: "awaiting_completion_approval" });

const cls = classifyMissionForCloseout(validation.mission_id);
assert.equal(cls.classification, "accepted_certification_record");

const entry = archiveMission(validation.mission_id, {
  reason: cls.reason,
  archiveClass: cls.archiveClass,
  classification: cls.classification,
  actor: "test",
});
assert.equal(entry.status, "archived");
assert.equal(isMissionArchived(validation.mission_id), true);
assert.equal(getMission(validation.mission_id).archived, true);

const activeOnly = listMissionsV2({ includeArchived: false });
assert.ok(activeOnly.every((m) => m.mission_id !== validation.mission_id), "archived excluded from active list");
assert.ok(activeOnly.some((m) => m.mission_id === active.mission_id), "real mission remains active");

const homeActive = missionsHomeVm({ filter: "active" });
assert.equal(homeActive.activeCount, 1);
assert.ok(!homeActive.missions.some((m) => m.missionId === validation.mission_id));

const homeHist = missionsHomeVm({ filter: "archived" });
assert.ok(homeHist.missions.some((m) => m.missionId === validation.mission_id && m.archived));
assert.ok(homeHist.archivedCount >= 1);

const needs = listNeedsYou();
assert.ok(!needs.some((n) => n.missionId === validation.mission_id), "Needs Me ignores archived");

const rec = captureImprovement({
  whatHappened: "Validation observation from archived mission",
  expectedBehavior: "Keep linked after archive",
  interrupt: "Moderate",
  missionId: validation.mission_id,
  createdBy: "test",
});
assert.ok(rec.id?.startsWith("imp_"), "improvement captured");

const impActive = improvementsHomeVm({ missionScope: "active" });
assert.ok(!impActive.improvements.some((i) => i.id === rec.id));

const impArch = improvementsHomeVm({ missionScope: "archived" });
assert.ok(impArch.improvements.some((i) => i.id === rec.id));
assert.ok(listImprovements({ missionId: validation.mission_id }).length >= 1, "improvements preserved");

restoreMission(validation.mission_id, { actor: "test" });
assert.equal(isMissionArchived(validation.mission_id), false);

archiveMission(validation.mission_id, { reason: "re-test", archiveClass: "runtime_validation" });
const batch = archiveValidationMissionsForCloseout({ actor: "test" });
assert.ok(batch.ok);
assert.ok(batch.skipped.some((s) => s.missionId === validation.mission_id && s.reason === "already_archived"));

rmSync(root, { recursive: true, force: true });
console.log("mission-archive.test.mjs: ok");
