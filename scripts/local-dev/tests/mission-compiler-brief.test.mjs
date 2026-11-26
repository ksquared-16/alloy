/**
 * Mission Compiler V1 — Brief → Compiled Mission.
 * Run: node scripts/local-dev/tests/mission-compiler-brief.test.mjs
 */
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const root = mkdtempSync(join(tmpdir(), "vac-compiler-"));
process.env.ALLOY_RUNTIME_ROOT = root;
process.env.VACILANDO_AUTO_DISPATCH = "0";
process.env.ALLOY_WORKTREE = root;

// Seed accepted A&I artifacts inside the fake worktree
const aiDir = join(root, "docs/platform/planning/vacilando-os/qa/access-identity-v2");
mkdirSync(aiDir, { recursive: true });
for (const name of [
  "01-existing-state-inventory.md",
  "02-canonical-access-identity-model.md",
  "03-implementation-qa-sequence.md",
  "authority-path-inventory.md",
]) {
  writeFileSync(join(aiDir, name), `# ${name}\n\nAccepted artifact body for compiler reuse tests.\n`.repeat(20));
}

const { ingestMissionBrief, approveMissionExecution } = await import("../lib/vacilando/mission-kickoff.mjs");
const { compileMissionBrief, getCompiledMission, compile } = await import("../lib/vacilando/mission-compiler.mjs");
const { buildMissionContextPackage } = await import("../lib/vacilando/mission-context.mjs");
const { kickoffVm } = await import("../lib/vacilando/presentation/operator-views.mjs");
const { listAssignments } = await import("../lib/vacilando/worker-assignment.mjs");

// Legacy package compiler still exported
assert.equal(typeof compile, "function");

const brief = {
  title: "Access and Roles mission > **Create a complete, understandable, and c…",
  objective: "Discover and specify Access & Identity V2. Inventory the existing implementation, identify all authority paths and gaps, define the canonical product and security model, produce operator flows and implementation-ready specifications, and return a sequenced delivery plan. Do not materially implement the product except for disposable investigation tooling.",
  plan: [{
    phaseId: "p1",
    order: 1,
    title: "Access and Roles mission > **Create a complete, understandable, and c…",
    objective: "Access and Roles mission > **Create a complete, understandable, and c…",
    requiredOutputs: [],
    dependencies: [],
    acceptanceCriteriaIds: ["AC1"],
    kind: "implement",
  }],
  acceptanceCriteria: [{ id: "AC1", statement: "…and c… is complete with evidence", evidenceType: null }],
  constraints: [{ id: "C1", text: "Do not push, merge, or promote without approval" }],
};

const ingested = ingestMissionBrief(brief, { slot: 6, actor: "operator" });
assert.ok(ingested.ok !== false && ingested.brief, "ingest ok");
assert.ok(ingested.compiled, "ingest returns compiled mission");
assert.ok(ingested.compilationReport, "compilation report present");

const compiled = getCompiledMission(ingested.brief.missionId);
assert.equal(compiled.schema_version, "vacilando.compiled_mission.v1");
assert.match(compiled.title, /Access & Identity/i);
assert.ok(compiled.referencedAcceptedArtifacts.length >= 3, "reuses accepted artifacts");
assert.ok(compiled.deliverables.some((d) => d.status === "reused"), "marks reused");
assert.ok(
  compiled.deliverables.some((d) => d.status === "to_execute"),
  "identifies remaining gaps (auth/IA/rubric absent in fixture)",
);
assert.ok(
  compiled.compilationWarnings.some((w) => w.code === "conflicting_implement_vs_specify"),
  "detects implement vs specify conflict",
);
assert.equal(compiled.readyToExecute, true, "auto-scopes to gaps — ready without late decision");
assert.ok(compiled.compilationConfidence >= 40);

const vm = kickoffVm(ingested.brief.missionId);
assert.ok(vm.compiled, "Mission Review includes compiled");
assert.ok(vm.reusedArtifacts?.length >= 1);
assert.ok(vm.rawBrief, "raw brief available as View Source");
assert.match(vm.directorAssessment, /Ready to execute|confidence/i);

const ctx = buildMissionContextPackage(ingested.brief.missionId);
assert.equal(ctx.executionContract.source, "compiled_mission");
assert.ok(ctx.compiledMissionId);

const approved = approveMissionExecution(ingested.brief.missionId, ingested.brief.version, {
  slot: 6,
  actor: "operator",
  awaitDispatch: false,
});
assert.ok(approved.ok, `approve ok: ${approved.error || ""} ${approved.detail || ""}`);
assert.ok(approved.compiled, "approve returns compiled");
const asgs = listAssignments(ingested.brief.missionId);
assert.ok(asgs.length >= 1, "assignments from compiled plan");
assert.ok(asgs[0].compiledMissionId, "assignments bound to compiled mission");

// Recompile API shape
const again = compileMissionBrief(ingested.brief.missionId, { createCompilationDecision: false });
assert.ok(again.report.accepted_artifacts_reused.length >= 1);

rmSync(root, { recursive: true, force: true });
console.log("mission-compiler-brief.test.mjs: ok");
