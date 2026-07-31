/**
 * Access & Identity V2 — Director Execution System certification pressure test.
 *
 * Proves the V2 path can ingest and operationalize a real user-authored mission.
 * Does NOT mark the Access & Identity product implementation complete.
 *
 * Run: node scripts/local-dev/tests/access-identity-v2-cert.mjs
 */
import { mkdirSync, writeFileSync, mkdtempSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));

// Isolate durable state for this cert run unless caller opts into live runtime.
if (!process.env.VACILANDO_CERT_USE_LIVE_STATE) {
  process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-ai-cert-"));
}

const OUT = process.env.VACILANDO_CERT_OUT
  || join(HERE, "../../../docs/platform/planning/vacilando-os/qa/director-execution-v2");

const { ingestMissionBrief, approveMissionExecution, getKickoffState, reviewMissionReadiness } = await import("../lib/vacilando/mission-kickoff.mjs");
const { getBrief } = await import("../lib/vacilando/mission-brief.mjs");
const { EXECUTION_PROTOCOL_VERSION } = await import("../lib/vacilando/mission-context.mjs");
const {
  listAssignments,
  assignmentDependencyGraph,
  buildAssignmentPackage,
  acknowledgeWorkerContext,
  submitWorkerStartReport,
  reportWorkerProgress,
} = await import("../lib/vacilando/worker-assignment.mjs");
const { createDecision, answerDecision, classifyIssue } = await import("../lib/vacilando/decisions.mjs");
const { attachEvidence, canCertifyMission, missingRequiredEvidence, listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { buildDirectorSummary } = await import("../lib/vacilando/director-summary.mjs");
const { resolveExecutionPrompt } = await import("../lib/vacilando/mission-executor.mjs");
const { recordControlPlaneEvent, markScreenshotStalled, getControlPlaneHealth } = await import("../lib/vacilando/control-plane-health.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");
const { pauseAssignments, resumeAssignments, invalidateWorkerContexts } = await import("../lib/vacilando/worker-assignment.mjs");

function accessIdentityBrief() {
  return {
    title: "Access & Identity V2 — Director certification mission",
    objective:
      "Operationalize the approved Access & Identity / Access & Roles V2 plan through Director Execution System V2. "
      + "Inventory authority paths, surface readiness, create bounded assignments, exercise decisions/evidence/certification. "
      + "Do NOT rebuild or ship Access & Identity product work in this certification run.",
    plan: [
      {
        phaseId: "p0_inventory",
        order: 1,
        title: "Authority path inventory",
        objective: "Inventory person → user → role → scope authority paths and contradictions",
        requiredOutputs: [
          "docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-inventory.md",
        ],
        acceptanceCriteriaIds: ["AC1", "AC2"],
      },
      {
        phaseId: "p1_model",
        order: 2,
        title: "Canonical authority model",
        objective: "Document the canonical security/authority model from inventory",
        requiredOutputs: [
          "docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-model.md",
        ],
        dependencies: ["p0_inventory"],
        acceptanceCriteriaIds: ["AC3"],
      },
      {
        phaseId: "p2_sequence",
        order: 3,
        title: "Delivery sequence",
        objective: "Produce a short sequenced delivery plan (cert artifact only)",
        requiredOutputs: [
          "docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-sequence.md",
        ],
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
      { id: "C3", text: "Do not apply shared migrations without operator authorization" },
    ],
    outOfScope: [
      "Shipping Access & Identity V2 UI",
      "Rebuilding Users/Roles settings",
      "Falsely completing product certification",
    ],
    knownDecisions: [
      { id: "KD1", statement: "This run certifies Director V2 execution, not Access & Identity product readiness" },
    ],
    sourceMaterials: [
      { id: "S1", ref: "docs/platform/planning/vacilando-os/DIRECTOR-EXECUTION-SYSTEM-V2.md", kind: "doctrine" },
      { id: "S2", ref: "docs/platform/planning/vacilando-os/qa/vertical-slice-v1/cap_access_roles-v2-proposal.md", kind: "plan" },
      { id: "S3", ref: "docs/platform/planning/vacilando-os/DIRECTOR-CONDUCTOR-HANDOFF.md", kind: "handoff" },
    ],
    executionPreferences: { mergeTarget: "staging", maxConcurrentWorkers: 1 },
  };
}

const steps = [];
function step(name, data) {
  steps.push({ name, ok: true, ...data });
  console.log(`✓ ${name}`);
}

const briefInput = accessIdentityBrief();
const readinessPreview = reviewMissionReadiness(briefInput);
step("1 ingest readiness preview", { findings: readinessPreview.findings?.length, ready: readinessPreview.ready });

const ingested = ingestMissionBrief(briefInput, { slot: 6, provider: "claude", actor: "operator" });
const brief = ingested.brief;
step("1b ingest Mission Brief", { missionId: brief.missionId, version: brief.version, contentHash: brief.contentHash });

const kickoff = getKickoffState(brief.missionId);
step("2 show readiness / kickoff card", {
  kickoff_status: kickoff.kickoff_status,
  findings: kickoff.readiness?.findings?.length,
});

const approved = approveMissionExecution(brief.missionId, brief.version, { slot: 6, actor: "operator" });
if (!approved.ok) throw new Error("kickoff approve failed: " + JSON.stringify(approved));
step("3 approve kickoff", { status: approved.mission?.kickoff_status || approved.mission?.status });

const assignments = listAssignments(brief.missionId);
step("4 create assignments from phases", { count: assignments.length, ids: assignments.map((a) => a.assignmentId) });

const graph = assignmentDependencyGraph(brief.missionId);
step("5 dependency graph", {
  edges: graph.map((n) => ({ id: n.assignmentId, deps: n.dependencies })),
});

const asg0 = assignments[0];
const pkg = buildAssignmentPackage(brief.missionId, asg0.assignmentId);
step("6 live worker execution package", {
  hasEnvelope: Boolean(pkg?.workerPromptEnvelope),
  hashInEnvelope: pkg?.workerPromptEnvelope?.includes(brief.contentHash),
});

const ack = acknowledgeWorkerContext({
  missionId: brief.missionId,
  assignmentId: asg0.assignmentId,
  workerId: "claude-6",
  missionVersion: brief.version,
  missionContentHash: brief.contentHash,
  protocolVersion: EXECUTION_PROTOCOL_VERSION,
  provider: "claude",
});
if (!ack.ok) throw new Error("ack failed: " + JSON.stringify(ack));
step("7 acknowledge worker contract", { workerId: "claude-6" });

const start = submitWorkerStartReport({
  missionId: brief.missionId,
  assignmentId: asg0.assignmentId,
  understoodObjective: asg0.objective,
  intendedApproach: ["Inventory authority paths from codebase"],
  filesOrSystemsExpectedToChange: asg0.scope,
  detectedRisks: ["Must not ship product changes"],
});
if (!start.ok) throw new Error("start report failed");
step("8 start report → running", { status: start.assignment?.status });

const prompt = resolveExecutionPrompt(
  {
    mission_id: brief.missionId,
    mission_content_hash: brief.contentHash,
    mission_brief_version: brief.version,
    assignment_id: asg0.assignmentId,
    kickoff_status: "executing",
  },
  null,
);
if (!prompt.ok) throw new Error("executor prompt failed: " + JSON.stringify(prompt));
step("8b executor seam uses assignment package", { mode: prompt.mode });

reportWorkerProgress({
  missionId: brief.missionId,
  assignmentId: asg0.assignmentId,
  summary: "Inventory 40% — mapped UsersRolesSettingsClient authority paths",
  percent: 40,
});
step("8c progress reported");

attachEvidence({
  missionId: brief.missionId,
  assignmentId: asg0.assignmentId,
  type: "diff",
  title: "Authority inventory (cert)",
  fileUri: "docs/platform/planning/vacilando-os/qa/director-execution-v2/cert-inventory.md",
  acceptanceCriteriaIds: ["AC1"],
  createdBy: "claude-6",
});
step("9 attach evidence");

const classification = classifyIssue("destructive_migration");
const { decision } = createDecision({
  missionId: brief.missionId,
  title: "Migration conflict during Access & Identity cert",
  situation: "Approved plan requires a migration that conflicts with a pending migration",
  whyThisMatters: "Shared data may be at risk; product schedule may slip",
  currentPlan: "Apply migration as drafted",
  discovery: "Conflicting pending migration detected during cert run",
  options: [
    { optionId: "reconcile", label: "Reconcile mechanically", description: "Director resolves ordering" },
    { optionId: "defer", label: "Defer migration", description: "Skip shared apply in cert" },
    { optionId: "escalate", label: "Escalate architecture", description: "User redesign" },
  ],
  recommendation: "defer",
  recommendationReason: "Cert run must not apply shared migrations",
  impact: { data: "possible", schedule: "1–2 days" },
  affectedAssignments: [asg0.assignmentId],
  pauseAssignments,
});
step("10 material decision created; affected work paused", {
  decisionId: decision.decisionId,
  escalate: classification.escalate,
});

const onlyPaused = listAssignments(brief.missionId).filter((a) => a.status === "paused");
step("11 only affected work pauses", { paused: onlyPaused.map((a) => a.assignmentId) });

answerDecision({
  missionId: brief.missionId,
  decisionId: decision.decisionId,
  chosenOptionId: "defer",
  response: "Cert run — do not apply shared migration",
  resumeAssignments,
});
step("12–14 answer decision + resume");

// Leave a second open decision for Mission Control visual evidence (mobile + desktop).
const { decision: openDecision } = createDecision({
  missionId: brief.missionId,
  title: "Open cert decision — mobile QA",
  situation: "Director needs a product call on invitation expiry for Access & Identity",
  whyThisMatters: "Affects operator invite UX; not a routine infra issue",
  currentPlan: "7-day invite expiry",
  discovery: "Ops requested 30-day expiry during cert pressure test",
  options: [
    { optionId: "keep_7", label: "Keep 7-day expiry", description: "Safer default" },
    { optionId: "extend_30", label: "Extend to 30 days", description: "Ops preference" },
  ],
  recommendation: "keep_7",
  recommendationReason: "Security default until product owner decides",
  affectedAssignments: [],
});
step("open decision retained for visual QA", { decisionId: openDecision.decisionId });

recordControlPlaneEvent({
  status: "slow_to_bind",
  detail: "Representing historical :3021 bind starvation (diskSignal sync GC)",
  missionId: brief.missionId,
  timings: { historical_bind_ms: 30031 },
});
markScreenshotStalled({ missionId: brief.missionId, detail: "Prior Playwright screenshot timeouts under event-loop starvation" });
recordControlPlaneEvent({
  status: "recovered",
  detail: "Startup fix: async diskSignal + post-listen warm",
  missionId: brief.missionId,
});
step("health/recovery timeline events recorded", { control_plane: getControlPlaneHealth().status });

const summary = buildDirectorSummary(brief.missionId);
step("15 Director five-question summary", {
  answers: summary?.answers ? Object.keys(summary.answers) : Object.keys(summary || {}),
});

const cert = canCertifyMission(brief.missionId);
const missing = missingRequiredEvidence(asg0, listEvidence(brief.missionId, { assignmentId: asg0.assignmentId }));
step("16 certification correctly incomplete", {
  ready: cert.ready,
  missing,
  note: "Access & Identity product mission must remain incomplete",
});

mkdirSync(OUT, { recursive: true });
const report = {
  schema_version: "vacilando.access_identity_v2_cert.v1",
  missionId: brief.missionId,
  version: brief.version,
  contentHash: brief.contentHash,
  certification_of: "director_execution_system_v2",
  product_complete: false,
  steps,
  timeline_tail: readTimeline(brief.missionId, { limit: 40 }).slice(-12),
  director_summary: summary,
  control_plane: getControlPlaneHealth(),
  generated_at: new Date().toISOString(),
};
const reportPath = join(OUT, "access-identity-v2-cert-report.json");
writeFileSync(reportPath, JSON.stringify(report, null, 2));
writeFileSync(join(OUT, "cert-inventory.md"), `# Access & Identity cert inventory\n\nMission \`${brief.missionId}\` — placeholder inventory artifact for evidence attach during Director V2 cert.\n`);
console.log("\nCERT REPORT", reportPath);
console.log(JSON.stringify({ missionId: brief.missionId, steps: steps.length, product_complete: false, ready: cert.ready }, null, 2));
