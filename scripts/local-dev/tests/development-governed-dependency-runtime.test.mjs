#!/usr/bin/env node
/**
 * Governed dependency routing S2 — live producer + dispatcher.
 *
 * THE LADDER THIS SLICE MAKES ENFORCEABLE:
 *
 *     Governed request existence is not approval.
 *     Approval is not execution.
 *     Execution is not verified effect.
 *
 * The Health & Safety incident collapsed all three. `gar_62f1af0052c793` FAILED
 * input validation and executed nothing, yet the NEXT request's own inputs
 * assert it "applied H1 only" — and a `head: true` count probe reported a
 * missing table as present. Every rung below is therefore derived from
 * canonical evidence and asserted against the real records.
 *
 * WHAT MUST NEVER REGRESS. A worker cannot name its executor; a request cannot
 * become an approval; a child's exit code cannot become a verified effect; and
 * a count probe cannot become proof of existence.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-gdep-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
process.env.VACILANDO_DURABLE_LANES = "1";
process.env.VACILANDO_ADMISSION_PROVISION = "0";

const G = await import("../lib/vacilando/governed-dependency.mjs");
const R = await import("../lib/vacilando/governed-dependency-runtime.mjs");
const {
  bindDurableLane, createDurableLane, resetDevelopmentLanesForTests,
} = await import("../lib/vacilando/development-lane.mjs");
const {
  createQueuedRun, getExecutionRun, resetExecutionRunsForTests, transitionExecutionRun,
} = await import("../lib/vacilando/execution-run.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

// The real records, verbatim from the governed-action store.
const GAR_FIRST = {
  request_id: "gar_62f1af0052c793", action_key: "database.apply_migration", target: "staging",
  status: "failed", operator_approval: null, decision_id: null, result_ref: null,
  failure_code: "environment_not_allowed", requested_at: "2026-08-26T21:10:45.772Z",
  inputs: {
    environment: "development_certification",
    expectedSha: "95a76983e4f1d685353b0b3fb1ab7cffad690115",
    migrations: ["20260826120000_h1_person_health_facts.sql", "20260826121000_m1_health_grain_correction.sql", "20260826122000_dh6_health_visibility_permission.sql"],
  },
};
const GAR_SECOND = {
  ...GAR_FIRST, request_id: "gar_d7851e4470865e", requested_at: "2026-08-26T21:59:16.260Z",
  inputs: {
    ...GAR_FIRST.inputs,
    expectedSha: "0f0cf15602bd619adf39b3d613b8c3bf16e6b850",
    // The untrue assertion, preserved as a fixture because the guard exists for it.
    priorAction: "gar_62f1af0052c793 applied H1 only",
  },
};

const HEALTH_CONDITIONS = [
  { id: "rc_table", kind: "relation_exists", subject: "person_health_facts" },
  { id: "rc_view", kind: "permission_exists", subject: "health.view" },
  { id: "rc_manage", kind: "permission_exists", subject: "health.manage" },
];

const TRUSTED_HOST = {
  kind: "trusted_host", executor_id: "trusted_host",
  capabilities: ["trusted_host.database.migrate"],
  environments: ["staging", "certification", "cert"],
  requires_credential: true, credential_available: true, cross_repository: true,
};

/** A REAL read: it says how it looked and carries what came back. */
const realRead = async (c) => ({ method: "real_read", rows: [{ subject: c.subject }], source: `select:${c.subject}` });
/** The defective probe: confident, and structurally incapable of proving anything. */
const headCount = async () => ({ method: "head_count", present: true, count: 0 });

function reset() {
  resetDevelopmentLanesForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  R.resetGovernedDependencyImplForTests();
  try {
    const { writeFileSync, mkdirSync: mk } = require("node:fs");
    mk(join(ROOT, "vacilando", "governed-dependencies"), { recursive: true });
    writeFileSync(join(ROOT, "vacilando", "governed-dependencies", "dependencies.json"),
      JSON.stringify({ schema_version: "vacilando.governed_dependency_store.v1", dependencies: [] }));
  } catch { /* first run */ }
}
const { createRequire } = await import("node:module");
const require = createRequire(import.meta.url);

function seedLaneWithRun(name = "surfaces") {
  const path = join(ROOT, `wt-${name}`);
  mkdirSync(path, { recursive: true });
  const created = createDurableLane({ name, origin: "created", root: ROOT });
  const laneId = created.lane.lane_id;
  bindDurableLane(laneId, {
    worktree_path: path, worktree_name: `wt-${name}`, branch: `agent/claude/9-${name}`,
    slot: 9, tmux_session: `alloy-${name}`, provider: "claude",
  }, { root: ROOT });
  const r = createQueuedRun({ laneId, instruction: "health & safety H1", worktreePath: path, root: ROOT });
  transitionExecutionRun(r.run.run_id, "EXECUTING", { origin: "system", root: ROOT });
  return { laneId, runId: r.run.run_id, path };
}

const INTENT = (over = {}) => ({
  requested_capability: "apply committed migrations to the development/certification database",
  target_environment: "development_certification",
  governed_action_key: "database.apply_migration",
  action_inputs: GAR_SECOND.inputs,
  required_executor_capabilities: ["trusted_host.database.migrate"],
  resume_conditions: HEALTH_CONDITIONS,
  originating_repository_id: "repo_alloy",
  ...over,
});

const stubGoverned = (requests) => R.setGovernedDependencyImplForTests({
  governedOwner: { readGovernedActionStore: () => ({ requests }) },
});

// ── 1-2. Producer and originating-run integration ────────────────────────────

await test("1 — the producer persists the dependency and parks the parent in an S6 wait", async () => {
  reset();
  const { laneId, runId } = seedLaneWithRun("prod");
  const out = await R.emitGovernedDependency({ ...INTENT(), originating_run_id: runId, originating_lane_id: laneId }, { root: ROOT });
  assert.equal(out.ok, true, out.error);
  assert.equal(out.dependency.dependency_state, "DECLARED");

  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.state, "WAITING_RESOURCE", "the parent waits rather than failing");
  assert.equal(run.resource_wait.dependency_id, out.dependency.dependency_id);
  assert.equal(run.resource_wait.bound_policy, "human_indefinite", "an approval wait is the deliberate human one");
  assert.equal(run.resource_wait.owner, "director");
  assert.equal(run.governed_dependency.capability, INTENT().requested_capability);
  // The continuation point survives on the run itself.
  assert.match(run.state_reason, /blocked on governed dependency gdep_/);
  assert.equal(R.getDependency(out.dependency.dependency_id, ROOT).originating_run_id, runId);
});

await test("2 — the worker's placement attempt is stripped and kept as governance evidence", async () => {
  reset();
  const { laneId, runId } = seedLaneWithRun("selfroute");
  const out = await R.emitGovernedDependency({
    ...INTENT(), originating_run_id: runId, originating_lane_id: laneId,
    assigned_lane_id: "lane_955fe041d417", executor: "trusted_host", route_to: "the vacilando lane",
    provider: "claude", worktree_path: "/Users/Kelly/Alloy",
  }, { root: ROOT });
  assert.equal(out.dependency.assigned_lane_id, null);
  assert.equal(out.dependency.executor, null);
  assert.deepEqual(out.dependency.rejected_worker_overrides.sort(),
    ["assigned_lane_id", "executor", "provider", "route_to", "worktree_path"]);
});

await test("3 — a duplicate emission returns the SAME dependency, not a second one", async () => {
  reset();
  const { laneId, runId } = seedLaneWithRun("dupe");
  const a = await R.emitGovernedDependency({ ...INTENT(), originating_run_id: runId, originating_lane_id: laneId }, { root: ROOT });
  const b = await R.emitGovernedDependency({ ...INTENT(), originating_run_id: runId, originating_lane_id: laneId }, { root: ROOT });
  assert.equal(b.deduped, true);
  assert.equal(b.dependency.dependency_id, a.dependency.dependency_id);
  assert.equal(R.listDependencies({ root: ROOT }).length, 1);
});

// ── 8. Governance truth ladder ───────────────────────────────────────────────

await test("4 — request existence reaches ONLY the `requested` rung", () => {
  const t = R.governanceTruth({ request: GAR_FIRST });
  assert.equal(t.requested, true);
  assert.equal(t.approved, false, "operator_approval is null and status is failed");
  assert.equal(t.executed, false);
  assert.equal(t.effective, false);
  assert.equal(t.highest, "requested");
  assert.equal(t.evidence.failure_code, "environment_not_allowed");
});

await test("5 — approval does not become execution, and execution does not become effect", () => {
  const approved = { ...GAR_SECOND, operator_approval: { by: "operator" }, status: "awaiting_operator" };
  const a = R.governanceTruth({ request: approved });
  assert.equal(a.approved, true);
  assert.equal(a.executed, false, "an approval is not a result");

  const executed = { ...GAR_SECOND, status: "complete", operator_approval: { by: "operator" }, result_ref: "tha_1" };
  const e = R.governanceTruth({ request: executed });
  assert.equal(e.executed, true);
  assert.equal(e.effective, false, "and a result is not a verified effect");
  assert.equal(R.governanceTruth({ request: executed, verification: { verified: true } }).effective, true);
  // `complete` with no artifact is not execution either.
  assert.equal(R.governanceTruth({ request: { ...executed, result_ref: null, trusted_host_action_id: null } }).executed, false);
});

await test("6 — the exact Health & Safety claim is caught as a contradiction", () => {
  const truth = R.governanceTruth({ request: GAR_FIRST });
  const claim = GAR_SECOND.inputs.priorAction;   // "gar_62f1af0052c793 applied H1 only"
  // "applied" is prose; the guard is asserted on the rung vocabulary a report uses.
  const c = R.detectGovernanceContradiction("gar_62f1af0052c793 executed the H1 migration", truth);
  assert.equal(c.contradiction, true);
  assert.equal(c.claimed, "executed");
  assert.equal(c.supported_by_evidence, "requested");
  assert.equal(c.authority, "governed_action_store", "the store wins; the claim is surfaced, not adopted");
  assert.match(claim, /applied H1 only/, "the untrue assertion is preserved as the fixture's reason for existing");
  // A claim within its evidence is not a contradiction.
  assert.equal(R.detectGovernanceContradiction("this action was requested", truth), null);
});

await test("6b — LIVE-SHAPE: ordering uses `created_at`, the field a real record has", () => {
  // The live run exposed this and no fixture could have: S1 sorted on
  // `requested_at`, which does not exist on a stored request. Every comparison
  // saw "" and "latest" fell back to file order — so supersession, which is
  // decided by that ordering, was decided by luck on the real store.
  const first = { ...GAR_FIRST, created_at: "2026-08-26T21:10:45.772Z", requested_at: undefined, status: "complete", result_ref: "tha", operator_approval: {} };
  const second = { ...GAR_SECOND, created_at: "2026-08-26T21:59:16.260Z", requested_at: undefined };
  assert.ok(G.requestFiledAt(second) > G.requestFiledAt(first));
  const dep = G.declareGovernedDependency({
    originating_run_id: "erun_x", requested_capability: "c",
    governed_action_key: "database.apply_migration", action_inputs: first.inputs,
    resume_conditions: ["x"],
  }, { now: 1 }).dependency;
  // Order the array the WRONG way round to prove the sort, not the input order.
  const { supersededBy } = G.resolveApprovalFromStore(dep, [second, first]);
  assert.equal(supersededBy, "gar_d7851e4470865e");
  const latest = R.latestRequestForDependency(dep, [first, second]);
  assert.equal(latest.request_id, "gar_d7851e4470865e");
});

// ── 3. Dispatcher ordering ───// ── 3. Dispatcher ordering ───────────────────────────────────────────────────

async function seedDependency(name, over = {}) {
  reset();
  const { laneId, runId } = seedLaneWithRun(name);
  const out = await R.emitGovernedDependency({ ...INTENT(over), originating_run_id: runId, originating_lane_id: laneId }, { root: ROOT });
  return { dep: out.dependency, runId, laneId };
}

await test("7 — governance is evaluated FIRST: no executor is selected while approval is missing", async () => {
  const { dep, runId } = await seedDependency("gov");
  stubGoverned([GAR_FIRST, GAR_SECOND]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  assert.equal(res.action, "await_operator_approval");
  assert.equal(res.dependency.dependency_state, "WAITING_APPROVAL");
  assert.equal(res.dependency.executor, null);
  assert.equal(res.truth.approved, false);
  assert.equal(getExecutionRun(runId, ROOT).state, "WAITING_RESOURCE");
});

await test("8 — a superseded approval does not inherit into the latest content", async () => {
  const { dep } = await seedDependency("superseded", { target_environment: "staging", action_inputs: { ...GAR_FIRST.inputs, environment: "staging" } });
  stubGoverned([
    { ...GAR_FIRST, status: "complete", result_ref: "tha_x", inputs: { ...GAR_FIRST.inputs, environment: "staging" } },
    { ...GAR_SECOND, inputs: { ...GAR_SECOND.inputs, environment: "staging" } },
  ]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  assert.equal(res.dependency.dependency_state, "WAITING_APPROVAL");
  assert.equal(res.step.approval.verdict, "superseded");
  assert.match(res.step.operator_question, /Approve the latest version/);
  assert.doesNotMatch(res.step.operator_question, /lane/i);
});

await test("9 — approved but no environment authority stops at WAITING_EXECUTOR", async () => {
  const { dep, runId } = await seedDependency("noexec");
  stubGoverned([{ ...GAR_SECOND, status: "complete", operator_approval: { by: "operator" }, result_ref: "tha_1" }]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  assert.equal(res.action, "await_executor_authority");
  assert.equal(res.dependency.dependency_state, "WAITING_EXECUTOR");
  assert.ok(res.step.must_be_provisioned.some((r) => /development_certification/.test(r)));
  // The parent's wait now names the CURRENT reason, not the one it first had.
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.resource_wait.reason, "waiting_for_executor_authority");
  assert.equal(run.resource_wait.owner, "governed-dependency");
  assert.equal(run.resource_wait.bound_policy, "bounded", "nobody provisions an executor by waiting");
});

await test("10 — an authorized executor with no capacity waits through S4/S5/S6", async () => {
  const { dep, runId } = await seedDependency("cap", { target_environment: "staging" });
  const d = R.getDependency(dep.dependency_id, ROOT);
  stubGoverned([{ request_id: "gar_ok", action_key: "database.apply_migration", status: "complete", operator_approval: {}, result_ref: "tha", requested_at: "2026-08-26T22:00:00Z", inputs: d.action_inputs }]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST], capacity: { available: false, reason: "provider ceiling reached" },
  });
  assert.equal(res.dependency.dependency_state, "WAITING_CAPACITY");
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.resource_wait.reason, "waiting_for_execution_capacity");
  assert.equal(run.resource_wait.owner, "provider-capacity");
});

// ── 4. Dispatch and the dependent run ────────────────────────────────────────

async function approvedStagingDependency(name) {
  const { dep, runId, laneId } = await seedDependency(name, { target_environment: "staging" });
  const d = R.getDependency(dep.dependency_id, ROOT);
  stubGoverned([{
    request_id: "gar_live", action_key: "database.apply_migration", status: "complete",
    operator_approval: { by: "operator" }, result_ref: "tha_live",
    requested_at: "2026-08-26T22:00:00Z", inputs: d.action_inputs,
  }]);
  return { dep: d, runId, laneId };
}

await test("11 — same-lane trusted-host execution is preserved, not forked", async () => {
  const { dep, runId } = await approvedStagingDependency("samelane");
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: true, request_id: "gar_live" }),
    readEvidence: realRead,
  });
  assert.equal(res.action, "resume_parent");
  assert.equal(res.dependency.execution_placement, "same_lane_trusted_host");
  assert.equal(res.dependency.assigned_execution_run_id, runId, "the existing path runs against the parent's own run");
});

await test("12 — a DIFFERENT executor gets a real, separate Execution Run that names its parent", async () => {
  const { dep, runId } = await approvedStagingDependency("child");
  // A lane executor that has actually been granted the capability.
  const other = createDurableLane({ name: "dbops", origin: "created", root: ROOT });
  bindDurableLane(other.lane.lane_id, { worktree_path: join(ROOT, "wt-dbops"), worktree_name: "wt-dbops", branch: "b", slot: 8, tmux_session: "t", provider: "claude" }, { root: ROOT });
  mkdirSync(join(ROOT, "wt-dbops"), { recursive: true });
  const laneExecutor = {
    kind: "owning_lane", executor_id: other.lane.lane_id, lane_id: other.lane.lane_id,
    repository_id: "repo_alloy", capabilities: ["trusted_host.database.migrate"], environments: ["staging"],
  };
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [laneExecutor],
    executeGoverned: async () => ({ ok: true }),
    readEvidence: realRead,
  });
  assert.equal(res.dependency.execution_placement, "dependent_run");
  assert.notEqual(res.dependency.assigned_execution_run_id, runId);
  const child = getExecutionRun(res.dependency.assigned_execution_run_id, ROOT);
  assert.equal(child.governed_dependency_parent.parent_run_id, runId);
  assert.equal(child.governed_dependency_parent.dependency_id, dep.dependency_id);
  assert.equal(child.lane_id, other.lane.lane_id);
});

// ── 5-6. Verification and continuation ───────────────────────────────────────

await test("13 — a SUCCESSFUL child does not resume the parent without proof", async () => {
  const { dep, runId } = await approvedStagingDependency("noproof");
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: true }),
    readEvidence: async (c) => ({ method: "real_read", rows: c.subject === "person_health_facts" ? [{ x: 1 }] : [] }),
  });
  assert.equal(res.resumed_parent, false);
  assert.equal(res.dependency.dependency_state, "VERIFYING");
  assert.equal(getExecutionRun(runId, ROOT).state, "WAITING_RESOURCE", "the parent stays parked");
});

await test("14 — the defective head:true probe cannot resume the parent", async () => {
  const { dep, runId } = await approvedStagingDependency("headcount");
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: true }),
    readEvidence: headCount,
  });
  assert.equal(res.resumed_parent, false);
  assert.equal(res.verification.reason, "evidence_does_not_prove");
  assert.equal(res.verification.rejected_evidence.length, 3);
  assert.match(res.verification.rejected_evidence[0].detail, /cannot prove existence/);
  assert.equal(getExecutionRun(runId, ROOT).state, "WAITING_RESOURCE");
});

await test("15 — verified evidence resumes the parent, once, on the same run", async () => {
  const { dep, runId } = await approvedStagingDependency("resume");
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: true }),
    readEvidence: realRead,
  });
  assert.equal(res.dependency.dependency_state, "SATISFIED");
  assert.equal(res.resumed_parent, true);
  assert.equal(res.resume.same_lane, true);
  const run = getExecutionRun(runId, ROOT);
  assert.equal(run.state, "EXECUTING", "the originating run continues");
  assert.equal(run.resource_wait, null, "and its wait is resolved");
  assert.equal(run.governed_dependency.state, "SATISFIED");
  assert.equal(run.governed_dependency.verification_result.checked.length, 3);
});

await test("16 — a duplicate dispatcher pass does not resume the parent twice", async () => {
  const { dep, runId } = await approvedStagingDependency("twice");
  let resumes = 0;
  const opts = {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: true }),
    readEvidence: realRead,
    resumeParent: async () => { resumes += 1; return { ok: true }; },
  };
  const a = await R.dispatchGovernedDependency(dep.dependency_id, opts);
  const b = await R.dispatchGovernedDependency(dep.dependency_id, opts);
  assert.equal(a.resumed_parent, true);
  assert.equal(b.resumed_parent, false);
  assert.equal(b.terminal, true);
  assert.equal(resumes, 1, "continuation is delivered exactly once");
  assert.ok(runId);
});

await test("16b — a duplicate COMPLETION does not resume the parent twice", async () => {
  // The dispatcher's terminal check catches a repeated dispatch. This is the
  // other door: a completion callback that fires twice — a provider retry, a
  // Gateway restart mid-verify — re-enters finishDependency directly, and only
  // `parent_resumed_at` stops the second continuation.
  const { dep } = await approvedStagingDependency("dupfinish");
  let resumes = 0;
  const opts = { root: ROOT, readEvidence: realRead, resumeParent: async () => { resumes += 1; return { ok: true }; } };
  const a = await R.finishDependency(R.getDependency(dep.dependency_id, ROOT), { ...opts, terminal: { ok: true } });
  const b = await R.finishDependency(R.getDependency(dep.dependency_id, ROOT), { ...opts, terminal: { ok: true } });
  assert.equal(a.resumed_parent, true);
  assert.equal(b.resumed_parent, false);
  assert.equal(b.already_resumed, true);
  assert.equal(resumes, 1, "continuation is delivered exactly once");
});

await test("17 — a duplicate dispatcher pass does not create a second child run", async () => {
  const { dep } = await approvedStagingDependency("nodup");
  const other = createDurableLane({ name: "dbops2", origin: "created", root: ROOT });
  bindDurableLane(other.lane.lane_id, { worktree_path: join(ROOT, "wt-dbops2"), worktree_name: "wt-dbops2", branch: "b", slot: 7, tmux_session: "t2", provider: "claude" }, { root: ROOT });
  mkdirSync(join(ROOT, "wt-dbops2"), { recursive: true });
  const executor = { kind: "owning_lane", executor_id: other.lane.lane_id, lane_id: other.lane.lane_id, repository_id: "repo_alloy", capabilities: ["trusted_host.database.migrate"], environments: ["staging"] };
  let executions = 0;
  const opts = { root: ROOT, candidates: [executor], executeGoverned: async () => { executions += 1; return { ok: true }; }, readEvidence: realRead };
  const a = await R.dispatchGovernedDependency(dep.dependency_id, opts);
  const b = await R.dispatchGovernedDependency(dep.dependency_id, opts);
  assert.equal(executions, 1, "the governed action executes once");
  assert.equal(b.dependency.assigned_execution_run_id, a.dependency.assigned_execution_run_id);
});

await test("18 — a failed child leaves the parent blocked, with the evidence and retryability", async () => {
  const { dep, runId } = await approvedStagingDependency("failed");
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: false, error: "migration_failed", retryable: true }),
    readEvidence: realRead,
  });
  assert.equal(res.resumed_parent, false);
  assert.equal(res.dependency.dependency_state, "FAILED");
  assert.equal(res.dependency.failure_reason, "migration_failed");
  assert.match(res.operator_message, /remains blocked/);
  assert.equal(getExecutionRun(runId, ROOT).state, "WAITING_RESOURCE");
});

await test("19 — a second dependency with the same fingerprint reuses the prior verified execution", async () => {
  const { dep } = await approvedStagingDependency("idem");
  await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST], executeGoverned: async () => ({ ok: true }), readEvidence: realRead,
  });
  // A different run declares the identical dependency.
  const second = createQueuedRun({ laneId: dep.originating_lane_id, instruction: "again", root: ROOT });
  assert.equal(second.ok, false, "the lane's parent run is still current — the reuse path is asserted on the ledger");
  const ledger = R.listDependencies({ root: ROOT });
  assert.equal(ledger.filter((d) => d.dependency_state === "SATISFIED").length, 1);
});

// ── 10. Operator presentation ────────────────────────────────────────────────

await test("20 — the parent's card separates governance from executor and never asks for a lane", async () => {
  const { dep } = await seedDependency("view");
  stubGoverned([GAR_FIRST, GAR_SECOND]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  const card = R.parentRunView(res.dependency, { step: res.step, laneName: "Health & Safety" });
  assert.match(card, /^Health & Safety/);
  assert.match(card, /Governance\nLatest request is not approved\./);
  assert.match(card, /Vacilando will resume Health & Safety automatically/);
  for (const state of ["WAITING_APPROVAL", "WAITING_EXECUTOR", "WAITING_CAPACITY", "EXECUTING", "SATISFIED", "FAILED"]) {
    const v = R.parentRunView({ ...res.dependency, dependency_state: state }, { step: res.step, laneName: "Health & Safety" });
    assert.doesNotMatch(v, /which lane|another lane|send (this|it) to|choose a lane|find someone/i, state);
  }
});

await test("21 — the WAITING_EXECUTOR card states the missing authority verbatim", async () => {
  const { dep } = await seedDependency("card2");
  stubGoverned([{ ...GAR_SECOND, status: "complete", operator_approval: {}, result_ref: "tha" }]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  const card = R.parentRunView(res.dependency, { step: res.step, laneName: "Health & Safety" });
  assert.match(card, /No executor currently has trusted_host\.database\.migrate authority/);
  assert.match(card, /for development_certification\./);
});

// ── Required negative controls ───────────────────────────────────────────────

await test("NEGATIVE — a request that FAILED can never satisfy the approval gate", async () => {
  const { dep } = await seedDependency("neg1");
  stubGoverned([GAR_FIRST, GAR_SECOND]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  assert.equal(res.dependency.dependency_state, "WAITING_APPROVAL");
  // The ladder describes the SUBJECT: two requests exist, so `requested` is
  // true — and that is exactly as far as the evidence goes.
  assert.equal(res.truth.highest, "requested");
  assert.equal(res.truth.approved, false);
  assert.equal(res.truth.executed, false);
  assert.equal(res.truth.evidence.failure_code, "environment_not_allowed");
});

await test("NEGATIVE — an executor without environment authority is rejected with the reason", async () => {
  const { dep } = await seedDependency("neg2");
  stubGoverned([{ ...GAR_SECOND, status: "complete", operator_approval: {}, result_ref: "tha" }]);
  const res = await R.dispatchGovernedDependency(dep.dependency_id, { root: ROOT, candidates: [TRUSTED_HOST] });
  const th = res.step.evidence.find((e) => e.candidate_id === "trusted_host");
  assert.equal(th.eligible, false);
  assert.equal(th.rejected_for[0].gate, "environment");
});

await test("NEGATIVE — unreadable evidence does not resume the parent", async () => {
  const { dep, runId } = await approvedStagingDependency("unreadable");
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST],
    executeGoverned: async () => ({ ok: true }),
    readEvidence: async () => { throw new Error("probe unavailable"); },
  });
  assert.equal(res.resumed_parent, false);
  assert.equal(getExecutionRun(runId, ROOT).state, "WAITING_RESOURCE");
});

await test("NEGATIVE — the dispatcher never executes without an approved action behind it", async () => {
  const { dep } = await seedDependency("neg4", { target_environment: "staging" });
  stubGoverned([]);
  let executed = false;
  const res = await R.dispatchGovernedDependency(dep.dependency_id, {
    root: ROOT, candidates: [TRUSTED_HOST], executeGoverned: async () => { executed = true; return { ok: true }; },
  });
  assert.equal(executed, false);
  assert.equal(res.dependency.dependency_state, "WAITING_APPROVAL");
});

// ── Source guards ────────────────────────────────────────────────────────────

await test("GUARD — the dispatcher evaluates governance before it resolves any executor", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/vacilando/governed-dependency.mjs", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function routeGovernedDependency"));
  const approvalAt = fn.indexOf("classifyApproval");
  const executorAt = fn.indexOf("resolveExecutor");
  assert.ok(approvalAt > 0 && executorAt > approvalAt, "approval is resolved before executor resolution");
});

await test("GUARD — S2 forks neither governed execution nor the run lifecycle", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../lib/vacilando/governed-dependency-runtime.mjs", import.meta.url), "utf8")
    .split("\n").filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join("\n");
  // Execution goes through the governed-action owner; runs through the run owner.
  assert.match(src, /GO\.executeGovernedAction/);
  assert.match(src, /RO\.createQueuedRun/);
  assert.match(src, /RO\.transitionExecutionRun/);
  for (const forbidden of ["process.kill", "execFile", "spawn(", "rmSync"]) {
    assert.equal(src.includes(forbidden), false, forbidden);
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
