/**
 * Vacilando V3-2 — Fast Resume + Context Compression tests.
 * Run: node scripts/local-dev/tests/workspace-runtime-v3-2.test.mjs
 */
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-v32-"));

const {
  WORKSPACE_FIRST_PAGE,
  projectTimelineToMessages,
  workspaceShellVm,
  workspaceMessagesVm,
  workspaceRuntimeVm,
  deriveCurrentState,
  postWorkspaceReply,
  setWorkspaceLastSeen,
  getWorkspaceLastSeen,
  composeSinceLastVisit,
  resolveV31Workspace,
} = await import("../lib/vacilando/presentation/workspace-runtime.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { appendTimelineEvent } = await import("../lib/vacilando/timeline.mjs");

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

assert.equal(WORKSPACE_FIRST_PAGE, 40);
assert.ok(resolveV31Workspace("ws_identity"));

const ing = ingestMissionBrief(brief("Identity Platform V3-2"), { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

const e1 = appendTimelineEvent(missionId, {
  type: "assignment_started", summary: "Started wave", headline: "Started wave", actor: "cursor",
});
const e2 = appendTimelineEvent(missionId, {
  type: "validation", summary: "Browser certification passed", headline: "Browser certification passed", actor: "cursor",
});
const e3 = appendTimelineEvent(missionId, {
  type: "assignment_completed", summary: "Wave complete", headline: "Wave complete", actor: "cursor",
});
const e4 = appendTimelineEvent(missionId, {
  type: "blocker", summary: "Waiting on access decision", headline: "Waiting on access decision", actor: "director",
});

// Pagination / first-page limit
const page1 = projectTimelineToMessages(missionId, { limit: 2 });
assert.equal(page1.messages.length, 2);
assert.equal(page1.page.hasEarlier, true);
assert.equal(page1.messages[1].provenance.source, "timeline");
const older = projectTimelineToMessages(missionId, {
  limit: 2,
  beforeEventId: page1.page.oldestEventId,
});
assert.ok(older.messages.length >= 1);
assert.notEqual(older.messages[0].messageId, page1.messages[0].messageId);

// Last-seen boundaries
assert.equal(getWorkspaceLastSeen("ws_identity"), null);
const set = setWorkspaceLastSeen("ws_identity", { eventId: e1.event_id, at: e1.at });
assert.equal(set.ok, true);
assert.equal(getWorkspaceLastSeen("ws_identity").eventId, e1.event_id);

// First visit compression (no marker on a fresh workspace id)
const first = composeSinceLastVisit(missionId, {
  workspaceId: "ws_never_visited",
  currentState: { workingOn: "Identity", blockedBy: "Nothing", recommendation: "Continue", lastCompleted: "—" },
  lastSeen: null,
});
assert.equal(first.firstVisit, true);
assert.ok(first.lines.some((l) => /Working on|First open|Recommended/i.test(l.text)));

// Material changes since last visit
const material = composeSinceLastVisit(missionId, {
  workspaceId: "ws_identity",
  currentState: deriveCurrentState(missionId),
  lastSeen: { eventId: e1.event_id, at: e1.at },
});
assert.equal(material.firstVisit, false);
assert.equal(material.material, true);
assert.ok(material.lines.some((l) => /Browser certification|Wave complete|Waiting on access|Recommended/i.test(l.text)));
assert.ok(material.lines.every((l) => l.provenance));

// No material change
const quiet = appendTimelineEvent(missionId, {
  type: "progress", summary: "still typing", headline: "still typing", actor: "cursor", visibility: "debug",
});
setWorkspaceLastSeen("ws_identity", { eventId: e4.event_id, at: e4.at });
const noChange = composeSinceLastVisit(missionId, {
  workspaceId: "ws_identity",
  currentState: { workingOn: "Identity", blockedBy: "Nothing", recommendation: "Continue" },
});
assert.equal(noChange.material, false);
assert.match(noChange.lines[0].text, /No material changes/i);

// Shell vs messages split
// Identity mission may be missing in temp root — seed won't be ws_identity.
// Exercise shell/messages helpers against Identity binding (missing ok) and projection helpers above.
const shellMissing = workspaceShellVm("ws_identity");
assert.equal(shellMissing.kind, "workspace_shell");
assert.ok(shellMissing.messagesStatus === "loading" || shellMissing.messagesStatus === "unavailable");

const msgsPage = workspaceMessagesVm("ws_identity", { limit: 10 });
assert.equal(msgsPage.kind, "workspace_messages");

// Provenance on reply against Identity binding (timeline file for that mission id)
const reply = postWorkspaceReply("ws_identity", { text: "V3-2 continue" });
assert.equal(reply.ok, true);
assert.equal(reply.message.from.label, "Kelly");
assert.equal(reply.message.provenance.type, "operator_message");

// Current State consistency fields
const cs = deriveCurrentState(missionId);
assert.equal(cs.editable, false);
assert.ok("workingOn" in cs && "currentPhase" in cs && "blockedBy" in cs);
assert.ok("lastCompleted" in cs && "recommendation" in cs && "nextExpectedCheckpoint" in cs);

// Stale pagination cursor
const stale = projectTimelineToMessages(missionId, { limit: 5, beforeEventId: "tle_does_not_exist" });
assert.deepEqual(stale.messages, []);
assert.equal(stale.page.hasEarlier, false);

void quiet;
void workspaceRuntimeVm;

console.log("workspace-runtime-v3-2.test.mjs: ok");
process.exit(0);
