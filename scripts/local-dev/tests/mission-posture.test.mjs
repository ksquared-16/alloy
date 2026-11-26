/**
 * Mission posture — single operator-facing truth.
 */
import assert from "node:assert/strict";
import os from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";

/*
 * SEED THE MISSION THIS TEST MEASURES.
 *
 * It used a hard-coded mission id and read whatever the ambient runtime store
 * happened to contain. On this host that mission no longer exists, so
 * missionDashboardVm returned a record with a null summary and the test died on
 * a TypeError; on a clean runner it could never have passed at all. The posture
 * assertions above it still passed, because an unknown mission gets a default
 * posture - so the file reported a crash rather than the absence it had found.
 *
 * Dispatch stays off: approving a mission schedules real work otherwise.
 */
process.env.VACILANDO_AUTO_DISPATCH = "0";
process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-posture-"));

const { deriveMissionPosture } = await import("../lib/vacilando/mission-posture.mjs");
const { missionListCardVm, listNeedsYou, missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");

const ingested = ingestMissionBrief({
  title: "Posture fixture",
  // At least 24 characters, or the compiler refuses the brief as ambiguous.
  objective: "Prove posture and dashboard agree",
  plan: [{ phaseId: "p1", order: 1, title: "Work", objective: "Do the work", requiredOutputs: ["code"], acceptanceCriteriaIds: ["AC1"] }],
  acceptanceCriteria: [{ id: "AC1", statement: "It works" }],
  executionPreferences: { mergeTarget: "staging", maxConcurrentWorkers: 1 },
}, { slot: 6, actor: "operator" });
approveMissionExecution(ingested.brief.missionId, ingested.brief.version, { slot: 6, actor: "operator" });
const mid = ingested.brief.missionId;

const posture = deriveMissionPosture(mid);
assert.ok(posture?.id, "posture has id");
assert.ok(posture.label, "posture has label");
assert.ok(posture.detail, "posture has detail");
assert.ok(posture.primaryAction?.label, "posture has primary action");

// Contradiction guard: never claim busy + idle workers with "deliverables complete" copy.
if (posture.id === "operator_review") {
  assert.equal(posture.busy, false, "operator_review is not busy");
  assert.equal(posture.needsYou, true, "operator_review needs you");
  assert.match(posture.label, /Waiting on you/i);
  assert.doesNotMatch(posture.next || "", /deliverables complete/i);
}

// Overnight / dead-worker honesty: claimed-running without heartbeat is not "In progress".
// Director auto-resumes; Needs You only after recovery is exhausted.
if (posture.id === "worker_silent") {
  assert.equal(posture.busy, false, "silent worker is not busy");
  assert.doesNotMatch(posture.detail || "", /actively executing/i);
  if (posture.needsYou) {
    assert.equal(posture.primaryAction?.kind, "resume_stalled");
    assert.match(posture.label, /silent/i);
  } else {
    assert.match(posture.label, /recovering|silent/i);
    assert.match(posture.next || "", /Director is relaunching/i);
  }
}

const card = missionListCardVm(mid);
assert.equal(card.statusLabel, posture.label, "list card label matches posture");
assert.equal(card.primaryAction?.label, posture.primaryAction?.label, "list card action matches posture");
assert.equal(card.workersLine, posture.workersLine, "workers line matches posture");
if (posture.needsYou) {
  assert.doesNotMatch(card.directorState || "", /Mission deliverables complete/i);
}

const dash = missionDashboardVm(mid);
assert.equal(dash.summary.statusLabel, posture.label, "dashboard status matches posture");
if (!posture.busy) {
  assert.equal(dash.summary.activeWorkers, 0, "no fake active workers when not busy");
  assert.doesNotMatch(dash.director.assessment || "", /actively executing/i);
}
if (posture.id === "worker_silent") {
  if (posture.needsYou) {
    assert.match(String(dash.director.recoveries || []), /Silent|Resume/i);
    assert.doesNotMatch(String(dash.director.recoveries || []), /no action needed from you/i);
  } else {
    assert.match(String(dash.director.recoveries || dash.director.assessment || posture.next || ""), /relaunch|recover|Resume/i);
  }
}

const needs = listNeedsYou().filter((n) => n.missionId === mid);
if (posture.needsYou) {
  assert.ok(needs.length >= 1, "Needs You includes this mission when posture.needsYou");
} else {
  assert.ok(!needs.some((n) => n.type === "operator_review" || n.type === "worker_silent"), "no false need");
}

console.log(JSON.stringify({
  ok: true,
  postureId: posture.id,
  label: posture.label,
  action: posture.primaryAction?.label,
  needsYou: posture.needsYou,
  needsCount: needs.length,
  workersLine: posture.workersLine,
  activeWorkers: dash.summary.activeWorkers,
}, null, 2));
