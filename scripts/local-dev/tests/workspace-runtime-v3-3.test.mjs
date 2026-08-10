/**
 * Vacilando V3-3 — Mission Conversation Runtime tests.
 * Run: node scripts/local-dev/tests/workspace-runtime-v3-3.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-v33-"));

const {
  compressCurrentState,
  operationalRailVm,
  inlineReviewCardVm,
  enrichConversationMessages,
  resolveMissionConversationId,
  displayMissionTitle,
  missionConversationListVm,
} = await import("../lib/vacilando/presentation/mission-conversation.mjs");
const {
  workspaceShellVm,
  workspaceMessagesVm,
  resolveV31Workspace,
} = await import("../lib/vacilando/presentation/workspace-runtime.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { appendTimelineEvent } = await import("../lib/vacilando/timeline.mjs");

function brief(title) {
  return {
    title,
    objective: `Objective for ${title}`,
    plan: [{
      phaseId: "p1", order: 1, title: "Implementation",
      objective: "Ship", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
    }],
    acceptanceCriteria: [{ id: "AC1", statement: "Done" }],
    constraints: [],
    sourceMaterials: [],
  };
}

assert.equal(resolveMissionConversationId("ws_identity"), "msn_f74ed02c126c88d7ff");
assert.equal(resolveMissionConversationId("msn_f74ed02c126c88d7ff"), "msn_f74ed02c126c88d7ff");
assert.equal(displayMissionTitle("msn_f74ed02c126c88d7ff"), "Identity Platform");

const ing = ingestMissionBrief(brief("Identity Platform V3-3"), { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

appendTimelineEvent(missionId, {
  type: "assignment_completed",
  summary: "Wave 4 complete. Screenshots attached.",
  headline: "Wave 4 complete",
  actor: "claude",
  detail: { evidence_ids: [] },
});

const compact = compressCurrentState({
  currentPhase: "Implementation",
  workingOn: "Authentication",
  nextExpectedCheckpoint: "Browser Certification",
  postureId: "operator_review",
  recommendation: "Approve implementation",
}, { provider: "cursor", slot: 6, serverStatus: "Stopped" });

assert.equal(compact.kind, "current_state_compact");
assert.ok(compact.summaryLines.some((l) => /Waiting on You/i.test(l)));
assert.ok(compact.summaryLines.some((l) => /cursor/i.test(l) && /Slot 6/i.test(l)));
assert.ok(compact.summaryLines.some((l) => /Server Stopped/i.test(l)));
assert.equal(compact.goal, "Authentication");
assert.equal(compact.next, "Browser Certification");
assert.ok(compact.summaryLines.length <= 4);

const list = missionConversationListVm({ filter: "active" });
assert.equal(list.label, "Missions");
assert.ok(Array.isArray(list.missions));
for (const m of list.missions) {
  assert.ok(m.title);
  assert.ok(m.missionId);
  assert.equal(Object.prototype.hasOwnProperty.call(m, "needsYou"), true);
}

const ops = operationalRailVm(missionId);
assert.equal(ops.kind, "operational_rail");
assert.ok(ops.server);
assert.ok(Array.isArray(ops.workerActions));
const kinds = ops.workerActions.map((a) => a.kind);
assert.ok(!kinds.includes("worker_pause") || !kinds.includes("worker_resume"),
  "must not show both Pause and Resume");
assert.ok(kinds.includes("worker_doctor"));
assert.ok(kinds.includes("sprint_finish") || kinds.includes("open_pr"));

const enriched = enrichConversationMessages(missionId, [{
  messageId: "m1",
  body: "Implementation complete",
  artifacts: [],
  actions: [{ kind: "review_outcome", label: "Review Outcome", missionId }],
}], {
  currentState: { primaryAction: { kind: "review_outcome", label: "Review Outcome", missionId } },
  inlineReview: { reviewId: "drev_test", missionId },
});
assert.equal(enriched[0].actions[0].kind, "inline_review_expand");
assert.ok(!enriched[0].actions.some((a) => a.kind === "review_outcome"));

const shell = workspaceShellVm(missionId);
assert.ok(shell);
assert.ok(shell.currentStateCompact);
assert.ok(shell.operational);
assert.ok(Array.isArray(shell.missions));
assert.equal(shell.workspace.title, displayMissionTitle(missionId) || shell.workspace.title);

const msgs = workspaceMessagesVm(missionId, { limit: 40 });
assert.ok(msgs);
assert.ok(Array.isArray(msgs.messages));

const resolved = resolveV31Workspace("ws_identity");
assert.equal(resolved.missionId, "msn_f74ed02c126c88d7ff");

// inlineReviewCardVm may be null without open deliverable — still a valid projection
const card = inlineReviewCardVm(missionId);
assert.ok(card === null || card.kind === "inline_review");

console.log("workspace-runtime-v3-3.test.mjs: ok", {
  missionId,
  missions: list.missions.length,
  compactLines: compact.summaryLines,
  workerActionKinds: kinds,
  inlineReview: Boolean(card),
});
process.exit(0);
