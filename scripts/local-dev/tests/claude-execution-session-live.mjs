/**
 * Live Claude Execution Session — Access & Identity V2 first deliverable.
 *
 * Requires authenticated Claude CLI. No mock.
 *
 * Run:
 *   VACILANDO_EXECUTION_PROVIDER=claude VACILANDO_AUTO_DISPATCH=0 \
 *     node scripts/local-dev/tests/claude-execution-session-live.mjs
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "../../..");

if (!process.env.VACILANDO_CERT_USE_LIVE_STATE) {
  process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-claude-live-"));
}
process.env.VACILANDO_EXECUTION_PROVIDER = "claude";
process.env.VACILANDO_AUTO_DISPATCH = "0";
delete process.env.VACILANDO_ALLOW_MOCK_PROVIDER;

/**
 * EVIDENCE GOES TO THE RUNTIME, NOT INTO THE CHECKOUT.
 *
 * This wrote its report into `docs/platform/planning/...` of the LIVE worktree
 * it happens to sit inside. A validation script that mutates an unrelated
 * working tree is indistinguishable, to whoever opens that worktree next, from
 * someone's uncommitted work — and one Vacilando worktree was found holding
 * exactly that: an unexplained modified planning document and an untracked
 * a.md, on no branch, that nobody could account for.
 *
 * The repository is still READ for deliverable existence. Only the write moved.
 */
const OUT_DIR = process.env.VACILANDO_EVIDENCE_DIR
  || join(process.env.ALLOY_RUNTIME_ROOT || join(process.env.HOME || "", ".local", "state", "alloy-dev"),
    "evidence", "access-identity-v2");
mkdirSync(OUT_DIR, { recursive: true });

const { precheckProvider } = await import("../lib/vacilando/provider-runtime.mjs");
const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { dispatchAssignment } = await import("../lib/vacilando/assignment-dispatch.mjs");
const { listAssignments, getAssignment } = await import("../lib/vacilando/worker-assignment.mjs");
const { listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");
const { missionDashboardVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { listExecutionSessions } = await import("../lib/vacilando/execution-session.mjs");
const { updateMission } = await import("../lib/vacilando/commands/missions.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const auth = await precheckProvider("claude", { force: true });
assert(auth.ok, `Claude not authenticated: ${auth.error || JSON.stringify(auth)}`);

const deliverable = "docs/platform/planning/vacilando-os/qa/access-identity-v2/authority-path-inventory.md";

const brief = {
  title: "Access & Identity V2",
  objective:
    "Establish a grounded authority model for Alloy: person → user → role → scope. "
    + "Produce an inventory of authority paths and contradictions from the live codebase.",
  plan: [
    {
      phaseId: "p0_inventory",
      order: 1,
      title: "Authority Path Inventory",
      objective:
        "Inventory person → user → role → scope authority paths in web/ and docs/platform. "
        + "Write a grounded markdown inventory with file references and contradictions.",
      requiredOutputs: [deliverable],
      acceptanceCriteriaIds: ["AC1", "AC2"],
    },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory is file-grounded against the live codebase" },
    { id: "AC2", statement: "Contradictions and gaps are enumerated" },
  ],
  constraints: [
    { id: "C1", text: "Do not push, merge, or open PRs" },
    { id: "C2", text: "Do not apply shared migrations" },
    { id: "C3", text: "Stay within this one deliverable" },
  ],
  outOfScope: ["Shipping Access & Identity UI", "Rebuilding Users/Roles settings"],
  knownDecisions: [
    { id: "KD1", statement: "Prefer persons + customer_persons over contacts for human identity" },
  ],
  sourceMaterials: [
    { id: "S1", ref: "docs/platform/core/entity-model.md", kind: "doctrine" },
    { id: "S2", ref: "docs/platform/governance/design-and-operational-doctrine.md", kind: "doctrine" },
  ],
  executionPreferences: {
    mergeTarget: "staging",
    maxConcurrentWorkers: 1,
    preferredProvider: "claude",
  },
};

console.log("Ingesting Access & Identity V2…");
const ingested = ingestMissionBrief(brief, { slot: 6, provider: "claude", actor: "operator" });
const mid = ingested.brief.missionId;
updateMission(mid, { executed_in: REPO, worktree: REPO, provider: "claude" });

const approved = approveMissionExecution(mid, ingested.brief.version, { slot: 6, actor: "operator" });
assert(approved.ok, "kickoff approve failed");

const asg = listAssignments(mid)[0];
assert(asg?.status === "ready", "assignment ready");

console.log(`Dispatching Claude execution session for ${asg.assignmentId}…`);
console.log(`Deliverable: ${deliverable}`);
const started = Date.now();
const result = await dispatchAssignment(mid, asg.assignmentId, { slot: 6, actor: "director" });
const elapsedSec = Math.round((Date.now() - started) / 1000);

const final = getAssignment(mid, asg.assignmentId);
const evidence = listEvidence(mid, { assignmentId: asg.assignmentId });
const sessions = listExecutionSessions({ missionId: mid });
const timeline = readTimeline(mid);
const dash = missionDashboardVm(mid);

const report = {
  missionId: mid,
  assignmentId: asg.assignmentId,
  dispatchResult: result,
  assignmentStatus: final?.status,
  providerLifecycle: final?.dispatch?.providerLifecycle,
  sessionId: final?.dispatch?.sessionId || sessions[0]?.sessionId,
  sessionStatus: sessions[0]?.status,
  completionPackage: sessions[0]?.completionPackage || null,
  evidence: evidence.map((e) => ({ type: e.type, title: e.title, fileUri: e.fileUri })),
  deliverableExists: existsSync(join(REPO, deliverable)),
  elapsedSec,
  timelineHeadlines: timeline.slice(-20).map((e) => e.headline || e.summary),
  dashboardFocus: dash?.director?.focus || [],
};

const outPath = join(OUT_DIR, "claude-provider-v1-live-run.json");
writeFileSync(outPath, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

assert(result.ok || result.error === "awaiting_decision", `dispatch failed: ${JSON.stringify(result)}`);
if (result.ok) {
  assert(final?.status === "complete", "assignment complete");
  assert(evidence.some((e) => e.type === "log"), "log evidence");
  assert(evidence.some((e) => e.type === "notes" || e.type === "document"), "richer evidence");
  assert(report.deliverableExists || (sessions[0]?.completionPackage?.filesModified || []).length, "deliverable or files claimed");
}

console.log(`\nClaude Provider V1 live run OK (${elapsedSec}s). Report: ${outPath}`);
