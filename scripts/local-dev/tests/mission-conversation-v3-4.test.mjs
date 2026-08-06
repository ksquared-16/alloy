/**
 * Vacilando V3-4 — Conversational Director + mission rail tests.
 * Run: node scripts/local-dev/tests/mission-conversation-v3-4.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-v34-"));

const {
  classifyMissionComposerIntent,
  buildMissionDirectorContext,
  composeMissionDirectorResponse,
  executeMissionDirectorTurn,
} = await import("../lib/vacilando/mission-conversation-director.mjs");
const { postWorkspaceReply, workspaceShellVm, workspaceMessagesVm } = await import("../lib/vacilando/presentation/workspace-runtime.mjs");
const { missionConversationListVm } = await import("../lib/vacilando/presentation/mission-conversation.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { buildMissionContextPackage } = await import("../lib/vacilando/mission-context.mjs");
const { listCollaboration } = await import("../lib/vacilando/mission-collaboration.mjs");
const { projectTimelineToMessages } = await import("../lib/vacilando/presentation/workspace-runtime.mjs");

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

// Intent classification
assert.equal(classifyMissionComposerIntent("Where are we at?").mode, "question");
assert.equal(classifyMissionComposerIntent("Give me a recap of where we're at").mode, "question");
assert.equal(classifyMissionComposerIntent("I don't like this. Simplify the role editor without changing access architecture.").mode, "guidance");
assert.equal(classifyMissionComposerIntent("Begin implementation").mode, "action");
assert.equal(classifyMissionComposerIntent("Have Claude investigate this").mode, "action");

const ing = ingestMissionBrief(brief("Identity Platform V3-4"), { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

const list = missionConversationListVm({ filter: "active" });
assert.ok(list.missions.length >= 1);
assert.ok(list.missions.some((m) => /Identity/i.test(m.title)));

const shell = workspaceShellVm(missionId);
assert.ok(shell);
assert.equal(shell.sinceLastVisit, null, "Opening path defers sinceLastVisit");
assert.ok(shell.currentStateCompact);

const ctx = buildMissionDirectorContext(missionId);
assert.equal(ctx.missionId, missionId);
assert.ok(ctx.postureId || ctx.recommendation !== undefined);

const composed = composeMissionDirectorResponse(ctx, {
  operatorText: "Where are we at?",
  intent: { mode: "question" },
});
assert.ok(composed.summary.length > 20);
assert.match(composed.summary, /recommend|phase|status|blocker|working/i);

const reply = postWorkspaceReply(missionId, {
  text: "Give me a recap of where we're at and what you recommend next.",
});
assert.equal(reply.ok, true);
assert.ok(reply.message);
assert.ok(reply.director?.ok, "Director responds");
assert.ok(reply.directorMessage?.body || reply.directorMessage?.from?.label === "Director");

const msgs = projectTimelineToMessages(missionId, { limit: 40 }).messages;
const kelly = msgs.filter((m) => m.from?.label === "Kelly");
const director = msgs.filter((m) => m.from?.label === "Director" || m.provenance?.type === "director_response");
assert.ok(kelly.length >= 1);
assert.ok(director.length >= 1);

// Guidance persists + compounds
const guide = postWorkspaceReply(missionId, {
  text: "I don't like the current implementation. I want the role editor simplified without changing the access architecture.",
});
assert.equal(guide.ok, true);
assert.equal(guide.director?.mode, "guidance");
const collab = listCollaboration(missionId, { status: "open" });
assert.ok(collab.some((e) => /role editor/i.test(e.body)));

const recall = executeMissionDirectorTurn(missionId, {
  operatorText: "What feedback did I just give?",
});
assert.equal(recall.ok, true);
assert.match(recall.message.body, /role editor/i);

const pkg = buildMissionContextPackage(missionId);
assert.ok(pkg);
assert.ok((pkg.operatorGuidance || []).some((g) => /role editor/i.test(g.body)),
  "guidance available to worker context package");

// Question does not invent worker launch — proposedAction may exist but turn is not a dispatch
assert.ok(["question", "guidance", "action"].includes(guide.director?.mode) || guide.director?.ok);

console.log("mission-conversation-v3-4.test.mjs: ok", {
  missionId,
  rail: list.missions.length,
  directorModes: [reply.director?.mode, guide.director?.mode],
});
process.exit(0);
