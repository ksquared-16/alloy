/**
 * Director Experience V2 — DX-8 Executive Command Center.
 * Run: node scripts/local-dev/tests/executive-command-center-dx8.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx8-"));

const {
  COMMAND_LANES,
  commandLaneForCard,
  commandPriorityScore,
  executiveCommandCenterVm,
} = await import("../lib/vacilando/presentation/executive-command-center.mjs");
const { directorPortfolioVm } = await import("../lib/vacilando/presentation/director-portfolio.mjs");
const { missionsHomeVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { createDecision } = await import("../lib/vacilando/decisions.mjs");
const { listAssignments, updateAssignment, pauseAssignments } = await import("../lib/vacilando/worker-assignment.mjs");
const { archiveMission } = await import("../lib/vacilando/mission-archive.mjs");
const { updateMission } = await import("../lib/vacilando/commands/missions.mjs");

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

function seed(title) {
  const ing = ingestMissionBrief(brief(title), { slot: 6, actor: "operator" });
  const missionId = ing.brief.missionId;
  approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });
  return missionId;
}

// Deterministic lane mapping
assert.equal(commandLaneForCard({ groupId: "blocked", postureId: "blocked" }), "blocked");
assert.equal(commandLaneForCard({ groupId: "ready_implementation" }), "needs_decision");
assert.equal(commandLaneForCard({ groupId: "ready_close" }), "ready_promote");
assert.equal(commandLaneForCard({ groupId: "needs_attention", needsYou: true }), "needs_decision");
assert.equal(commandLaneForCard({ groupId: "waiting" }), "waiting_others");
assert.equal(commandLaneForCard({ groupId: "completed_recently", postureId: "completed" }), "completed_recently");
assert.equal(
  commandLaneForCard({ groupId: "in_progress" }, { actionKind: "review_deliverable" }),
  "waiting_review",
);
assert.ok(COMMAND_LANES.some((l) => l.id === "needs_decision"));

assert.ok(
  commandPriorityScore({ laneId: "needs_decision" })
    > commandPriorityScore({ laneId: "blocked" }),
);
assert.ok(
  commandPriorityScore({ laneId: "blocked" })
    > commandPriorityScore({ laneId: "ready_promote" }),
);

// Mixed live portfolio → command center
const midNeeds = seed("DX8 Needs Decision");
createDecision({
  missionId: midNeeds,
  title: "Approve scope",
  situation: "Ready",
  whyThisMatters: "Unblocks",
  currentPlan: "Go",
  discovery: "Done",
  options: [
    { optionId: "go", label: "Approve", description: "Go" },
    { optionId: "hold", label: "Hold", description: "Wait" },
  ],
  recommendation: "go",
  recommendationReason: "Ready",
  impact: { schedule: "Unblocks" },
  affectedAssignments: [listAssignments(midNeeds)[0]?.assignmentId].filter(Boolean),
  pauseAssignments,
});

const midBlocked = seed("DX8 Blocked");
updateAssignment(midBlocked, listAssignments(midBlocked)[0].assignmentId, (a) => {
  a.status = "blocked";
  a.blocker = { message: "Architecture decision pending" };
});

const midWait = seed("DX8 Waiting");
updateAssignment(midWait, listAssignments(midWait)[0].assignmentId, (a) => {
  a.status = "waiting";
});

const midPromote = seed("DX8 Ready Promote");
for (const a of listAssignments(midPromote)) {
  updateAssignment(midPromote, a.assignmentId, (row) => { row.status = "complete"; });
}
updateMission(midPromote, {
  status: "awaiting_completion_approval",
  kickoff_status: "awaiting_completion_approval",
});

const midImpl = seed("DX8 Ready Impl");
for (const a of listAssignments(midImpl)) {
  updateAssignment(midImpl, a.assignmentId, (row) => { row.status = "complete"; });
}

const midDone = seed("DX8 Finished");
updateMission(midDone, { status: "completed", kickoff_status: "completed" });
archiveMission(midDone, { archiveClass: "certification", reason: "DX-8 cert", actor: "operator" });

const portfolio = directorPortfolioVm({ filter: "active" });
assert.equal(portfolio.kind, "director_portfolio");
assert.ok(portfolio.commandCenter, "portfolio attaches commandCenter");
assert.equal(portfolio.commandCenter.kind, "executive_command_center");

const cc = portfolio.commandCenter;
assert.ok(cc.counts.actionable >= 1, "has actionable items");
assert.ok(cc.lanes.some((l) => l.id === "needs_decision" || l.id === "blocked"));

const byMission = Object.fromEntries(cc.cards.map((c) => [c.missionId, c]));
assert.equal(byMission[midBlocked]?.laneId, "blocked");
assert.ok(byMission[midBlocked]?.primaryAction, "blocked has primary action");
assert.ok(byMission[midBlocked]?.blocker || /block/i.test(byMission[midBlocked]?.reason || ""));

assert.ok(
  byMission[midNeeds]?.laneId === "needs_decision"
    || byMission[midNeeds]?.needsYou,
  "decision mission in needs_decision",
);
assert.ok(byMission[midNeeds]?.primaryAction?.kind || byMission[midNeeds]?.primaryAction?.href);

assert.equal(byMission[midPromote]?.laneId, "ready_promote");
assert.ok(
  ["needs_decision", "waiting_review"].includes(byMission[midImpl]?.laneId)
    || byMission[midImpl]?.groupId === "ready_implementation",
  "impl-ready surfaces as decision or review",
);
assert.equal(byMission[midWait]?.laneId, "waiting_others");
assert.equal(byMission[midDone]?.laneId, "completed_recently");

// Card contract
const sample = cc.needsAction[0] || cc.cards.find((c) => c.laneId === "needs_decision");
assert.ok(sample);
assert.ok(sample.actionTitle);
assert.ok(sample.reason);
assert.ok(sample.recommendation);
assert.ok(sample.expectedOutcome);
assert.ok("confidence" in sample);
assert.ok("evidence" in sample);
assert.ok(sample.primaryAction);

// Direct compose from portfolio
const cc2 = executiveCommandCenterVm(portfolio);
assert.equal(cc2.kind, "executive_command_center");
assert.equal(cc2.counts.blocked, cc.counts.blocked);

const home = missionsHomeVm({ filter: "active" });
assert.equal(home.portfolio?.commandCenter?.kind, "executive_command_center");

console.log(JSON.stringify({
  ok: true,
  lead: cc.lead,
  counts: cc.counts,
  lanes: cc.lanes.filter((l) => l.count > 0).map((l) => `${l.id}:${l.count}`),
  top: cc.needsAction.slice(0, 4).map((c) => ({
    title: c.title,
    action: c.actionTitle,
    lane: c.laneId,
    primary: c.primaryAction?.kind,
  })),
}, null, 2));
