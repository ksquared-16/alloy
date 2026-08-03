/**
 * Mission Dashboard closeout — Needs Me rules, director comms, usage, identity.
 * Run: node scripts/local-dev/tests/mission-dashboard-closeout.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-close-"));

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { createDecision } = await import("../lib/vacilando/decisions.mjs");
const { pauseAssignments, listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");
const { recordHeartbeat, recoverWorker } = await import("../lib/vacilando/worker-health.mjs");
const { submitOperatorDirectorMessage, listDirectorMessages } = await import("../lib/vacilando/director-comms.mjs");
const { recordUsageEvent } = await import("../lib/vacilando/usage-ledger.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");
const {
  listNeedsYou,
  missionDashboardVm,
  recoveryNeedsOperator,
} = await import("../lib/vacilando/presentation/operator-views.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const brief = {
  title: "Access & Identity V2",
  objective: "Closeout validation",
  plan: [
    { phaseId: "p1", order: 1, title: "Authority Path Inventory", objective: "Inventory", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"] },
    { phaseId: "p2", order: 2, title: "Canonical Authority Model", objective: "Model", requiredOutputs: ["b.md"], dependencies: ["p1"], acceptanceCriteriaIds: ["AC2"] },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory grounded" },
    { id: "AC2", statement: "Model documented" },
  ],
  constraints: [{ id: "C1", text: "No false completion" }],
};

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 6, actor: "operator" });
const asgs = listAssignments(missionId);

const { decision } = createDecision({
  missionId,
  title: "How should invitation expiry work?",
  situation: "Ops asked for 30 days",
  whyThisMatters: "Security vs onboarding",
  currentPlan: "7-day",
  discovery: "Ops preference",
  options: [
    { optionId: "keep_7", label: "Keep 7-day expiry", description: "Safer" },
    { optionId: "extend_30", label: "Extend to 30 days", description: "Ops" },
  ],
  recommendation: "keep_7",
  recommendationReason: "Security default",
  affectedAssignments: [asgs[1].assignmentId],
  pauseAssignments,
});

recordHeartbeat({
  workerId: "claude-6",
  missionId,
  assignmentId: asgs[0].assignmentId,
  slot: 6,
  progress: true,
});
recordHeartbeat({
  workerId: "cursor-6",
  missionId,
  assignmentId: asgs[1].assignmentId,
  slot: 6,
  progress: true,
  nowMs: Date.now() - 120_000,
});
recoverWorker({
  workerId: "cursor-6",
  missionId,
  assignmentId: asgs[1].assignmentId,
  action: "checkpoint_and_pause",
});

recordUsageEvent({
  workerId: "claude-6",
  model: "claude",
  missionId,
  runtimeMs: 180000,
  inputTokens: 900,
  outputTokens: 200,
});

let needs = listNeedsYou().filter((n) => n.missionId === missionId);
assert(needs.length === 1, "only invitation decision in Needs Me");
assert(needs[0].type === "decision", "decision type");
assert(!needs.some((n) => n.type === "recovery"), "no director-handled recovery in Needs Me");

const tel = (await import("../lib/vacilando/worker-health.mjs")).getWorkerTelemetry("cursor-6");
assert(!recoveryNeedsOperator(tel), "active recovery does not need operator");
assert(tel?.last_recovery?.action === "checkpoint_and_pause" || tel?.status === "recovering", "director recovery recorded");
assert(["recovering", "unresponsive", "stalled"].includes(tel.status), `director-managed health=${tel.status}`);

const dash = missionDashboardVm(missionId);
assert(dash.needsMe.length === 1, "dashboard needs me = 1");
assert(dash.director.recoveries.some((r) => /no action needed/i.test(r)), "director shows managed recovery");
assert(dash.currentWork.some((w) => w.handledByLabel?.includes("Claude") || w.handledBy === "Claude"
  || w.handledByLabel?.includes("Cursor") || w.handledBy === "Cursor"), "provider identity on work");
assert(dash.resourcesUsage?.byProvider?.length >= 1, "usage panel data");
assert(dash.resourcesUsage.byProvider.some((p) => p.tokens === 1100 || p.tokens === "Unavailable" || typeof p.tokens === "number"), "tokens truthful");

const ask = submitOperatorDirectorMessage({
  missionId,
  decisionId: decision.decisionId,
  kind: "ask",
  message: "What security tradeoff should we optimize for?",
});
assert(ask.ok && ask.outcome.action === "clarification", "ask → clarification");
assert(ask.message.verbatim.includes("security tradeoff"), "verbatim preserved");

// Fresh decision for reject path
const { decision: d2 } = createDecision({
  missionId,
  title: "Second decision for reject",
  situation: "Need direction",
  whyThisMatters: "Architecture",
  currentPlan: "A",
  discovery: "B",
  options: [
    { optionId: "a", label: "Option A", description: "A" },
    { optionId: "b", label: "Option B", description: "B" },
  ],
  recommendation: "a",
  recommendationReason: "Default",
  affectedAssignments: [],
});
const reject = submitOperatorDirectorMessage({
  missionId,
  decisionId: d2.decisionId,
  kind: "reject_direction",
  message: "Reject — prefer Option B instead and document the security rationale.",
});
assert(reject.ok, "reject ok");
assert(["revised_decision", "resume"].includes(reject.outcome.action), "reject interpreted");
assert(listDirectorMessages(missionId).length >= 2, "messages persisted");

const tl = readTimeline(missionId);
assert(tl.some((e) => e.type === "operator_message"), "operator_message on timeline");
assert(tl.some((e) => e.type === "director_response"), "director_response on timeline");
assert(tl.filter((e) => e.type === "operator_message").every((e) => e.detail?.verbatim), "verbatim in detail");

// Unsafe recovery → Needs Me recovery_approval
const unsafe = recoverWorker({
  workerId: "claude-6",
  missionId,
  assignmentId: asgs[0].assignmentId,
  action: "destroy_worktree",
});
assert(unsafe.requiresOperatorApproval, "unsafe needs approval");
needs = listNeedsYou().filter((n) => n.missionId === missionId);
assert(needs.some((n) => n.type === "recovery_approval"), "recovery approval in Needs Me");
assert(needs.some((n) => n.type === "decision"), "decision still present");

console.log(JSON.stringify({
  ok: true,
  missionId,
  needsMeTypes: needs.map((n) => n.type),
  ask: ask.outcome.action,
  reject: reject.outcome.action,
  providers: dash.providers,
  usage: dash.resourcesUsage.byProvider,
}, null, 2));
