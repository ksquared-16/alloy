#!/usr/bin/env node
/**
 * Governed dependency routing — discovery fixture and first vertical slice.
 *
 * THE DOCTRINE UNDER TEST. Operators approve governed decisions; Vacilando
 * routes governed execution. No fixture in this file ever asks an operator
 * which lane should run something, and one of them proves a worker cannot
 * answer that question either.
 *
 * THE REFERENCE INCIDENT, AS THE STORE RECORDS IT. Both Health & Safety
 * migration requests FAILED on `environment_not_allowed` and neither was ever
 * approved. They carry the same three migration filenames against DIFFERENT
 * source SHAs — 95a76983 and 0f0cf156 — so the existing subject key collapses
 * them into one identity. The fixtures below use the real inputs, because a
 * routing test written against an imagined incident would certify a router for
 * a problem nobody has.
 *
 * WHAT MUST NEVER REGRESS. A successful child never resumes a parent on its own
 * say-so; evidence that could not be read costs exactly as much as evidence
 * that came back false; and an approval for materially different content never
 * satisfies a newer request.
 */
import assert from "node:assert/strict";

const G = await import("../lib/vacilando/governed-dependency.mjs");
const RW = await import("../lib/vacilando/run-wait.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const NOW = 1_800_000_000_000;

// The two real requests, verbatim from the governed-action store.
const GAR_FIRST = {
  request_id: "gar_62f1af0052c793",
  action_key: "database.apply_migration",
  target: "staging",
  status: "failed",
  operator_approval: null,
  requested_at: "2026-08-26T21:10:45.772Z",
  inputs: {
    environment: "development_certification",
    expectedSha: "95a76983e4f1d685353b0b3fb1ab7cffad690115",
    migrations: [
      "20260826120000_h1_person_health_facts.sql",
      "20260826121000_m1_health_grain_correction.sql",
      "20260826122000_dh6_health_visibility_permission.sql",
    ],
  },
};
const GAR_SECOND = {
  ...GAR_FIRST,
  request_id: "gar_d7851e4470865e",
  requested_at: "2026-08-26T21:59:16.260Z",
  inputs: { ...GAR_FIRST.inputs, expectedSha: "0f0cf15602bd619adf39b3d613b8c3bf16e6b850" },
};

const HEALTH_CONDITIONS = [
  { id: "rc_table", kind: "relation_exists", subject: "person_health_facts" },
  { id: "rc_view", kind: "permission_exists", subject: "health.view" },
  { id: "rc_manage", kind: "permission_exists", subject: "health.manage" },
];

function healthDependency(over = {}) {
  const out = G.declareGovernedDependency({
    originating_run_id: "erun_42b585a960e45825",
    originating_lane_id: "lane_faacca6079ad",
    originating_repository_id: "repo_alloy",
    requested_capability: "apply committed migrations to the development/certification database",
    target_environment: "development_certification",
    governed_action_key: "database.apply_migration",
    action_inputs: GAR_SECOND.inputs,
    required_executor_capabilities: ["trusted_host.database.migrate"],
    resume_conditions: HEALTH_CONDITIONS,
    capability_boundary: "environment_not_allowed",
    ...over,
  }, { now: NOW });
  assert.equal(out.ok, true, out.error);
  return out.dependency;
}

const TRUSTED_HOST = {
  kind: "trusted_host", executor_id: "trusted_host",
  capabilities: ["trusted_host.database.migrate"],
  environments: ["staging", "certification", "cert"],
  requires_credential: true, credential_available: true, cross_repository: true,
};

// ── Contract ─────────────────────────────────────────────────────────────────

await test("1 — the worker declares WHAT is required, never WHERE it runs", () => {
  const d = healthDependency();
  assert.equal(d.schema_version, "vacilando.governed_dependency.v1");
  assert.equal(d.dependency_state, "DECLARED");
  assert.equal(d.assigned_lane_id, null);
  assert.equal(d.assigned_execution_run_id, null);
  assert.equal(d.executor, null);
  assert.equal(d.originating_run_id, "erun_42b585a960e45825");
  assert.equal(d.target_environment, "development_certification");
  assert.deepEqual(d.required_executor_capabilities, ["trusted_host.database.migrate"]);
  assert.equal(d.resume_conditions.length, 3);
});

await test("2 — a dependency with no resume condition is refused at declaration", () => {
  const out = G.declareGovernedDependency({
    originating_run_id: "erun_x", requested_capability: "do a thing", resume_conditions: [],
  }, { now: NOW });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_resume_conditions");
});

await test("3 — every waiting state maps onto an existing S6 wait reason", () => {
  for (const [state, reason] of Object.entries(G.STATE_WAIT_REASON)) {
    const spec = RW.WAIT_REASONS[reason];
    assert.ok(spec, `${state} → ${reason} must exist in the S6 table`);
    assert.ok(["bounded", "human_indefinite"].includes(spec.policy), `${reason} has a real policy`);
    if (spec.policy === "bounded") assert.ok(Number.isFinite(spec.bound_ms), `${reason} is bounded`);
  }
  // The executor wait is bounded: nobody provisions an executor by waiting.
  assert.equal(RW.WAIT_REASONS.waiting_for_executor_authority.policy, "bounded");
  // The approval wait is the deliberate human one.
  assert.equal(RW.WAIT_REASONS.needs_operator_input.policy, "human_indefinite");
});

// ── Governance identity ──────────────────────────────────────────────────────

await test("4 — the two real requests differ by content hash, though their subjects match", () => {
  const a = G.governedContentHash(GAR_FIRST);
  const b = G.governedContentHash(GAR_SECOND);
  assert.notEqual(a, b, "different source SHAs are different actions");
  // And the migration list alone — what the existing subject key uses — is identical.
  assert.deepEqual(GAR_FIRST.inputs.migrations, GAR_SECOND.inputs.migrations);
});

await test("5 — an approval of the first request does NOT satisfy the second", () => {
  const approved = { ...GAR_FIRST, operator_approval: { by: "operator" } };
  const v = G.classifyApproval({
    required: { action_key: "database.apply_migration", content_hash: G.governedContentHash(GAR_SECOND), inputs: GAR_SECOND.inputs },
    approved,
  });
  assert.equal(v.satisfies, false);
  assert.equal(v.verdict, "equivalent_subject");
  // The smallest operator decision — about content, never about placement.
  assert.match(v.operator_question, /Approve the latest version\?/);
  assert.doesNotMatch(v.operator_question, /lane/i);
});

await test("6 — an exact content match satisfies, and a denial never does", () => {
  const approved = { ...GAR_SECOND, operator_approval: { by: "operator" } };
  const required = { action_key: "database.apply_migration", content_hash: G.governedContentHash(GAR_SECOND) };
  assert.equal(G.classifyApproval({ required, approved }).verdict, "exact");
  assert.equal(G.classifyApproval({ required, approved: { ...approved, denied: true } }).satisfies, false);
  assert.equal(G.classifyApproval({ required, approved: null }).verdict, "absent");
});

await test("7 — the real store contains NO approval for either request", () => {
  // This is the discovery finding, frozen as a fixture: the instruction's
  // premise that gar_62f1af0052c793 was approved is not what the store says.
  const { approval, supersededBy } = G.resolveApprovalFromStore(healthDependency(), [GAR_FIRST, GAR_SECOND]);
  assert.equal(approval, null, "neither request carries an operator approval or a complete status");
  assert.equal(supersededBy, null);
});

await test("8 — a completed request for the same content IS an approval, and a later differing request supersedes it", () => {
  const completed = { ...GAR_FIRST, status: "complete" };
  const dep = healthDependency({ action_inputs: GAR_FIRST.inputs });
  const exact = G.resolveApprovalFromStore(dep, [completed]);
  assert.equal(exact.approval.request_id, "gar_62f1af0052c793");
  // Now the later, materially different request exists.
  const withLater = G.resolveApprovalFromStore(dep, [completed, GAR_SECOND]);
  assert.equal(withLater.supersededBy, "gar_d7851e4470865e");
});

await test("8b — an EXACT approval that a later differing request has superseded does not route", () => {
  // The quietest possible way to execute the wrong version: an approval that
  // matches by content hash while a newer, materially different request sits
  // behind it. Supersession has to be checked on the exact-match path too.
  const dep = healthDependency({ target_environment: "staging", action_inputs: { ...GAR_FIRST.inputs, environment: "staging" } });
  const completedFirst = { ...GAR_FIRST, status: "complete", inputs: { ...GAR_FIRST.inputs, environment: "staging" } };
  const laterSecond = { ...GAR_SECOND, inputs: { ...GAR_SECOND.inputs, environment: "staging" } };
  const { approval, supersededBy } = G.resolveApprovalFromStore(dep, [completedFirst, laterSecond]);
  assert.equal(approval.request_id, "gar_62f1af0052c793", "the approval matches by content");
  assert.equal(supersededBy, "gar_d7851e4470865e", "and is nonetheless superseded");
  const step = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval, supersededBy, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_APPROVAL");
  assert.equal(step.approval.verdict, "superseded");
  assert.match(step.operator_question, /Approve the latest version/);
});

await test("8c — the subject notion agrees with the canonical governed-action store", async () => {
  // One notion of "what this is about", read cheaply here and verified against
  // the owner rather than forked from it.
  const { governedActionSubjectKey } = await import("../lib/vacilando/governed-action-request.mjs");
  for (const rec of [GAR_FIRST, GAR_SECOND,
    { action_key: "repository.merge_pull_request", inputs: { pullRequestNumber: 543, expectedHeadSha: "348c3708d" } }]) {
    assert.equal(G.dependencySubjectKey(rec), governedActionSubjectKey(rec), rec.action_key);
  }
});

await test("8d — an approval for an UNRELATED subject is no approval, not a near miss", () => {
  const dep = healthDependency({ target_environment: "staging" });
  // A real completed staging migration from the store, of ten different files.
  const unrelated = {
    request_id: "gar_6a60a2e87813a9", action_key: "database.apply_migration", status: "complete",
    requested_at: "2026-08-20T00:00:00.000Z",
    inputs: { environment: "staging", expectedSha: "63aa211c", migrations: ["20260818170000_w13_collapse_portal_eligible.sql"] },
  };
  const { approval } = G.resolveApprovalFromStore(dep, [unrelated]);
  assert.equal(approval, null, "a different migration set is a different subject entirely");
  const step = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval, now: NOW });
  assert.equal(step.approval.verdict, "absent");
  assert.equal(step.operator_question, null, "and no misleading 'approve the latest version?' is raised");
});

// ── Executor resolution ──────────────────────────────────────────────────────

await test("9 — the reference incident resolves to WAITING_EXECUTOR, naming what must be provisioned", () => {
  const dep = healthDependency();
  const approved = { ...GAR_SECOND, operator_approval: { by: "operator" }, content_hash: G.governedContentHash(GAR_SECOND) };
  const step = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval: approved, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_EXECUTOR");
  assert.equal(step.action, "await_executor_authority");
  assert.deepEqual(step.required_capability, ["trusted_host.database.migrate"]);
  assert.equal(step.target_environment, "development_certification");
  assert.ok(step.must_be_provisioned.some((r) => /development_certification/.test(r)),
    "it says which environment authority is missing");
  // The evidence names the candidate that was considered and why it lost.
  const th = step.evidence.find((e) => e.candidate_id === "trusted_host");
  assert.equal(th.eligible, false);
  assert.equal(th.rejected_for[0].gate, "environment");
  assert.match(th.rejected_for[0].detail, /but not development_certification/);
  // And the wait is a real S6 wait.
  assert.equal(step.dependency.wait.reason, "waiting_for_executor_authority");
});

await test("10 — the same dependency against a staging target routes to the trusted host", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const approved = { ...dep, content_hash: dep.content_hash, action_key: "database.apply_migration", operator_approval: { by: "operator" } };
  const step = G.routeGovernedDependency(dep, {
    candidates: [TRUSTED_HOST],
    approval: { request_id: "gar_ok", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: { by: "operator" } },
    now: NOW,
  });
  assert.equal(step.dependency.dependency_state, "READY_TO_ROUTE");
  assert.equal(step.executor.kind, "trusted_host");
  assert.match(step.selected_because, /trusted host holds/);
});

await test("11 — an owning lane is preferred over the trusted host, and a dormant lane over a new context", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const owning = { kind: "owning_lane", lane_id: "lane_db", capabilities: ["trusted_host.database.migrate"], environments: ["staging"], repository_id: "repo_alloy" };
  const dormant = { kind: "dormant_lane", lane_id: "lane_dorm", capabilities: ["trusted_host.database.migrate"], environments: ["staging"], repository_id: "repo_alloy" };
  const fresh = { kind: "new_bounded_context", executor_id: "new", capabilities: ["trusted_host.database.migrate"], environments: ["staging"], repository_id: "repo_alloy" };
  const a = G.routeGovernedDependency(dep, { candidates: [fresh, TRUSTED_HOST, dormant, owning], approval, now: NOW });
  assert.equal(a.executor.kind, "owning_lane");
  const b = G.routeGovernedDependency(dep, { candidates: [fresh, dormant], approval, now: NOW });
  assert.equal(b.executor.kind, "dormant_lane");
  const c = G.routeGovernedDependency(dep, { candidates: [fresh], approval, now: NOW });
  assert.equal(c.executor.kind, "new_bounded_context");
});

await test("12 — a capacity-blocked executor waits through the S6 provider-capacity contract", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const step = G.routeGovernedDependency(dep, {
    candidates: [{ kind: "owning_lane", lane_id: "lane_db", capabilities: ["trusted_host.database.migrate"], environments: ["staging"], repository_id: "repo_alloy" }],
    approval, capacity: { available: false, reason: "provider ceiling reached" }, now: NOW,
  });
  assert.equal(step.dependency.dependency_state, "WAITING_CAPACITY");
  assert.equal(step.dependency.wait.reason, "waiting_for_execution_capacity");
  assert.equal(RW.WAIT_REASONS.waiting_for_execution_capacity.owner, "provider-capacity");
  // The executor is already chosen; capacity is a scheduling wait, not a routing one.
  assert.equal(step.dependency.assigned_lane_id, "lane_db");
});

// ── Capability boundaries ────────────────────────────────────────────────────

await test("13 — each boundary is a DIFFERENT state, not one generic refusal", () => {
  const seen = new Map();
  for (const [key, spec] of Object.entries(G.CAPABILITY_BOUNDARIES)) {
    assert.ok(G.DEPENDENCY_STATES.includes(spec.state), `${key} maps to a real state`);
    seen.set(spec.state, (seen.get(spec.state) || 0) + 1);
  }
  assert.ok(seen.size >= 3, "permission, provisioning and scheduling are distinguished");
  // The incident's own failure code is a PROVISIONING boundary, not a bad request.
  const b = G.boundaryForFailureCode("environment_not_allowed");
  assert.equal(b.key, "missing_environment_access");
  assert.equal(b.state, "WAITING_EXECUTOR");
  assert.equal(b.operator_resolvable, false);
  // And an unapproved action is an OPERATOR boundary.
  assert.equal(G.boundaryForFailureCode("policy_denied").state, "WAITING_APPROVAL");
});

// ── Verification and continuation ────────────────────────────────────────────

const presentAll = async (c) => ({ present: true, source: `read:${c.subject}` });

await test("14 — verified evidence for all three conditions resumes the originating run", async () => {
  const dep = healthDependency();
  const v = await G.verifyResumeConditions(dep, { readEvidence: presentAll, now: NOW });
  assert.equal(v.verified, true);
  assert.equal(v.checked.length, 3);
  const c = G.continuationDecision(dep, v, { terminal: { ok: true }, now: NOW });
  assert.equal(c.dependency.dependency_state, "SATISFIED");
  assert.equal(c.resume_parent, true);
  assert.equal(c.resume_via, "canonical_run_path");
});

await test("15 — a SUCCESSFUL child with an unmet condition does NOT resume the parent", async () => {
  const dep = healthDependency();
  const v = await G.verifyResumeConditions(dep, {
    readEvidence: async (c) => ({ present: c.subject === "person_health_facts" }),
    now: NOW,
  });
  assert.equal(v.verified, false);
  assert.equal(v.reason, "conditions_not_met");
  const c = G.continuationDecision(dep, v, { terminal: { ok: true }, now: NOW });
  assert.equal(c.resume_parent, false, "exit 0 is not evidence");
  assert.equal(c.dependency.dependency_state, "VERIFYING");
  assert.match(c.operator_message, /health\.view/);
});

await test("16 — evidence that could not be READ costs the same as evidence that came back false", async () => {
  const dep = healthDependency();
  const v = await G.verifyResumeConditions(dep, {
    readEvidence: async (c) => (c.subject === "health.manage" ? { present: null, error: "probe unavailable" } : { present: true }),
    now: NOW,
  });
  assert.equal(v.verified, false);
  assert.equal(v.reason, "evidence_unreadable");
  assert.deepEqual(v.unreadable, ["rc_manage"]);
  assert.equal(G.continuationDecision(dep, v, { terminal: { ok: true } }).resume_parent, false);
});

await test("16b — a head-count probe that reports a missing table as present is caught by three-valued evidence", async () => {
  // The live failure mode this contract exists to survive: a probe that answers
  // confidently without reading anything. A verifier is only as good as the
  // source it consults, so `present` must be able to say "I could not tell".
  const dep = healthDependency();
  const v = await G.verifyResumeConditions(dep, { readEvidence: async () => ({ present: undefined }), now: NOW });
  assert.equal(v.verified, false);
  assert.equal(v.checked.every((c) => c.present === null), true, "undefined is unreadable, never true");
});

await test("17 — a failed dependent execution leaves the parent blocked with the evidence", () => {
  const dep = healthDependency();
  const c = G.continuationDecision(dep, null, { terminal: { ok: false, error: "migration_failed", retryable: true }, now: NOW });
  assert.equal(c.dependency.dependency_state, "FAILED");
  assert.equal(c.resume_parent, false);
  assert.equal(c.retryable, true, "retryability is explicit, never inferred");
  assert.match(c.operator_message, /remains blocked/);
  assert.equal(c.dependency.failure_reason, "migration_failed");
});

// ── Required negative controls ───────────────────────────────────────────────

await test("NEGATIVE — a worker cannot pick a privileged lane and bypass routing", () => {
  const out = G.declareGovernedDependency({
    originating_run_id: "erun_x",
    requested_capability: "apply migrations",
    resume_conditions: ["person_health_facts exists"],
    // The worker tries to route itself.
    assigned_lane_id: "lane_955fe041d417",
    executor_kind: "trusted_host",
    route_to: "lane_with_db_credentials",
    worktree_path: "/Users/Kelly/Code/alloy",
  }, { now: NOW });
  assert.equal(out.ok, true);
  assert.equal(out.dependency.assigned_lane_id, null, "the placement is stripped, not honoured");
  assert.equal(out.dependency.executor, null);
  // And the attempt is recorded as a governance event rather than dropped.
  assert.deepEqual(out.dependency.rejected_worker_overrides.sort(),
    ["assigned_lane_id", "executor_kind", "route_to", "worktree_path"]);
});

await test("NEGATIVE — an unapproved action never routes, whatever executors exist", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const step = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval: null, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_APPROVAL");
  assert.equal(step.action, "await_operator_approval");
  assert.equal(step.dependency.executor, null, "no executor is even selected before approval");
});

await test("NEGATIVE — a stale approval for different content does not satisfy a newer request", () => {
  const dep = healthDependency({ target_environment: "staging", action_inputs: { ...GAR_SECOND.inputs, environment: "staging" } });
  const staleApproval = { request_id: "gar_62f1af0052c793", action_key: "database.apply_migration", operator_approval: {}, ...GAR_FIRST, inputs: { ...GAR_FIRST.inputs, environment: "staging" } };
  const step = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval: staleApproval, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_APPROVAL");
  assert.equal(step.approval.verdict, "equivalent_subject");
  assert.match(step.operator_question, /Approve the latest version/);
});

await test("NEGATIVE — an executor without the required capability is rejected", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const wrong = { kind: "owning_lane", lane_id: "lane_surfaces", capabilities: ["trusted_host.repository.push"], environments: ["staging"], repository_id: "repo_alloy" };
  const step = G.routeGovernedDependency(dep, { candidates: [wrong], approval, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_EXECUTOR");
  assert.equal(step.evidence[0].rejected_for[0].gate, "capability");
});

await test("NEGATIVE — an executor without the credential is rejected, and the worker is never the fallback", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const noCred = { kind: "owning_lane", lane_id: "lane_surfaces", capabilities: ["trusted_host.database.migrate"], environments: ["staging"], repository_id: "repo_alloy", requires_credential: true, credential_available: false };
  const step = G.routeGovernedDependency(dep, { candidates: [noCred], approval, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_EXECUTOR");
  assert.equal(step.evidence[0].rejected_for[0].gate, "credential");
  assert.ok(step.must_be_provisioned.some((r) => /never to the worker/.test(r)));
});

await test("NEGATIVE — duplicate delivery cannot execute the governed action twice", () => {
  const dep = healthDependency({ target_environment: "staging" });
  const ledger = [{ dependency_id: "gdep_prior", execution_fingerprint: dep.execution_fingerprint, state: "SATISFIED", verification_result: { verified: true } }];
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const step = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval, ledger, now: NOW });
  assert.equal(step.action, "reuse_prior_execution");
  assert.equal(step.dependency.dependency_state, "SATISFIED");
  assert.equal(step.dependency.terminal_result.idempotent, true);
  // A materially DIFFERENT action with the same label is not a duplicate.
  const other = healthDependency({ target_environment: "staging", action_inputs: { ...GAR_FIRST.inputs, environment: "staging" } });
  assert.notEqual(other.execution_fingerprint, dep.execution_fingerprint);
  assert.equal(G.alreadyExecuted(other.execution_fingerprint, ledger), null);
});

await test("NEGATIVE — repository/worktree routing never overrides governance identity", () => {
  // A candidate bound to the right repository, with the right capability and
  // environment, still cannot execute an action that is not approved.
  const dep = healthDependency({ target_environment: "staging" });
  const perfect = { kind: "owning_lane", lane_id: "lane_db", capabilities: ["trusted_host.database.migrate"], environments: ["staging"], repository_id: "repo_alloy" };
  const step = G.routeGovernedDependency(dep, { candidates: [perfect], approval: null, now: NOW });
  assert.equal(step.dependency.dependency_state, "WAITING_APPROVAL");
  // And a cross-repository candidate is refused on identity, not preference.
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const foreign = { ...perfect, lane_id: "lane_other", repository_id: "repo_other" };
  const step2 = G.routeGovernedDependency(dep, { candidates: [foreign], approval, now: NOW });
  assert.equal(step2.dependency.dependency_state, "WAITING_EXECUTOR");
  assert.equal(step2.evidence[0].rejected_for[0].gate, "repository");
});

await test("NEGATIVE — a capacity wait is bounded by S6, not invented here", () => {
  const spec = RW.WAIT_REASONS[G.STATE_WAIT_REASON.WAITING_CAPACITY];
  assert.equal(spec.policy, "bounded");
  assert.ok(spec.bound_ms > 0);
  // And this module defines no bound of its own for it.
  assert.equal(Object.keys(G.STATE_WAIT_REASON).every((k) => RW.WAIT_REASONS[G.STATE_WAIT_REASON[k]]), true);
});

// ── Operator experience ──────────────────────────────────────────────────────

await test("18 — the operator is never asked which lane should execute", async () => {
  const dep = healthDependency({ target_environment: "staging" });
  const approval = { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} };
  const routed = G.routeGovernedDependency(dep, { candidates: [TRUSTED_HOST], approval, now: NOW });
  const v = await G.verifyResumeConditions(routed.dependency, { readEvidence: presentAll, now: NOW });
  const done = G.continuationDecision(routed.dependency, v, { terminal: { ok: true }, now: NOW });
  const text = G.operatorView(done.dependency);
  assert.match(text, /Verified:/);
  assert.match(text, /✓ person_health_facts/);
  assert.match(text, /✓ health\.view/);
  assert.match(text, /✓ health\.manage/);
  assert.match(text, /Resuming/);
  // The whole point: no lane question anywhere in the operator surface.
  for (const state of G.DEPENDENCY_STATES) {
    const view = G.operatorView({ ...done.dependency, dependency_state: state }, { step: routed });
    assert.doesNotMatch(view, /which lane/i, `${state} must not ask for a lane`);
    assert.doesNotMatch(view, /send (this|it) to/i, `${state} must not hand off in prose`);
  }
});

await test("19 — the WAITING_EXECUTOR view states the gap instead of delegating it", () => {
  const dep = healthDependency();
  const step = G.routeGovernedDependency(dep, {
    candidates: [TRUSTED_HOST],
    approval: { request_id: "g", action_key: "database.apply_migration", content_hash: dep.content_hash, operator_approval: {} },
    now: NOW,
  });
  const view = G.operatorView(step.dependency, { step });
  assert.match(view, /No authorized executor holds trusted_host\.database\.migrate for development_certification/);
  assert.match(view, /needs:/);
  // The lane id appears as the record's own title; what must never appear is a
  // request that the operator nominate one.
  const body = view.split("\n").slice(1).join("\n");
  assert.doesNotMatch(body, /which lane|another lane|send (this|it) to|choose a lane/i);
});

// ── Live-owner wiring ────────────────────────────────────────────────────────

await test("20 — trusted-host environments are read from the registered action, not restated", async () => {
  const envs = await G.trustedHostEnvironmentsFor("database.apply_migration");
  const { ALLOWED_ENVIRONMENTS } = await import("../lib/vacilando/trusted-host-migrate.mjs");
  assert.deepEqual(envs, [...ALLOWED_ENVIRONMENTS]);
  assert.equal(envs.includes("development_certification"), false, "which is exactly why the incident has no executor");
});

await test("21 — a lane is an executor only when something GRANTED it the capability", async () => {
  assert.deepEqual(G.declaredLaneCapabilities({ lane_id: "l", repository_id: "repo_alloy", binding: { slot: 1 } }), []);
  assert.deepEqual(G.declaredLaneCapabilities({ lane_id: "l", governed_capabilities: ["trusted_host.database.migrate"] }),
    ["trusted_host.database.migrate"]);
  const candidates = await G.enumerateExecutorCandidates(healthDependency(), {
    lanes: [{ lane_id: "lane_faacca6079ad", name: "Surfaces", repository_id: "repo_alloy" }],
    actionDefinitionFor: () => ({ requiredCapability: "trusted_host.database.migrate" }),
  });
  assert.deepEqual(candidates.map((c) => c.kind), ["trusted_host"], "proximity is not authority");
});

await test("22 — summary counts what is stopped for a reason Vacilando should have resolved", () => {
  const s = G.summarizeDependencies([
    { dependency_state: "WAITING_EXECUTOR" },
    { dependency_state: "WAITING_APPROVAL" },
    { dependency_state: "READY_TO_ROUTE" },
    { dependency_state: "SATISFIED" },
  ]);
  assert.equal(s.blocked_on_provisioning, 1);
  assert.equal(s.blocked_on_operator, 1);
  assert.equal(s.unrouted_but_routable, 1);
  assert.equal(s.total, 4);
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
