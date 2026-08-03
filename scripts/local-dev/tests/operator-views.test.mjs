/**
 * Operator view-model smoke tests — presentation adapters must return plain-language surfaces.
 * Run: node scripts/local-dev/tests/operator-views.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-ovm-"));

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { createDecision } = await import("../lib/vacilando/decisions.mjs");
const { pauseAssignments, listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");
const { appendTimelineEvent } = await import("../lib/vacilando/timeline.mjs");
const { attachEvidence } = await import("../lib/vacilando/evidence.mjs");
const {
  missionsHomeVm,
  missionDashboardVm,
  evidenceCardVm,
  listNeedsYou,
  kickoffVm,
} = await import("../lib/vacilando/presentation/operator-views.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const brief = {
  title: "Access & Identity V2",
  objective: "Certify Mission Control productization without shipping Access & Identity product work.",
  plan: [
    { phaseId: "p1", order: 1, title: "Authority Path Inventory", objective: "Inventory", requiredOutputs: ["a.md"], acceptanceCriteriaIds: ["AC1"] },
    { phaseId: "p2", order: 2, title: "Model", objective: "Model", requiredOutputs: ["b.md"], dependencies: ["p1"], acceptanceCriteriaIds: ["AC2"] },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory grounded" },
    { id: "AC2", statement: "Model documented" },
  ],
  constraints: [{ id: "C1", text: "Do not mark product complete" }],
  sourceMaterials: [{ id: "S1", ref: "docs/example.md" }],
};

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const missionId = ingested.brief.missionId;
approveMissionExecution(missionId, ingested.brief.version, { slot: 6, actor: "operator" });
const asgs = listAssignments(missionId);
createDecision({
  missionId,
  title: "How should invitation expiry work?",
  situation: "Ops asked for 30 days; plan says 7.",
  whyThisMatters: "Security vs onboarding friction",
  currentPlan: "7-day expiry",
  discovery: "Ops preference during cert",
  options: [
    { optionId: "keep_7", label: "Keep 7-day expiry", description: "Safer" },
    { optionId: "extend_30", label: "Extend to 30 days", description: "Ops preference" },
  ],
  recommendation: "keep_7",
  recommendationReason: "Security default",
  impact: { security: "Longer window", schedule: "Unblocks model" },
  affectedAssignments: [asgs[0].assignmentId],
  pauseAssignments,
});
appendTimelineEvent(missionId, {
  type: "progress",
  summary: "Inventory halfway through authority mapping",
  visibility: "summary",
  actor: "claude-6",
});
attachEvidence({
  missionId,
  type: "diff",
  title: "Inventory note",
  description: "Proves AC1 coverage start",
  fileUri: "/tmp/should-not-be-primary.md",
  acceptanceCriteriaIds: ["AC1"],
  createdBy: "claude-6",
});

const home = missionsHomeVm();
assert(home.missions.length >= 1, "home has missions");
const card = home.missions.find((m) => m.missionId === missionId);
assert(card.title === "Access & Identity V2", "title");
assert(!/msn_/.test(card.statusLabel), "status is plain language");
assert(card.primaryAction?.label, "primary action");

const overview = missionDashboardVm(missionId);
assert(overview.kind === "mission_dashboard", "dashboard kind");
assert(overview.director?.assessment, "director visible");
assert(overview.summary?.confidencePercent != null, "confidence");
assert(overview.topDecision || overview.needsMe?.length, "needs action surface");
assert(!JSON.stringify(overview.summary).includes("fileUri"), "summary has no paths");

const { timelinePageVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const tl = timelinePageVm(missionId);
assert(tl.events.length > 0, "timeline non-empty");
assert(tl.events.every((e) => e.headline && !/^tle_/.test(e.headline)), "operator headlines");

const needs = listNeedsYou();
assert(needs.some((n) => n.type === "decision"), "needs-you has decision");

const ev = evidenceCardVm({
  evidenceId: "ev_1",
  type: "diff",
  title: "Inventory note",
  description: "Proves inventory grounding",
  fileUri: "/secret/path/file.md",
  acceptanceCriteriaIds: ["AC1"],
  createdBy: "claude-6",
  createdAt: new Date().toISOString(),
});
assert(/inventory/i.test(ev.proves), "proves text");
assert(ev.technicalPath, "path only in technical");

const kick = kickoffVm(null);
assert(kick.mode === "empty", "empty kickoff");

assert((overview.topDecision || overview.needsMe[0]).statusLabel !== "open" || overview.needsMe.length, "operator copy");
assert(overview.director.recommendation, "director recommendation");

console.log(JSON.stringify({
  ok: true,
  missionId,
  homeCards: home.missions.length,
  timelineEvents: tl.events.length,
  needsYou: needs.length,
  confidence: overview.summary.confidencePercent,
  director: overview.director.assessment,
}, null, 2));
