/**
 * Mission posture — single operator-facing truth.
 */
import assert from "node:assert/strict";
import { deriveMissionPosture } from "../lib/vacilando/mission-posture.mjs";
import { missionListCardVm, listNeedsYou, missionDashboardVm } from "../lib/vacilando/presentation/operator-views.mjs";

const mid = "msn_2d054741a54698fa4c";

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
