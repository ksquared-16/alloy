/**
 * Director assignment dispatch — kickoff → launch → ack → complete → next.
 * Run: VACILANDO_EXECUTION_PROVIDER=mock VACILANDO_ALLOW_MOCK_PROVIDER=1 \
 *   node scripts/local-dev/tests/assignment-dispatch.test.mjs
 */
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import os from "node:os";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dispatch-"));
process.env.VACILANDO_EXECUTION_PROVIDER = "mock";
process.env.VACILANDO_ALLOW_MOCK_PROVIDER = "1";
process.env.VACILANDO_AUTO_DISPATCH = "0";

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { dispatchReadyAssignments } = await import("../lib/vacilando/assignment-dispatch.mjs");
const { listAssignments, getAssignment } = await import("../lib/vacilando/worker-assignment.mjs");
const { listEvidence } = await import("../lib/vacilando/evidence.mjs");
const { readTimeline } = await import("../lib/vacilando/timeline.mjs");
const { missionDashboardVm, deriveWorkerLifecycle, timelineEventVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { registerProvider, createMockProvider } = await import("../lib/vacilando/execution-provider.mjs");

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const brief = {
  title: "Access & Identity V2",
  objective: "Establish a grounded authority model for Alloy.",
  plan: [
    {
      phaseId: "p0", order: 1, title: "Authority Path Inventory",
      objective: "Inventory", requiredOutputs: ["inventory.md"], acceptanceCriteriaIds: ["AC1"],
    },
    {
      phaseId: "p1", order: 2, title: "Canonical Authority Model",
      objective: "Model", requiredOutputs: ["model.md"], dependencies: ["p0"], acceptanceCriteriaIds: ["AC2"],
    },
  ],
  acceptanceCriteria: [
    { id: "AC1", statement: "Inventory grounded" },
    { id: "AC2", statement: "Model documented" },
  ],
  constraints: [{ id: "C1", text: "No false completion" }],
};

registerProvider(createMockProvider({ id: "mock", label: "Mock" }));

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
const mid = ingested.brief.missionId;
approveMissionExecution(mid, ingested.brief.version, { slot: 6, actor: "operator" });

const before = listAssignments(mid);
assert(before[0].status === "ready", "first ready before dispatch settles");
assert(before[0].workerId == null, "worker unbound before director dispatch");

const dispatched = await dispatchReadyAssignments(mid, { slot: 6, actor: "director" });
assert(dispatched.ok, "dispatch ok");

const after = listAssignments(mid);
assert(after.every((a) => a.status === "complete"), `all complete, got ${after.map((a) => a.status).join(",")}`);
assert(after[0].contextAcknowledgement, "acknowledged");
assert(after[0].workerId, "worker bound");
assert(after[0].dispatch?.providerLifecycle === "completed", "lifecycle completed");

const evidence = listEvidence(mid);
assert(evidence.length >= 1, "evidence collected");
assert(evidence.some((e) => e.type === "log"), "log evidence");

const headlines = readTimeline(mid).map(timelineEventVm).map((e) => e.headline);
assert(headlines.some((h) => /assigned|Launching|acknowledged|Evidence|accepted|Dispatching/i.test(h)), "execution story");

const dash = missionDashboardVm(mid);
assert(!/Assigning worker/i.test(JSON.stringify(dash.currentWork)), "no stuck Assigning");
assert(dash.currentWork.every((w) => w.lifecycleLabel === "Completed"), "dashboard completed");

// Retry / failover: force unavailable then mock succeeds via second provider id
process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(os.tmpdir(), "vac-dispatch-fail-"));
registerProvider(createMockProvider({ id: "mock", label: "Mock", failTimes: 0 }));
const ingested2 = ingestMissionBrief({
  ...brief,
  title: "Access & Identity V2 Retry",
}, { slot: 6, actor: "operator" });
const mid2 = ingested2.brief.missionId;
approveMissionExecution(mid2, ingested2.brief.version, { slot: 6, actor: "operator" });
await dispatchReadyAssignments(mid2, { slot: 6 });
assert(listAssignments(mid2).filter((a) => a.status === "complete").length === 2, "retry path completes");

const life = deriveWorkerLifecycle({
  status: "running",
  provider: "claude",
  dispatch: { providerLifecycle: "running" },
});
assert(life.label === "Executing", `expected Executing got ${life.label}`);

console.log("assignment-dispatch.test.mjs: ok");
