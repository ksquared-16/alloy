/**
 * Live work progress card — coalesce heartbeats into % / done / freshness.
 * Run: node scripts/local-dev/tests/live-work-progress.test.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

const root = mkdtempSync(join(os.tmpdir(), "vac-progress-"));
process.env.ALLOY_RUNTIME_ROOT = root;

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const {
  createExecutionSession,
  markSessionHeartbeat,
  updateExecutionSession,
  getExecutionSession,
} = await import("../lib/vacilando/execution-session.mjs");
const { appendTimelineEvent } = await import("../lib/vacilando/timeline.mjs");
const { liveWorkProgressVm } = await import("../lib/vacilando/presentation/mission-conversation.mjs");
const { projectTimelineToMessages, workspaceShellVm } = await import("../lib/vacilando/presentation/workspace-runtime.mjs");

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

const ing = ingestMissionBrief(brief("Progress Card Mission"), { slot: 6, actor: "operator" });
const missionId = ing.brief.missionId;
approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });

const asgDir = join(root, "vacilando", "assignments");
mkdirSync(asgDir, { recursive: true });
writeFileSync(join(asgDir, `${missionId}.json`), JSON.stringify({
  schema_version: "vacilando.assignments.v1",
  mission_id: missionId,
  assignments: [
    {
      assignmentId: "asg_done_1",
      missionId,
      title: "Threat matrix draft",
      deliverable: "Threat matrix draft",
      status: "complete",
    },
    {
      assignmentId: "asg_run_1",
      missionId,
      title: "Security threat and enforcement matrix",
      deliverable: "Security threat and enforcement matrix",
      status: "running",
    },
  ],
  context_epoch: null,
}, null, 2));

const session = createExecutionSession({
  missionId,
  assignmentId: "asg_run_1",
  connector: "claude",
  slot: 6,
});
updateExecutionSession(session.sessionId, { status: "running" });
markSessionHeartbeat(session.sessionId, {
  activity: "Running tests",
  percent: 47,
  filesInspected: 12,
  estimatedCheckpointLabel: "about 4 minutes",
});

for (const label of [
  "Claude is reading architecture",
  "Claude is running tests",
  "Claude is reading architecture",
  "Claude is running tests",
  "Claude is writing specification",
]) {
  appendTimelineEvent(missionId, {
    type: "progress",
    headline: label,
    summary: label.replace(/^Claude is\s+/i, ""),
    actor: "claude",
  });
}
appendTimelineEvent(missionId, {
  type: "assignment_started",
  headline: "Started Security threat matrix",
  summary: "Assignment running",
  actor: "director",
});

const projected = projectTimelineToMessages(missionId, { limit: 40 });
assert.ok(
  !projected.messages.some((m) => /reading architecture|running tests|writing specification/i.test(m.body)),
  "progress heartbeats must not flood the conversation",
);
assert.ok(
  projected.messages.some((m) => /Started Security/i.test(m.body)),
  "material assignment events still project",
);

const live = liveWorkProgressVm(missionId);
assert.ok(live?.active);
assert.equal(live.percent, 47);
assert.match(live.percentLabel, /47%/);
assert.equal(live.activity, "Running tests");
assert.equal(live.needsYourApproval, false);
assert.ok(!/waiting for approval/i.test(live.activity));
assert.ok(live.doneSummary.some((t) => /Threat matrix/i.test(t)));
assert.ok(["live", "quiet", "starting", "stale"].includes(live.freshness));

const cur = getExecutionSession(session.sessionId);
updateExecutionSession(session.sessionId, {
  progress: {
    ...(cur.progress || {}),
    activity: "Running tests",
    percent: 47,
    lastHeartbeatAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
});
const stale = liveWorkProgressVm(missionId);
assert.equal(stale.freshness, "stale");
assert.match(stale.freshnessLabel, /stuck|No update/i);
assert.equal(stale.needsYourApproval, false);

// Classifier false-positive: heartbeat says waiting, but no real gate
markSessionHeartbeat(session.sessionId, {
  activity: "Waiting for approval",
  percent: 47,
  filesInspected: 12,
});
const fakeWait = liveWorkProgressVm(missionId);
assert.equal(fakeWait.needsYourApproval, false);
assert.ok(!/waiting for (your )?approval/i.test(String(fakeWait.activity || "")));

const shell = workspaceShellVm(missionId);
assert.ok(shell.liveProgress?.active);
assert.ok(shell.liveProgress.percent != null);
assert.ok(shell.currentStateCompact?.summaryLines?.length);

console.log("live-work-progress.test.mjs: ok", {
  missionId,
  percent: live.percent,
  freshness: live.freshness,
  messages: projected.messages.length,
});
process.exit(0);
