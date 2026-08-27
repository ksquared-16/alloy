/**
 * Director Authority V1 — negative controls first.
 *
 * A delegation is only as good as what it REFUSES, so the controls below are
 * the substance of this suite: the happy path is one test and the ways the
 * Director must fail closed are ten.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const D = await import("../lib/vacilando/director-authority.mjs");

const OPEN_PR = {
  request_id: "gar_openpr", action_key: "promotion.open_pr", target: "staging",
  content_fingerprint: "f".repeat(32),
  inputs: { repository: "ksquared-16/alloy", headBranch: "agent/claude/5-work-unit-grade-a", base: "staging", expectedHeadSha: "a".repeat(40) },
};
const OPEN_PR_EV = {
  repository: "ksquared-16/alloy", managed_repository: true,
  branch: "agent/claude/5-work-unit-grade-a", source_sha: "a".repeat(40),
  environment: "staging", base_branch: "staging", remote_head_sha: "a".repeat(40),
  governance_exception_active: false, operator_hold: false,
};
const PUSH = {
  request_id: "gar_push", action_key: "repository.push", target: "staging",
  content_fingerprint: "e".repeat(32),
  inputs: { repository: "ksquared-16/alloy", branch: "agent/cursor/5-vacilando-gateway-v2", expectedHeadSha: "b".repeat(40) },
};
const PUSH_EV = {
  repository: "ksquared-16/alloy", managed_repository: true,
  branch: "agent/cursor/5-vacilando-gateway-v2", source_sha: "b".repeat(40), environment: "staging",
  credential_material_detected: false,
  governance_exception_active: false, operator_hold: false,
};
const ev = (o) => D.evaluateDirectorAuthority(o);

await test("1 — the screenshot case resolves without the operator", () => {
  const d = ev({ request: OPEN_PR, evidence: OPEN_PR_EV });
  assert.equal(d.decision, "director_approved");
  assert.equal(d.decision_actor, "director");
  assert.equal(d.matched_policy, "routine_certified_promotion_v1");
  assert.equal(d.escalation_reason, null);
  // Routine push likewise.
  const p = ev({ request: PUSH, evidence: PUSH_EV });
  assert.equal(p.decision, "director_approved");
  assert.equal(p.matched_policy, "routine_managed_branch_push_v1");
});

// ── Negative controls ──────────────────────────────────────────────────────

await test("NC1 — a worker cannot self-approve: 'worker' is not a decision actor", () => {
  assert.ok(!D.DECISION_ACTORS.includes("worker"));
  // Nothing the request itself claims can change the actor.
  const d = ev({ request: { ...OPEN_PR, operator_approval: { decision: "approved", actor: "worker" } }, evidence: OPEN_PR_EV });
  assert.ok(["director", "policy"].includes(d.decision_actor), d.decision_actor);
});

await test("NC2 — no matching policy escalates; there is no default allow", () => {
  const d = ev({ request: { ...OPEN_PR, action_key: "some.brand_new_capability" }, evidence: OPEN_PR_EV });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /Unknown actions escalate/);
  // And with the policy set emptied entirely, the answer is the same.
  assert.equal(ev({ request: OPEN_PR, evidence: OPEN_PR_EV, policies: [] }).decision, "operator_approval_required");
});

await test("NC3 — the Director cannot expand its own delegation", () => {
  for (const key of D.SELF_EXPANSION_ACTION_KEYS) {
    const d = ev({ request: { ...OPEN_PR, action_key: key }, evidence: OPEN_PR_EV });
    assert.equal(d.decision, "operator_approval_required", key);
    assert.match(d.escalation_reason, /expansion of its own authority|reserved to the operator/);
  }
  // Content that edits the policy files escalates even under a routine key.
  const d = ev({ request: { ...PUSH, inputs: { ...PUSH.inputs, changed_files: ["scripts/local-dev/lib/vacilando/director-authority.mjs"] } }, evidence: PUSH_EV });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /expansion of its own authority/);
});

await test("NC4 — production does not inherit staging authority", () => {
  for (const env of ["production", "alloy_deployed_primary", "prod"]) {
    const d = ev({ request: { ...PUSH, target: env, inputs: { ...PUSH.inputs, environment: env } }, evidence: { ...PUSH_EV, environment: env } });
    assert.equal(d.decision, "operator_approval_required", env);
    assert.match(d.escalation_reason, /always an operator decision/);
  }
  // Even a policy that names production cannot make it eligible.
  const rogue = [{ policy_id: "rogue", action_key: "repository.push", environments: ["production"], enabled: true, gates: [] }];
  const d = ev({ request: { ...PUSH, target: "production" }, evidence: { ...PUSH_EV, environment: "production" }, policies: rogue });
  assert.equal(d.decision, "operator_approval_required");
});

await test("NC5 — stale content invalidates a Director approval", () => {
  const d = ev({ request: OPEN_PR, evidence: OPEN_PR_EV });
  assert.equal(d.decision, "director_approved");
  assert.equal(D.directorDecisionValidFor(d, "f".repeat(32)), true);
  assert.equal(D.directorDecisionValidFor(d, "9".repeat(32)), false, "moved content must not reuse the decision");
  assert.equal(D.directorDecisionValidFor(d, null), false);
  assert.equal(D.directorDecisionValidFor({ ...d, decision: "operator_approval_required" }, "f".repeat(32)), false);
});

await test("NC6 — a failed deterministic gate cannot be reasoned around", () => {
  // Checks pending is exactly what burned the operator three times in history.
  const merge = { request_id: "gar_m", action_key: "repository.merge_pull_request", target: "staging", content_fingerprint: "c".repeat(32), inputs: { base: "staging", expectedHeadSha: "a".repeat(40) } };
  const policies = D.DELEGATED_POLICIES_V1.map((p) => (p.action_key === "repository.merge_pull_request" ? { ...p, enabled: true } : p));
  const evidence = {
    repository: "r", managed_repository: true, source_sha: "a".repeat(40), environment: "staging", base_branch: "staging",
    required_checks_total: 2, required_checks_passing: 1, required_checks_failing: 0, required_checks_pending: 1,
    pull_request_mergeable: true, pull_request_head_sha: "a".repeat(40), unresolved_governance_findings: 0,
    certification_suite_passed: true, governance_exception_active: false, operator_hold: false,
  };
  const d = ev({ request: merge, evidence, policies });
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("required_checks_successful"));
  assert.equal(d.deterministic_evidence.required_checks_successful, false);
});

await test("NC7 — an UNMEASURED gate is not a passed gate", () => {
  const { credential_material_detected, ...missing } = PUSH_EV;
  const d = ev({ request: PUSH, evidence: missing });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /not measured/);
  assert.ok(d.unmeasured_gates.includes("no_credential_material"));
  // Empty evidence must never approve.
  assert.equal(ev({ request: PUSH, evidence: {} }).decision, "operator_approval_required");
});

await test("NC8 — an operator denial cannot be overridden", () => {
  const d = ev({ request: { ...OPEN_PR, operator_approval: { decision: "denied", actor: "operator" } }, evidence: OPEN_PR_EV });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /cannot overturn an operator decision/);
  // An operator hold does the same.
  assert.equal(ev({ request: OPEN_PR, evidence: { ...OPEN_PR_EV, operator_hold: true } }).decision, "operator_approval_required");
});

await test("NC9 — a non-managed branch or a protected-branch write is refused", () => {
  const d = ev({ request: PUSH, evidence: { ...PUSH_EV, branch: "staging" } });
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("not_protected_branch_write"));
  const u = ev({ request: PUSH, evidence: { ...PUSH_EV, branch: "some-random-branch" } });
  assert.equal(u.decision, "policy_denied");
  assert.ok(u.failed_gates.includes("managed_agent_branch"));
  // An abbreviated SHA fails its gate too.
  const s = ev({ request: PUSH, evidence: { ...PUSH_EV, source_sha: "b40f469" } });
  assert.equal(s.decision, "policy_denied");
  assert.ok(s.failed_gates.includes("full_exact_sha"));
});

await test("NC10 — every Director decision is fully auditable and attributed", () => {
  const d = ev({ request: OPEN_PR, evidence: OPEN_PR_EV });
  for (const f of ["governed_action_id", "action", "content_fingerprint", "environment",
    "consequence_class", "matched_policy", "policy_version", "deterministic_evidence",
    "decision", "decision_actor", "evaluated_at"]) {
    assert.ok(d[f] !== undefined, `missing ${f}`);
  }
  assert.ok(D.DIRECTOR_DECISIONS.includes(d.decision));
  assert.ok(D.DECISION_ACTORS.includes(d.decision_actor));
  const a = D.directorAuditEntry(d, { label: "Open PR for Work Unit Grade A" });
  assert.equal(a.headline, "Director authorized");
  assert.equal(a.actor, "director");
  assert.ok(a.evidence.length >= 5);
  // A Director approval is NEVER recorded as the operator's.
  assert.notEqual(d.decision_actor, "operator");
});

// ── Scope and consequence ──────────────────────────────────────────────────

await test("11 — merge is NOT enabled by default; enabling it is an operator act", () => {
  const merge = D.DELEGATED_POLICIES_V1.find((p) => p.action_key === "repository.merge_pull_request");
  assert.equal(merge.enabled, false, "merge must not ship switched on");
  const d = ev({ request: { request_id: "g", action_key: "repository.merge_pull_request", target: "staging", inputs: { base: "staging" } }, evidence: { environment: "staging" } });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /not enabled/);
});

await test("12 — consequential action classes stay with the operator, BECAUSE they are reserved", () => {
  // Asserting only "it escalated" is not enough: with the reserved list deleted
  // these keys would still escalate incidentally, for want of a matching
  // policy. The reason is the thing under test, so the protection cannot be
  // removed silently.
  // Keys that are ONLY operator-owned. Ones that are ALSO self-expansion
  // (executor.grant_authority, credential.bind_trusted_secret) refuse earlier
  // and for a stronger reason; NC3 covers those.
  const onlyReserved = D.OPERATOR_OWNED_ACTION_KEYS.filter((k) => !D.SELF_EXPANSION_ACTION_KEYS.includes(k));
  assert.ok(onlyReserved.length >= 5);
  for (const key of onlyReserved) {
    const d = ev({ request: { request_id: "g", action_key: key, target: "staging", inputs: {} }, evidence: { environment: "staging" } });
    assert.equal(d.decision, "operator_approval_required", key);
    assert.match(d.escalation_reason, /reserved to the operator/, `${key} escalated for the wrong reason`);
  }
  // And the reserved list must WIN over a policy that would otherwise match —
  // this is what stops a later policy addition from quietly delegating a
  // migration.
  const rogue = [{ policy_id: "rogue_migration", action_key: "database.apply_migration", environments: ["staging"], enabled: true, gates: [] }];
  const d = ev({ request: { request_id: "g", action_key: "database.apply_migration", target: "staging", inputs: {} }, evidence: { environment: "staging" }, policies: rogue });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /reserved to the operator/);
});

await test("13 — policies and the escalation lists are frozen against in-process edits", () => {
  assert.ok(Object.isFrozen(D.DELEGATED_POLICIES_V1));
  assert.ok(D.DELEGATED_POLICIES_V1.every((p) => Object.isFrozen(p)));
  assert.ok(Object.isFrozen(D.OPERATOR_OWNED_ACTION_KEYS));
  assert.ok(Object.isFrozen(D.SELF_EXPANSION_ACTION_KEYS));
  assert.ok(Object.isFrozen(D.DIRECTOR_ELIGIBLE_ENVIRONMENTS));
  // Production is absent by construction, not by configuration.
  assert.ok(!D.DIRECTOR_ELIGIBLE_ENVIRONMENTS.some((e) => /prod/i.test(e)));
});

await test("14 — the module never contains a default-allow path", () => {
  const src = readFileSync(new URL("../lib/vacilando/director-authority.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.ok(!/default_allow/.test(code));
  // The only place "director_approved" is produced is the end of the gate run.
  assert.equal((code.match(/decision: "director_approved"/g) || []).length, 1);
});
