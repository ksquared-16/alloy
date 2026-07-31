/**
 * Mission Dashboard V1 — confidence, dashboard VM, resources, usage.
 * Run: node scripts/local-dev/tests/mission-dashboard-v1.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dash-"));

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { createDecision } = await import("../lib/vacilando/decisions.mjs");
const { pauseAssignments, listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");
const { recordHeartbeat, recoverWorker } = await import("../lib/vacilando/worker-health.mjs");
const { attachEvidence } = await import("../lib/vacilando/evidence.mjs");
const { getMissionConfidence, CONFIDENCE_WEIGHTS } = await import("../lib/vacilando/mission-confidence.mjs");
const { missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { recordPlatformResourcesSnapshot, RESOURCE_KINDS } = await import("../lib/vacilando/platform-resources.mjs");
const { recordUsageEvent, summarizeUsage } = await import("../lib/vacilando/usage-ledger.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const brief = {
  title: "Access & Identity V2",
  objective: "Dashboard cert — not product complete",
  plan: [
    { phaseId: "p1", order: 1, title: "Authority Path Inventory", objective: "Inventory", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"] },
    { phaseId: "p2", order: 2, title: "Authority Resolver", objective: "Resolver", requiredOutputs: ["b.md"], dependencies: ["p1"], acceptanceCriteriaIds: ["AC2"] },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory grounded" },
    { id: "AC2", statement: "Resolver documented" },
  ],
  constraints: [{ id: "C1", text: "No false product completion" }],
};

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 6, actor: "operator" });
const asgs = listAssignments(missionId);

createDecision({
  missionId,
  title: "How should invitation expiry work?",
  situation: "Ops asked for 30 days",
  whyThisMatters: "Security vs onboarding",
  currentPlan: "7-day expiry",
  discovery: "Ops preference",
  options: [
    { optionId: "keep_7", label: "Keep 7-day expiry", description: "Safer" },
    { optionId: "extend_30", label: "Extend to 30 days", description: "Ops" },
  ],
  recommendation: "keep_7",
  recommendationReason: "Security default",
  impact: { security: "window", schedule: "unblocks" },
  affectedAssignments: [asgs[0].assignmentId],
  pauseAssignments,
});

recordHeartbeat({
  workerId: "claude-6",
  missionId,
  assignmentId: asgs[1]?.assignmentId || asgs[0].assignmentId,
  slot: 6,
  cpuPercent: 22,
  memoryMb: 512,
  progress: true,
});
recoverWorker({
  workerId: "claude-6",
  missionId,
  assignmentId: asgs[1]?.assignmentId || asgs[0].assignmentId,
  action: "checkpoint_and_pause",
});

attachEvidence({
  missionId,
  type: "diff",
  title: "Inventory",
  description: "Proves inventory",
  acceptanceCriteriaIds: ["AC1"],
  createdBy: "claude-6",
});

const conf = getMissionConfidence(missionId);
assert(conf.percent >= 0 && conf.percent <= 100, "confidence range");
assert(Object.keys(CONFIDENCE_WEIGHTS).length === 6, "six factors");
assert(conf.factors.architecture && conf.factors.implementation, "factor scores");

const dash = missionDashboardVm(missionId);
assert(dash.kind === "mission_dashboard", "dashboard kind");
assert(dash.summary.title === "Access & Identity V2", "title");
assert(dash.summary.confidencePercent === conf.percent, "confidence on summary");
assert(dash.director.assessment, "director assessment");
assert(Array.isArray(dash.needsMe) && dash.needsMe.length >= 1, "needs me");
assert(dash.currentWork.length >= 1, "current work");
assert(dash.currentWork[0].title && !/asg_/.test(dash.currentWork[0].title), "work-first no ids");
assert(!JSON.stringify(dash.summary).includes("content_hash"), "no hashes in summary");

const resources = recordPlatformResourcesSnapshot();
assert(resources.schema_version.includes("platform_resources"), "resources schema");
assert(RESOURCE_KINDS.includes("worker") && RESOURCE_KINDS.includes("calendar"), "resource kinds");

recordUsageEvent({
  workerId: "claude-6",
  model: "claude",
  missionId,
  runtimeMs: 120000,
  cpuPercent: 22,
  memoryMb: 512,
  inputTokens: 1000,
  outputTokens: 200,
});
const usage = summarizeUsage({ missionId });
assert(usage.events >= 1, "usage events");
assert(usage.runtime_ms >= 120000, "runtime tracked");

console.log(JSON.stringify({
  ok: true,
  missionId,
  confidence: conf.percent,
  director: dash.director.assessment,
  needsMe: dash.needsMe.length,
  currentWork: dash.currentWork.map((w) => w.title),
  nextCheckpoint: dash.summary.nextCheckpoint,
  resourcesPressure: resources.machine.pressure,
  usageEvents: usage.events,
}, null, 2));
