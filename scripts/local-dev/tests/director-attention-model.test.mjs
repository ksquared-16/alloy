/**
 * The Director Attention Model — what stopped asking, and what must never stop asking.
 *
 * The finding behind this suite: routine promotion actions were escalating to
 * the operator not because anyone judged them risky, but because nothing
 * measured them. The merge policy named ten gates and the evidence collector
 * gathered none of them, so every merge went to a human who approved it by
 * reading the same GitHub page a collector could read. That approval cost an
 * interruption and added no safety.
 *
 * So the tests that matter here are the ones proving the guards SURVIVED the
 * removal of the click.
 */
import test from "node:test";
import assert from "node:assert/strict";

const D = await import("../lib/vacilando/director-authority.mjs");
const H = await import("../lib/vacilando/trusted-host-repository-housekeeping.mjs");

const SHA = "a".repeat(40);
const OTHER = "b".repeat(40);

/* ── Ownership is measured, not named ───────────────────────────────────── */

test("ownership is proven by observation, not by a branch-name pattern", () => {
  // A name can be chosen. Being checked out on a branch cannot be claimed.
  assert.equal(D.GATES.branch_owned_by_requesting_lane({ branch_owned_by_requesting_lane: true }), true);
  assert.equal(D.GATES.branch_owned_by_requesting_lane({ branch_owned_by_requesting_lane: false }), false);
  // Unreadable worktree is NOT "unowned" — it is unmeasured, and escalates.
  assert.equal(D.GATES.branch_owned_by_requesting_lane({}), null);
});

test("the push and open-PR policies rely on the measured proof", () => {
  for (const key of ["repository.push", "promotion.open_pr"]) {
    const p = D.DELEGATED_POLICIES_V1.find((x) => x.action_key === key);
    assert.ok(p.gates.includes("branch_owned_by_requesting_lane"), `${key} must prove ownership`);
    // The old proxy must not be the thing carrying ownership any more.
    assert.ok(!p.gates.includes("managed_agent_branch"), `${key} should not rest on a naming convention`);
    // Everything that made the action safe before is still required.
    for (const g of ["managed_repository", "full_exact_sha",
      "no_governance_exception", "no_operator_hold"]) {
      assert.ok(p.gates.includes(g), `${key} lost ${g}`);
    }
  }
  // Push writes a ref, so it alone must refuse protected branches and
  // credential material. Opening a PR writes no ref; it must instead prove the
  // branch really is on the remote at the SHA being proposed.
  const push = D.DELEGATED_POLICIES_V1.find((x) => x.action_key === "repository.push");
  for (const g of ["not_protected_branch_write", "no_credential_material"]) {
    assert.ok(push.gates.includes(g), `push lost ${g}`);
  }
  const pr = D.DELEGATED_POLICIES_V1.find((x) => x.action_key === "promotion.open_pr");
  for (const g of ["base_is_staging", "branch_pushed_to_remote"]) {
    assert.ok(pr.gates.includes(g), `open_pr lost ${g}`);
  }
});

/* ── The merge approval was removed only after the guard was built ──────── */

test("the merge policy is enabled and still carries the strictest gate set", () => {
  const p = D.DELEGATED_POLICIES_V1.find((x) => x.policy_id === "certified_staging_merge_v1");
  assert.equal(p.enabled, true);
  for (const g of ["required_checks_successful", "pull_request_mergeable", "head_sha_still_matches",
    "base_is_staging", "certification_suite_passed", "no_unresolved_governance_findings"]) {
    assert.ok(p.gates.includes(g), `merge lost ${g}`);
  }
});

const PR = {
  state: "open", merged: false, draft: false, mergeable: true, mergeable_state: "clean",
  head_sha: SHA, head_ref: "feat/x", base_ref: "staging", head_repo: "ksquared-16/alloy",
};
function ghStub({ pr = PR, checks = [{ name: "Trust DB certification", state: "SUCCESS", bucket: "pass" }], review = { reviewDecision: "APPROVED" } } = {}) {
  return (args) => {
    if (args[0] === "api") return { status: 0, stdout: JSON.stringify(pr), stderr: "" };
    if (args[0] === "pr" && args[1] === "checks") return { status: 0, stdout: JSON.stringify(checks), stderr: "" };
    return { status: 0, stdout: JSON.stringify(review), stderr: "" };
  };
}
const measure = (o) => H.measureMergePullRequestGates(
  { repository: "ksquared-16/alloy", pullRequestNumber: 1, expectedHeadSha: SHA }, { gh: ghStub(o) });

test("a clean, fully-checked PR measures as mergeable", () => {
  const ev = measure();
  assert.equal(ev.pull_request_mergeable, true);
  assert.equal(ev.required_checks_total, 1);
  assert.equal(ev.required_checks_passing, 1);
  assert.equal(ev.certification_suite_passed, true);
  assert.equal(ev.unresolved_governance_findings, 0);
});

test("an uncomputed mergeability is not a yes", () => {
  // GitHub computes this lazily and answers null while it works. Reading null
  // as mergeable is how a conflicted merge gets auto-approved.
  assert.equal(measure({ pr: { ...PR, mergeable: null } }).pull_request_mergeable, null);
});

test("a draft or dirty PR is not mergeable", () => {
  assert.equal(measure({ pr: { ...PR, draft: true } }).pull_request_mergeable, false);
  assert.equal(measure({ pr: { ...PR, mergeable_state: "dirty" } }).pull_request_mergeable, false);
});

test("a skipped check is not a passed check", () => {
  // Counting skipped as green is how a suite that never ran looks certified.
  const ev = measure({ checks: [
    { name: "Trust DB certification", state: "SUCCESS", bucket: "pass" },
    { name: "Supabase Preview", state: "SKIPPED", bucket: "skipping" },
  ] });
  assert.equal(ev.required_checks_total, 1, "the skipped check must leave the denominator");
  assert.equal(ev.required_checks_passing, 1);
});

test("pending and failing checks block the gate", () => {
  const pending = measure({ checks: [{ name: "Trust DB certification", state: "IN_PROGRESS", bucket: "pending" }] });
  assert.equal(D.GATES.required_checks_successful(pending), false);
  const failing = measure({ checks: [{ name: "Trust DB certification", state: "FAILURE", bucket: "fail" }] });
  assert.equal(D.GATES.required_checks_successful(failing), false);
});

test("a PR with no checks at all does not read as certified", () => {
  const ev = measure({ checks: [] });
  assert.equal(D.GATES.required_checks_successful(ev), false, "zero checks is not all-checks-passed");
  assert.equal(ev.certification_suite_passed, null, "no certification suite ran: unmeasured, not passed");
});

test("changes requested is an unresolved governance finding", () => {
  const ev = measure({ review: { reviewDecision: "CHANGES_REQUESTED" } });
  assert.equal(D.GATES.no_unresolved_governance_findings(ev), false);
});

test("an unreadable PR is unmeasured, never permissive", () => {
  const gh = () => ({ status: 1, stdout: "", stderr: "gh: not found" });
  const ev = H.measureMergePullRequestGates({ repository: "r", pullRequestNumber: 1, expectedHeadSha: SHA }, { gh });
  assert.equal(ev.pull_request_readable, false);
  for (const g of ["pull_request_mergeable", "required_checks_successful", "head_sha_still_matches"]) {
    assert.notEqual(D.GATES[g](ev), true, `${g} must not pass on an unreadable PR`);
  }
});

test("a moved head is caught: the PR must still be what was approved", () => {
  const ev = { ...measure({ pr: { ...PR, head_sha: OTHER } }), source_sha: SHA };
  assert.equal(D.GATES.head_sha_still_matches(ev), false);
});

/* ── End to end: routine approves, unsafe still refuses ─────────────────── */

const GOOD_PUSH = {
  repository: "ksquared-16/alloy", managed_repository: true, branch: "feat/x", source_sha: SHA,
  environment: "staging", branch_owned_by_requesting_lane: true,
  credential_material_detected: false, governance_exception_active: false, operator_hold: false,
};
const req = (action_key, inputs = {}) => ({
  request_id: "t", action_key, target: "staging", content_fingerprint: "f".repeat(32), inputs,
});

test("a lane pushing its own branch no longer needs a click", () => {
  const d = D.evaluateDirectorAuthority({ request: req("repository.push"), evidence: GOOD_PUSH });
  assert.equal(d.decision, "director_approved");
});

test("but a lane pushing a branch it does not hold is refused", () => {
  const d = D.evaluateDirectorAuthority({
    request: req("repository.push"), evidence: { ...GOOD_PUSH, branch_owned_by_requesting_lane: false } });
  assert.equal(d.decision, "policy_denied");
});

test("pushing a protected branch is still refused", () => {
  const d = D.evaluateDirectorAuthority({
    request: req("repository.push"), evidence: { ...GOOD_PUSH, branch: "staging" } });
  assert.equal(d.decision, "policy_denied");
});

test("credential material in the range is still refused", () => {
  const d = D.evaluateDirectorAuthority({
    request: req("repository.push"), evidence: { ...GOOD_PUSH, credential_material_detected: true } });
  assert.equal(d.decision, "policy_denied");
});

test("an operator hold still stops everything, whatever the tier", () => {
  for (const key of ["repository.push", "promotion.open_pr", "repository.merge_pull_request"]) {
    const d = D.evaluateDirectorAuthority({
      request: req(key), evidence: { ...GOOD_PUSH, operator_hold: true } });
    assert.equal(d.decision, "operator_approval_required", `${key} ignored an operator hold`);
  }
});

test("removing the click did not remove the audit", () => {
  const d = D.evaluateDirectorAuthority({ request: req("repository.push"), evidence: GOOD_PUSH });
  // Auto-execution that cannot be reconstructed later is not governance.
  assert.ok(d.matched_policy);
  assert.ok(d.policy_version);
  assert.ok(d.evaluated_at);
  assert.equal(d.decision_actor, "director");
  assert.deepEqual(Object.keys(d.deterministic_evidence).sort(),
    [...D.DELEGATED_POLICIES_V1.find((p) => p.action_key === "repository.push").gates].sort());
});

test("the operator's reserved classes did not quietly join the routine tier", () => {
  for (const key of D.OPERATOR_OWNED_ACTION_KEYS) {
    const d = D.evaluateDirectorAuthority({ request: req(key), evidence: GOOD_PUSH });
    assert.equal(d.decision, "operator_approval_required", `${key} must stay with the operator`);
  }
});

test("self-expansion is still refused before any policy can match it", () => {
  for (const key of D.SELF_EXPANSION_ACTION_KEYS) {
    const d = D.evaluateDirectorAuthority({ request: req(key), evidence: GOOD_PUSH });
    assert.equal(d.decision, "operator_approval_required");
    assert.match(d.escalation_reason, /own authority|policy itself/i);
  }
});
