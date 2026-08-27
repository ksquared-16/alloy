/**
 * Governed repository housekeeping — negative controls.
 *
 * These capabilities DELETE things. The controls matter more than the happy
 * path, so the refusals are the bulk of this suite.
 */
import test from "node:test";
import assert from "node:assert/strict";

const H = await import("../lib/vacilando/trusted-host-repository-housekeeping.mjs");
const D = await import("../lib/vacilando/director-authority.mjs");
const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const SHA = "26bb8feb95472c75f3314445850bd0f1d0bcf7a0";
const OTHER = "f".repeat(40);
const ev = (o) => D.evaluateDirectorAuthority(o);

const CLOSE_REQ = { request_id: "gar_c", action_key: "repository.close_pull_request", target: "staging", inputs: { repository: "ksquared-16/alloy" } };
const CLOSE_EV = {
  repository: "ksquared-16/alloy", managed_repository: true, environment: "staging",
  pull_request_readable: true, pull_request_exists: true, pull_request_open: true, pull_request_not_merged: true,
  head_sha_matches: true, head_branch_matches: true, head_repository_matches: true, base_branch_matches: true,
  active_governed_merge: false, governance_exception_active: false, operator_hold: false,
};
const DEL_REQ = { request_id: "gar_d", action_key: "repository.delete_remote_branch", target: "staging", inputs: { repository: "ksquared-16/alloy" } };
const DEL_EV = {
  repository: "ksquared-16/alloy", managed_repository: true, environment: "staging",
  branch: "agent/cursor/5-director-live-cert", source_sha: SHA,
  branch_exists_remotely: true, branch_never_protected_name: true, branch_not_protected: true,
  remote_head_matches: true, no_open_pull_request_depends: true,
  active_lane_reference: false, unique_work_at_risk: false,
  governance_exception_active: false, operator_hold: false,
};

await test("0 — both capabilities are registered with full identity requirements", () => {
  assert.equal(R.ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST, "repository.close_pull_request");
  assert.equal(R.ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH, "repository.delete_remote_branch");
  // The happy path must actually be reachable, or the controls prove nothing.
  assert.equal(ev({ request: CLOSE_REQ, evidence: CLOSE_EV }).decision, "director_approved");
  assert.equal(ev({ request: DEL_REQ, evidence: DEL_EV }).decision, "director_approved");
});

await test("NC1 — a MERGED pull request cannot be closed as though unmerged", () => {
  const d = ev({ request: CLOSE_REQ, evidence: { ...CLOSE_EV, pull_request_not_merged: false } });
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("pull_request_not_merged"));
  // Nor a closed one.
  assert.equal(ev({ request: CLOSE_REQ, evidence: { ...CLOSE_EV, pull_request_open: false } }).decision, "policy_denied");
  // And filing refuses any expected state but OPEN.
  assert.equal(H.validateClosePullRequestInputs({ repository: "r", pullRequestNumber: 1, expectedHeadBranch: "b", expectedHeadSha: SHA, expectedState: "merged" }).code, "unsupported_expected_state");
});

await test("NC2 — a changed PR head or branch invalidates the decision", () => {
  for (const k of ["head_sha_matches", "head_branch_matches", "head_repository_matches", "base_branch_matches"]) {
    const d = ev({ request: CLOSE_REQ, evidence: { ...CLOSE_EV, [k]: false } });
    assert.equal(d.decision, "policy_denied", k);
    assert.ok(d.failed_gates.includes(k), k);
  }
});

await test("NC3 — an unmanaged repository cannot match", () => {
  assert.equal(ev({ request: CLOSE_REQ, evidence: { ...CLOSE_EV, managed_repository: false } }).decision, "policy_denied");
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, managed_repository: false } }).decision, "policy_denied");
});

await test("NC4 — a protected branch can never be deleted", () => {
  // Refused at FILING, before any approval queue.
  for (const b of ["staging", "main", "master", "production", "STAGING", " main "]) {
    assert.equal(H.validateDeleteRemoteBranchInputs({ repository: "r", branch: b, expectedHeadSha: SHA }).code, "protected_branch", b);
    assert.equal(H.isNeverDeletable(b), true, b);
  }
  // And refused again at the gate, even if filing were bypassed.
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, branch_never_protected_name: false } }).decision, "policy_denied");
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, branch_not_protected: false } }).decision, "policy_denied");
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, branch: "staging" } }).decision, "policy_denied");
});

await test("NC5 — a branch whose remote SHA moved cannot be deleted", () => {
  const d = ev({ request: DEL_REQ, evidence: { ...DEL_EV, remote_head_matches: false } });
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("remote_head_matches"));
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, branch_exists_remotely: false } }).decision, "policy_denied");
});

await test("NC6 — a branch an open PR still depends on cannot be deleted prematurely", () => {
  const d = ev({ request: DEL_REQ, evidence: { ...DEL_EV, no_open_pull_request_depends: false } });
  assert.equal(d.decision, "policy_denied");
  assert.ok(d.failed_gates.includes("no_open_pull_request_depends"));
});

await test("NC7 — an active lane/run reference, or unique work, blocks deletion", () => {
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, active_lane_reference: true } }).decision, "policy_denied");
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, unique_work_at_risk: true } }).decision, "policy_denied");
});

await test("NC8 — UNKNOWN durability state cannot be reasoned around", () => {
  // The worker cannot self-declare disposability: an unmeasured gate escalates.
  for (const k of ["unique_work_at_risk", "no_open_pull_request_depends", "branch_not_protected", "active_lane_reference"]) {
    const e = { ...DEL_EV }; delete e[k];
    const d = ev({ request: DEL_REQ, evidence: e });
    assert.equal(d.decision, "operator_approval_required", k);
    assert.match(d.escalation_reason, /not measured/);
  }
  assert.equal(ev({ request: DEL_REQ, evidence: {} }).decision, "operator_approval_required");
  assert.equal(ev({ request: CLOSE_REQ, evidence: {} }).decision, "operator_approval_required");
});

await test("NC9 — an abbreviated SHA fails at FILING for both capabilities", () => {
  assert.equal(H.validateDeleteRemoteBranchInputs({ repository: "r", branch: "agent/cursor/5-x", expectedHeadSha: "26bb8fe" }).code, "abbreviated_source_sha");
  assert.equal(H.validateClosePullRequestInputs({ repository: "r", pullRequestNumber: 1, expectedHeadBranch: "b", expectedHeadSha: "26bb8fe" }).code, "abbreviated_source_sha");
});

await test("NC10 — an operator denial or hold cannot be overridden", () => {
  assert.equal(ev({ request: { ...DEL_REQ, operator_approval: { decision: "denied", actor: "operator" } }, evidence: DEL_EV }).decision, "operator_approval_required");
  assert.equal(ev({ request: DEL_REQ, evidence: { ...DEL_EV, operator_hold: true } }).decision, "operator_approval_required");
  assert.equal(ev({ request: CLOSE_REQ, evidence: { ...CLOSE_EV, operator_hold: true } }).decision, "operator_approval_required");
});

await test("NC11 — production never inherits housekeeping authority", () => {
  for (const env of ["production", "alloy_deployed_primary"]) {
    assert.equal(ev({ request: { ...DEL_REQ, target: env }, evidence: { ...DEL_EV, environment: env } }).decision, "operator_approval_required", env);
    assert.equal(ev({ request: { ...CLOSE_REQ, target: env }, evidence: { ...CLOSE_EV, environment: env } }).decision, "operator_approval_required", env);
  }
});

await test("NC12 — self-expansion still escalates, and merge stays disabled", () => {
  const d = ev({ request: { ...DEL_REQ, inputs: { ...DEL_REQ.inputs, changed_files: ["scripts/local-dev/lib/vacilando/director-authority.mjs"] } }, evidence: DEL_EV });
  assert.equal(d.decision, "operator_approval_required");
  assert.match(d.escalation_reason, /own authority/);
  assert.equal(D.DELEGATED_POLICIES_V1.find((p) => p.action_key === "repository.merge_pull_request").enabled, false);
});

await test("NC13 — scope did not widen: no force, rewrite or delete-repository capability", () => {
  const keys = Object.values(R.ACTION_TYPES);
  for (const forbidden of ["repository.force_push", "repository.delete", "repository.rewrite_history", "repository.force_delete_branch"]) {
    assert.ok(!keys.includes(forbidden), `${forbidden} must not exist`);
  }
  assert.equal(keys.length, 10, "exactly two capabilities were added");
});
