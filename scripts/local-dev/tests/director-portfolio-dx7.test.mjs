/**
 * Director Experience V2 — DX-7 Director Portfolio.
 * Run: node scripts/local-dev/tests/director-portfolio-dx7.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";
import assert from "node:assert/strict";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dx7-"));

const {
  PORTFOLIO_GROUPS,
  portfolioGroupForPosture,
  portfolioPriorityScore,
  portfolioMissionCardVm,
  directorPortfolioVm,
} = await import("../lib/vacilando/presentation/director-portfolio.mjs");
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

function seedMission(title) {
  const ing = ingestMissionBrief(brief(title), { slot: 6, actor: "operator" });
  const missionId = ing.brief.missionId;
  approveMissionExecution(missionId, ing.brief.version, { slot: 6, actor: "operator" });
  return missionId;
}

// ---- Deterministic group mapping (no lifecycle invention) ----
assert.equal(
  portfolioGroupForPosture({ id: "blocked", needsYou: true }),
  "blocked",
);
assert.equal(
  portfolioGroupForPosture({ id: "operator_review", needsYou: true }, {
    advance: { ok: true },
  }),
  "ready_implementation",
);
assert.equal(
  portfolioGroupForPosture({ id: "awaiting_completion", needsYou: true }),
  "ready_close",
);
assert.equal(
  portfolioGroupForPosture({ id: "awaiting_completion", needsYou: false }),
  "ready_close",
);
assert.equal(
  portfolioGroupForPosture({ id: "deliverable_review", needsYou: true }, { reviewOpen: true }),
  "ready_close",
);
assert.equal(
  portfolioGroupForPosture({ id: "decision_required", needsYou: true }),
  "needs_attention",
);
assert.equal(
  portfolioGroupForPosture({ id: "paused", needsYou: false, busy: false }),
  "waiting",
);
assert.equal(
  portfolioGroupForPosture({ id: "executing", needsYou: false, busy: true }),
  "in_progress",
);
assert.equal(
  portfolioGroupForPosture({ id: "completed" }, { mission: { status: "completed" } }),
  "completed_recently",
);
assert.ok(PORTFOLIO_GROUPS.some((g) => g.id === "ready_close" && /Promotion/i.test(g.label)));

// ---- Priority: needs attention > blocked > ready implementation ----
assert.ok(
  portfolioPriorityScore({ groupId: "needs_attention", needsYou: true })
    > portfolioPriorityScore({ groupId: "blocked" }),
);
assert.ok(
  portfolioPriorityScore({ groupId: "blocked" })
    > portfolioPriorityScore({ groupId: "ready_implementation" }),
);
assert.ok(
  portfolioPriorityScore({ groupId: "ready_implementation" })
    > portfolioPriorityScore({ groupId: "in_progress" }),
);

// ---- Live mixed portfolio ----
const midNeeds = seedMission("Identity & Access");
const asgsNeeds = listAssignments(midNeeds);
createDecision({
  missionId: midNeeds,
  title: "Approve implementation scope",
  situation: "Discovery complete; Director must approve path.",
  whyThisMatters: "Unblocks implementation",
  currentPlan: "Proceed to implementation",
  discovery: "Ready",
  options: [
    { optionId: "go", label: "Approve", description: "Begin implementation" },
    { optionId: "hold", label: "Hold", description: "Wait" },
  ],
  recommendation: "go",
  recommendationReason: "Findings are complete",
  impact: { schedule: "Unblocks wave" },
  affectedAssignments: [asgsNeeds[0]?.assignmentId].filter(Boolean),
  pauseAssignments,
});

const midBlocked = seedMission("Trust Platform");
const asgsBlocked = listAssignments(midBlocked);
updateAssignment(midBlocked, asgsBlocked[0].assignmentId, (a) => {
  a.status = "blocked";
  a.blocker = { message: "Waiting on credential rotation" };
});

const midWaiting = seedMission("Communications");
const asgsWait = listAssignments(midWaiting);
updateAssignment(midWaiting, asgsWait[0].assignmentId, (a) => {
  a.status = "paused";
});

const midDone = seedMission("DX-5 Evidence Experience");
updateMission(midDone, { status: "completed", kickoff_status: "completed" });
archiveMission(midDone, {
  archiveClass: "certification",
  reason: "DX-5 certified",
  actor: "operator",
});

const portfolio = directorPortfolioVm({ filter: "active" });
assert.equal(portfolio.kind, "director_portfolio");
assert.ok(portfolio.counts.active >= 3, "active count includes live missions");
assert.ok(portfolio.counts.needsAttention >= 1, "needs attention counted");
assert.ok(portfolio.counts.blocked >= 1, "blocked counted");
assert.ok(portfolio.counts.completedRecently >= 1, "recently finished on active home");
assert.ok(portfolio.focus.length >= 1, "focus list present");
assert.ok(portfolio.focusLead, "focus lead present");

const needsGroup = portfolio.groups.find((g) => g.id === "needs_attention");
assert.ok(needsGroup?.missions.some((m) => m.missionId === midNeeds), "needs mission grouped");

const blockedGroup = portfolio.groups.find((g) => g.id === "blocked");
assert.ok(blockedGroup?.missions.some((m) => m.missionId === midBlocked), "blocked mission grouped");
const blockedCard = blockedGroup.missions.find((m) => m.missionId === midBlocked);
assert.ok(blockedCard.blocker, "blocker card surfaces blocker text");
assert.match(blockedCard.blocker, /block/i);
assert.ok(blockedCard.recommendation, "blocker card has recommendation");
assert.ok(blockedCard.nextAction?.href || blockedCard.nextAction?.kind, "next action present");

const doneGroup = portfolio.groups.find((g) => g.id === "completed_recently");
assert.ok(doneGroup?.missions.some((m) => m.missionId === midDone), "completed in recently finished");

const card = portfolioMissionCardVm({ mission_id: midNeeds, missionId: midNeeds });
assert.equal(card.kind, "portfolio_mission_card");
assert.ok(card.phase);
assert.ok(card.outcome?.label);
assert.ok(card.owner);
assert.ok("confidence" in card);
assert.ok(card.nextAction);

const home = missionsHomeVm({ filter: "active" });
assert.equal(home.portfolio?.kind, "director_portfolio");
assert.ok(home.portfolio.counts);
assert.ok(Array.isArray(home.portfolio.groups));
// Legacy list still present for compatibility (API consumers)
assert.ok(Array.isArray(home.missions));
assert.ok(home.summary, "control-plane summary retained on API");

console.log(JSON.stringify({
  ok: true,
  counts: portfolio.counts,
  focusLead: portfolio.focusLead,
  groupIds: portfolio.groups.filter((g) => g.count > 0).map((g) => `${g.id}:${g.count}`),
  topFocus: portfolio.focus.slice(0, 3).map((c) => ({
    title: c.title,
    group: c.groupId,
    recommendation: c.recommendation,
  })),
}, null, 2));
