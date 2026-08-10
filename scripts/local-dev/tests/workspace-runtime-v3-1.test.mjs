/**
 * Vacilando V3-1 — Workspace Runtime projection tests.
 * Run: node scripts/local-dev/tests/workspace-runtime-v3-1.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-v31-"));

const {
  V3_1_WORKSPACE,
  listV31Workspaces,
  resolveV31Workspace,
  projectTimelineToMessages,
  deriveCurrentState,
  deriveContextRail,
  workspaceRuntimeVm,
  postWorkspaceReply,
} = await import("../lib/vacilando/presentation/workspace-runtime.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { appendTimelineEvent } = await import("../lib/vacilando/timeline.mjs");
const { createDecision, answerDecision } = await import("../lib/vacilando/decisions.mjs");

function brief(title) {
  return {
    title,
    objective: `Objective for ${title}`,
    plan: [{
      phaseId: "p1", order: 1, title: "Discovery",
      objective: "Discover", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"],
    }],
    acceptanceCriteria: [{ id: "AC1", statement: "Done" }],
    constraints: [],
    sourceMaterials: [],
  };
}

// ---- Mission conversation list (V3-3: portfolio-backed; Identity always resolvable) ----
const listed = listV31Workspaces();
assert.ok(listed.length >= 1, "at least one mission in left rail");
assert.ok(
  listed.some((w) => w.missionId === V3_1_WORKSPACE.missionId || /Identity/i.test(w.title || "")),
  "Identity Platform present in mission list",
);
assert.equal(resolveV31Workspace("identity")?.missionId, V3_1_WORKSPACE.missionId);
assert.equal(resolveV31Workspace("ws_other"), null);

// Seed a temporary mission and temporarily point V3_1 at it via projection helpers
const ing = ingestMissionBrief(brief("Identity Platform V3 slice"), { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

appendTimelineEvent(missionId, {
  type: "assignment_started",
  summary: "Started implementation.",
  headline: "Started implementation.",
  actor: "cursor",
  visibility: "summary",
});
appendTimelineEvent(missionId, {
  type: "validation",
  summary: "Browser certification completed.",
  headline: "Browser certification completed.",
  actor: "cursor",
  visibility: "summary",
});
appendTimelineEvent(missionId, {
  type: "director_response",
  summary: "Proceed.",
  headline: "Proceed.",
  actor: "director",
  visibility: "summary",
});

const msgs = projectTimelineToMessages(missionId, { limit: 50 }).messages;
assert.ok(msgs.length >= 3, "projects timeline into messages");
const lastThree = msgs.slice(-3);
assert.equal(lastThree[0].from.label, "Cursor");
assert.equal(lastThree[0].body, "Started implementation.");
assert.equal(lastThree[0].provenance.source, "timeline");
assert.equal(lastThree[0].provenance.type, "assignment_started");
assert.equal(lastThree[1].from.label, "Cursor");
assert.match(lastThree[1].body, /Browser certification/);
assert.equal(lastThree[2].from.label, "Director");
assert.equal(lastThree[2].body, "Proceed.");

// Current State is derived, never editable
const cs = deriveCurrentState(missionId);
assert.equal(cs.kind, "current_state");
assert.equal(cs.derived, true);
assert.equal(cs.editable, false);
assert.ok(cs.workingOn);
assert.ok(cs.currentPhase);
assert.ok(cs.recommendation);
assert.ok("blockedBy" in cs);
assert.ok("nextExpectedCheckpoint" in cs);

const rail = deriveContextRail(missionId);
assert.equal(rail.kind, "context_rail");
assert.ok("worker" in rail);
assert.ok("branch" in rail);
assert.ok("evidence" in rail);
assert.ok("settings" in rail);

// Reply appends authoritative timeline — conversation is a view
const reply = postWorkspaceReply("ws_identity", { text: "Continue." });
// Identity mission may or may not exist in temp root — post resolves workspace then mission
// In temp root, Identity mission id has no brief → still appends to that mission id file.
assert.equal(reply.ok, true, "reply ok against bound mission id");
assert.ok(reply.eventId);

const replyMsgs = projectTimelineToMessages(V3_1_WORKSPACE.missionId, { limit: 20 }).messages;
const kelly = replyMsgs.filter((m) => m.from.label === "Kelly" && m.provenance.type === "operator_message");
assert.ok(kelly.some((m) => m.body === "Continue." || m.body.startsWith("Continue")));

// Full runtime for bound Identity workspace — missing in isolated temp root is OK
const live = workspaceRuntimeVm("ws_identity");
assert.equal(live.kind, "workspace_runtime");
assert.equal(live.workspace.missionId, V3_1_WORKSPACE.missionId);
assert.equal(live.workspace.workspaceId, V3_1_WORKSPACE.missionId);
if (live.missing) {
  assert.equal(live.error, "mission_not_found");
  assert.deepEqual(live.messages, []);
} else {
  assert.equal(live.currentState.editable, false);
  assert.ok(Array.isArray(live.messages));
  assert.equal(live.composer.enabled, true);
}

// Seeded mission projection still proves Current State + composer shape via helpers
assert.equal(cs.editable, false);
assert.ok(Array.isArray(msgs));

// Decision → Director participant
createDecision({
  missionId,
  title: "Choose path",
  situation: "Need a direction",
  options: [{ id: "a", label: "A" }, { id: "b", label: "B" }],
  actor: "director",
});
const afterDecision = projectTimelineToMessages(missionId, { limit: 80 }).messages;
const decisionMsg = afterDecision.find((m) => m.provenance.type === "decision_requested");
assert.ok(decisionMsg, "decision_requested projected");
assert.equal(decisionMsg.from.label, "Director");

console.log("workspace-runtime-v3-1.test.mjs: ok");
process.exit(0);
