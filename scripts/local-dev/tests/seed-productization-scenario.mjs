/**
 * Seed a truthful Access & Identity productization scenario into live Vacilando state.
 *
 * Scenario shape (Director cert — NOT product-complete):
 * - current phase with 3 deliverables
 * - 1 complete, 1 paused by decision, 1 waiting
 * - 1 open decision with rich operator copy
 * - 1 unhealthy worker with Director recovery
 * - timeline history + multiple evidence artifacts
 * - incomplete acceptance / certification
 *
 * Run against live runtime:
 *   VACILANDO_CERT_USE_LIVE_STATE=1 node scripts/local-dev/tests/seed-productization-scenario.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdtempSync } from "node:fs";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
if (!process.env.VACILANDO_CERT_USE_LIVE_STATE) {
  process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-prod-seed-"));
}

const { ingestMissionBrief, approveMissionExecution, reviewMissionReadiness } = await import("../lib/vacilando/mission-kickoff.mjs");
const { EXECUTION_PROTOCOL_VERSION } = await import("../lib/vacilando/mission-context.mjs");
const {
  listAssignments,
  acknowledgeWorkerContext,
  submitWorkerStartReport,
  reportWorkerProgress,
  submitWorkerCompletion,
  validateAssignmentCompletion,
  pauseAssignments,
  resumeAssignments,
} = await import("../lib/vacilando/worker-assignment.mjs");
const { createDecision } = await import("../lib/vacilando/decisions.mjs");
const { attachEvidence, canCertifyMission, listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { buildDirectorSummary, listMissionsV2 } = await import("../lib/vacilando/director-summary.mjs");
const { recordHeartbeat, recoverWorker } = await import("../lib/vacilando/worker-health.mjs");
const { appendTimelineEvent, readTimeline } = await import("../lib/vacilando/timeline.mjs");
const {
  missionsHomeVm,
  missionOverviewVm,
  timelinePageVm,
  listNeedsYou,
} = await import("../lib/vacilando/presentation/operator-views.mjs");

function brief() {
  return {
    title: "Access & Identity V2",
    objective:
      "Demonstrate Director-managed mission execution for Access & Identity V2 planning artifacts. "
      + "This certifies Mission Control productization — not that Access & Identity product work is shipped.",
    plan: [
      {
        phaseId: "p0_inventory",
        order: 1,
        title: "Authority Path Inventory",
        objective: "Inventory person → user → role → scope authority paths",
        requiredOutputs: ["docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-inventory.md"],
        acceptanceCriteriaIds: ["AC1", "AC2"],
      },
      {
        phaseId: "p1_model",
        order: 2,
        title: "Canonical Authority Model",
        objective: "Document the canonical authority model from inventory",
        requiredOutputs: ["docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-model.md"],
        dependencies: ["p0_inventory"],
        acceptanceCriteriaIds: ["AC3"],
      },
      {
        phaseId: "p2_sequence",
        order: 3,
        title: "Delivery Sequence",
        objective: "Produce a short sequenced delivery plan (cert artifact only)",
        requiredOutputs: ["docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-sequence.md"],
        dependencies: ["p1_model"],
        acceptanceCriteriaIds: ["AC4"],
      },
    ],
    acceptanceCriteria: [
      { id: "AC1", statement: "Inventory is file/line grounded against the live codebase" },
      { id: "AC2", statement: "Contradictions and gaps are enumerated" },
      { id: "AC3", statement: "Canonical authority model is documented" },
      { id: "AC4", statement: "Sequenced delivery plan is present" },
      { id: "AC5", statement: "Browser QA screenshots attached for Mission Control surfaces" },
    ],
    constraints: [
      { id: "C1", text: "Do not push, merge, or promote" },
      { id: "C2", text: "Do not mark Access & Identity product implementation complete" },
    ],
    outOfScope: ["Shipping Access & Identity V2 UI", "Falsely completing product certification"],
    knownDecisions: [
      { id: "KD1", statement: "This run certifies Director + Mission Control — not Access & Identity product readiness" },
    ],
    sourceMaterials: [
      { id: "S1", ref: "docs/platform/planning/vacilando-os/DIRECTOR-EXECUTION-SYSTEM-V2.md", kind: "doctrine" },
    ],
    executionPreferences: { mergeTarget: "staging", maxConcurrentWorkers: 2 },
  };
}

const input = brief();
reviewMissionReadiness(input);
const ingested = ingestMissionBrief(input, { slot: 6, provider: "claude", actor: "operator" });
const missionId = ingested.brief.missionId;
const version = ingested.brief.version;
const hash = ingested.brief.contentHash;

const approved = approveMissionExecution(missionId, version, { slot: 6, actor: "operator" });
if (!approved.ok) throw new Error("approve failed: " + JSON.stringify(approved));

const assignments = listAssignments(missionId);
const [a0, a1, a2] = assignments;
if (assignments.length < 3) throw new Error("expected 3 assignments");

// Worker A — inventory complete
acknowledgeWorkerContext({
  missionId, assignmentId: a0.assignmentId, workerId: "claude-6",
  missionVersion: version, missionContentHash: hash,
  protocolVersion: EXECUTION_PROTOCOL_VERSION, provider: "claude",
});
submitWorkerStartReport({
  missionId, assignmentId: a0.assignmentId,
  understoodObjective: a0.objective,
  intendedApproach: ["Map authority paths"],
  filesOrSystemsExpectedToChange: a0.scope,
  detectedRisks: [],
});
reportWorkerProgress({
  missionId, assignmentId: a0.assignmentId,
  summary: "Mapped UsersRolesSettingsClient and admin access gates",
  percent: 100,
});
attachEvidence({
  missionId, assignmentId: a0.assignmentId, type: "diff",
  title: "Authority path inventory",
  description: "Grounded inventory of person → user → role → scope paths",
  fileUri: "docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-inventory.md",
  acceptanceCriteriaIds: ["AC1", "AC2"], createdBy: "claude-6",
});
attachEvidence({
  missionId, assignmentId: a0.assignmentId, type: "test",
  title: "Inventory review checks",
  description: "Manual review checklist for authority inventory",
  command: "manual inventory review",
  exitCode: 0,
  acceptanceCriteriaIds: ["AC1"], createdBy: "claude-6",
});
attachEvidence({
  missionId, assignmentId: a0.assignmentId, type: "typecheck",
  title: "Typecheck clean for inventory scope",
  description: "No type errors in reviewed access paths",
  command: "npm run typecheck",
  exitCode: 0,
  acceptanceCriteriaIds: ["AC1"], createdBy: "claude-6",
});
attachEvidence({
  missionId, assignmentId: a0.assignmentId, type: "build",
  title: "Build probe",
  description: "Control plane remained accepting during inventory work",
  command: "curl /api/health",
  exitCode: 0,
  acceptanceCriteriaIds: [], createdBy: "system",
});
attachEvidence({
  missionId, assignmentId: a0.assignmentId, type: "commit",
  title: "Inventory commit placeholder",
  description: "Cert artifact commit reference",
  repositorySha: "productization01",
  acceptanceCriteriaIds: ["AC1"], createdBy: "claude-6",
});
submitWorkerCompletion({
  missionId, assignmentId: a0.assignmentId,
  status: "complete",
  summary: "Inventory deliverable ready for Director validation",
  changesMade: ["Mapped authority paths"],
  tests: [{ name: "manual review", result: "pass" }],
  residualRisks: [],
  followUpItems: [],
});
validateAssignmentCompletion(missionId, a0.assignmentId, { actor: "director" });

appendTimelineEvent(missionId, {
  type: "assignment_completed",
  summary: "Deliverable completed — Authority Path Inventory",
  visibility: "summary",
  assignmentId: a0.assignmentId,
  actor: "director",
});

// Worker B — model work paused by decision (unhealthy + recovering)
acknowledgeWorkerContext({
  missionId, assignmentId: a1.assignmentId, workerId: "claude-6b",
  missionVersion: version, missionContentHash: hash,
  protocolVersion: EXECUTION_PROTOCOL_VERSION, provider: "claude",
});
submitWorkerStartReport({
  missionId, assignmentId: a1.assignmentId,
  understoodObjective: a1.objective,
  intendedApproach: ["Draft canonical model from inventory"],
  filesOrSystemsExpectedToChange: a1.scope,
  detectedRisks: ["Invite expiry policy ambiguity"],
});
reportWorkerProgress({
  missionId, assignmentId: a1.assignmentId,
  summary: "Drafted model outline; blocked on invite-expiry product call",
  percent: 55,
});
recordHeartbeat({
  workerId: "claude-6b",
  missionId,
  assignmentId: a1.assignmentId,
  slot: 6,
  branch: "agent/claude/6-vacilando-os-product-def",
  port: 3016,
  processId: 424242,
  activeCommand: "drafting cert-model.md",
  progress: true,
  nowMs: Date.now() - 5 * 60_000,
});
// Force unresponsive then recover
{
  const { getWorkerTelemetry } = await import("../lib/vacilando/worker-health.mjs");
  const { writeFileSync: wfs, existsSync, mkdirSync: mks } = await import("node:fs");
  const { join: j } = await import("node:path");
  const root = process.env.ALLOY_RUNTIME_ROOT?.trim() || j(os.homedir(), ".local", "state", "alloy-dev");
  const dir = j(root, "vacilando", "worker-health");
  if (!existsSync(dir)) mks(dir, { recursive: true });
  const tel = getWorkerTelemetry("claude-6b");
  tel.status = "unresponsive";
  tel.detectedIssues = [{ kind: "missing_heartbeat", detail: "No heartbeat for over 90 seconds while drafting the authority model" }];
  tel.lastHeartbeatAt = new Date(Date.now() - 120_000).toISOString();
  wfs(j(dir, "claude-6b.json"), JSON.stringify(tel, null, 2));
}
recoverWorker({
  workerId: "claude-6b",
  action: "checkpoint_and_pause",
  missionId,
  assignmentId: a1.assignmentId,
  actor: "director",
});

const { decision } = createDecision({
  missionId,
  title: "How should invitation expiry work?",
  situation:
    "While drafting the canonical authority model, Director found that invite links currently expire in 7 days, "
    + "but operations asked for 30 days so site managers can finish onboarding without re-issuing invites.",
  whyThisMatters:
    "This changes who can still activate access after an invite is sent. It affects security exposure "
    + "and the day-to-day experience for new operators.",
  currentPlan: "Keep the approved 7-day invite expiry in the Access & Identity plan.",
  discovery:
    "Ops requested a 30-day window during certification pressure testing. No product decision is recorded yet.",
  options: [
    {
      optionId: "keep_7",
      label: "Keep 7-day expiry",
      description: "Safer default. Ops re-issues invites when needed.",
    },
    {
      optionId: "extend_30",
      label: "Extend to 30 days",
      description: "Matches ops preference. Slightly longer open invitation window.",
    },
    {
      optionId: "ask_more",
      label: "Ask for more context",
      description: "Director gathers more ops/security input before choosing.",
    },
  ],
  recommendation: "keep_7",
  recommendationReason: "Security default until a product owner explicitly accepts the longer window.",
  impact: {
    product: "Invite activation UX for new operators",
    data: "none",
    schedule: "Unblocks the authority model deliverable today",
    security: "Longer expiry widens the invite window",
  },
  evidence: [
    "Authority Path Inventory (accepted)",
    "Ops request captured during cert pressure test",
  ],
  affectedAssignments: [a1.assignmentId],
  pauseAssignments,
});

attachEvidence({
  missionId, assignmentId: a1.assignmentId, type: "screenshot",
  title: "Mission Overview — decision required",
  description: "Shows Director waiting on invitation expiry decision",
  fileUri: "docs/platform/planning/vacilando-os/qa/director-execution-v2/screenshots/mission-overview.png",
  acceptanceCriteriaIds: ["AC5"], createdBy: "director",
});
attachEvidence({
  missionId, type: "test",
  title: "Director presentation adapter smoke",
  description: "View-model builders return operator copy for missions, decisions, and timeline",
  command: "node scripts/local-dev/tests/operator-views.test.mjs",
  exitCode: 0,
  acceptanceCriteriaIds: ["AC5"], createdBy: "director",
});
attachEvidence({
  missionId, type: "typecheck",
  title: "Control-plane health probe",
  description: "Vacilando accepting requests after startup bind",
  command: "curl -sS http://127.0.0.1:3021/api/health",
  exitCode: 0,
  repositorySha: "productization",
  acceptanceCriteriaIds: [], createdBy: "system",
});
attachEvidence({
  missionId, type: "log",
  title: "Kickoff timeline",
  description: "Mission created and started with phase assignments",
  fileUri: "timeline.jsonl",
  acceptanceCriteriaIds: [], createdBy: "director",
});

// a2 remains waiting on a1
appendTimelineEvent(missionId, {
  type: "progress",
  summary: "Delivery Sequence waiting on Canonical Authority Model",
  visibility: "summary",
  assignmentId: a2.assignmentId,
  actor: "director",
});

const overview = missionOverviewVm(missionId);
const home = missionsHomeVm();
const timeline = timelinePageVm(missionId);
const needs = listNeedsYou();
const cert = canCertifyMission(missionId);
const summary = buildDirectorSummary(missionId);

const OUT = join(HERE, "../../../docs/platform/planning/vacilando-os/qa/director-execution-v2");
mkdirSync(OUT, { recursive: true });
const report = {
  schema_version: "vacilando.productization_seed.v1",
  missionId,
  product_complete: false,
  certification_ready: cert.ready,
  assignments: listAssignments(missionId).map((a) => ({ id: a.assignmentId, title: a.title, status: a.status })),
  decisionId: decision.decisionId,
  timeline_count: readTimeline(missionId).length,
  overview_header: overview?.header,
  needs_you_count: needs.length,
  director_answers: summary.answers,
  missions_on_home: home.missions.map((m) => m.missionId),
  live_missions: listMissionsV2().map((m) => m.mission_id),
  generated_at: new Date().toISOString(),
};
writeFileSync(join(OUT, "productization-seed-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
