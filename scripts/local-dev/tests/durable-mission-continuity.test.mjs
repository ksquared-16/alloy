/**
 * Durable Mission continuity — register complete ≠ Mission complete / Waiting on you.
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = mkdtempSync(join(tmpdir(), "vac-durable-"));
process.env.ALLOY_RUNTIME_ROOT = root;

mkdirSync(join(root, "vacilando", "assignments"), { recursive: true });
mkdirSync(join(root, "vacilando", "missions"), { recursive: true });

const { createMission, updateMission, getMission } = await import("../lib/vacilando/commands/missions.mjs");
const created = createMission({
  slot: 6,
  provider: "cursor",
  title: "Identity Platform Fixture",
  objective: "Durable mission continuity fixture",
  status: "running",
});
const missionId = created.mission_id;
updateMission(missionId, {
  status: "executing",
  kickoff_status: "executing",
  stage: "implementation",
});

const phases = [
  "impl_w0", "impl_w1", "impl_w1b", "impl_w2", "impl_w2b", "impl_w2c", "impl_w2d",
  "impl_w3", "impl_w3b", "impl_w3c", "impl_w3d",
];
writeFileSync(join(root, "vacilando", "assignments", `${missionId}.json`), JSON.stringify({
  missionId,
  assignments: [
    ...phases.map((phaseId, i) => ({
      assignmentId: `a${i + 1}`,
      phaseId,
      title: `${phaseId} complete`,
      status: "complete",
      completionReport: { summary: `${phaseId} done`, recommendation: "Accept deliverable" },
    })),
    {
      assignmentId: "a_w52",
      phaseId: "impl_w52",
      title: "W-52 Truthful Access",
      status: "complete",
      completionReport: { summary: "access truthful", recommendation: "Accept deliverable" },
    },
  ],
}, null, 2));

mkdirSync(join(root, "vacilando", "deliverable-reviews"), { recursive: true });
writeFileSync(join(root, "vacilando", "deliverable-reviews", `${missionId}.json`), JSON.stringify({
  schema_version: "vacilando.deliverable_reviews.v1",
  mission_id: missionId,
  reviews: phases.map((phaseId, i) => ({
    review_id: `drev_${i}`,
    mission_id: missionId,
    assignment_id: `a${i + 1}`,
    certification_state: "operator_deferred",
    created_at: new Date().toISOString(),
  })).concat([{
    review_id: "drev_w52",
    mission_id: missionId,
    assignment_id: "a_w52",
    certification_state: "operator_deferred",
    created_at: new Date().toISOString(),
  }]),
}, null, 2));

const { deriveMissionPosture } = await import("../lib/vacilando/mission-posture.mjs");
const { missionHealthVm } = await import("../lib/vacilando/presentation/mission-health.mjs");
const { compressCurrentState, inlineReviewCardVm } = await import("../lib/vacilando/presentation/mission-conversation.mjs");
const { deriveProgressBoardFromAssignments } = await import("../lib/vacilando/progress-board.mjs");
const { classifyMissionComposerIntent } = await import("../lib/vacilando/mission-conversation-director.mjs");
const { parkMissionOutcome } = await import("../lib/vacilando/mission-reopen.mjs");

const posture = deriveMissionPosture(missionId);
assert.equal(posture.id, "mission_idle", `expected mission_idle, got ${posture.id} (${posture.label})`);
assert.equal(posture.needsYou, false, "register complete must not Needs You");
assert.notEqual(posture.label, "Waiting on you");
assert.match(posture.label, /Idle/i);

const health = missionHealthVm(missionId, { posture });
assert.equal(health.missionProgressLabel, "Ongoing");
assert.equal(health.missionPercent, null);
assert.equal(health.register.complete, true);
assert.equal(health.register.done, 12);
assert.equal(health.register.total, 12);
assert.equal(health.waitingOnYou, false);
assert.equal(health.lifecycle, "idle");

const board = deriveProgressBoardFromAssignments(missionId);
assert.equal(board.overallPercent, null, "register fraction must not become Mission overall %");
assert.equal(board.register.percent, 100);

const compact = compressCurrentState({
  currentPhase: "Implementation",
  postureId: posture.id,
  recommendation: posture.next,
  workingOn: "Truthful Access",
}, { missionHealth: health, progressBoard: { hasDepth: true, overallLabel: "100%", headline: "x" } });
assert.ok(!compact.summaryLines.some((l) => /waiting on you/i.test(l)), String(compact.summaryLines));
assert.ok(compact.summaryLines.some((l) => /Ongoing|Idle|Current work/i.test(l)), String(compact.summaryLines));

const card = inlineReviewCardVm(missionId);
assert.ok(card, "soft card should present current-work-complete story");
assert.ok(!/Milestone reached/i.test(card.recommendation || ""));
assert.ok(!card.buttons?.some((b) => b.kind === "park_outcome"));
assert.ok(!card.buttons?.some((b) => b.kind === "certify_completion"));
assert.match(card.recommendation || "", /ongoing/i);

const idleIntent = classifyMissionComposerIntent("Stop working on this for now");
assert.equal(idleIntent.kind, "idle_mission");
const whyIntent = classifyMissionComposerIntent("Why aren't we done?");
assert.equal(whyIntent.mode, "question");

const parked = parkMissionOutcome(missionId, { actor: "test", response: "leave idle" });
assert.ok(parked.ok);
const m = getMission(missionId);
assert.ok(!m.completion_rejected_at, "park must not set completion_rejected_at");
assert.equal(m.status, "idle");

const { ensureRegisterCompleteDirectorSynthesis } = await import("../lib/vacilando/register-complete-synthesis.mjs");
const { composeMissionDirectorResponse, buildMissionDirectorContext } = await import("../lib/vacilando/mission-conversation-director.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");

const synth1 = ensureRegisterCompleteDirectorSynthesis(missionId);
assert.ok(synth1.synthesized || synth1.deduped, JSON.stringify(synth1));
const synth2 = ensureRegisterCompleteDirectorSynthesis(missionId);
assert.equal(synth2.deduped || synth2.skipped, true, "synthesis must be idempotent");
const tl = readTimeline(missionId) || [];
assert.ok(
  tl.some((e) => e?.detail?.kind === "register_complete_director_synthesis"),
  "timeline should carry Director register-complete synthesis",
);

const continueIntent = classifyMissionComposerIntent("Continue");
assert.equal(continueIntent.mode, "action");
const ctx = buildMissionDirectorContext(missionId);
const contReply = composeMissionDirectorResponse(ctx, {
  operatorText: "Continue",
  intent: continueIntent,
});
assert.match(contReply.summary || "", /ongoing|idle|register/i);
assert.ok(!/waiting on you/i.test(contReply.summary || ""));

const whyReply = composeMissionDirectorResponse(ctx, {
  operatorText: "Why aren't we done?",
  intent: whyIntent,
});
assert.match(whyReply.summary || "", /register completion is not mission completion/i);

const closeIntent = classifyMissionComposerIntent("Close the mission");
assert.equal(closeIntent.kind, "close_mission");

console.log("durable-mission-continuity.test.mjs: ok");
rmSync(root, { recursive: true, force: true });
