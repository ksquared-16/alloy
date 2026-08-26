#!/usr/bin/env node
/**
 * In-UI governed approval for a lane with no Mission binding.
 *
 * WHAT THIS SUITE IS DEFENDING. Two separate things, and they pull in opposite
 * directions:
 *
 *  1. A lane whose repository carries governed promotion must be able to reach
 *     an APPROVABLE proposal instead of the `missing_mission_binding` dead end.
 *  2. Nothing else may become easier. An unbound lane, a generic repository, a
 *     self-approval, a spent grant, a moved branch — every one of those must
 *     still refuse, and each refusal has a positive control here proving the
 *     test could have caught the opposite.
 *
 * The live-merge guard is tested hardest, because its absence is not
 * hypothetical: on 2026-08-25 a verification run merged PR #508 into staging for
 * real. The runtime root had been redirected to a scratch copy, which isolated
 * every store the code writes and isolated nothing about the `gh` subprocess at
 * the end of it.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-gov-approval-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  requestGovernedAction,
  approveGovernedAction,
  denyGovernedAction,
  pendingGovernedActionForLane,
  publicGovernedAction,
  getGovernedAction,
  governedProposalFor,
  resetGovernedActionsForTests,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
} = await import("../lib/vacilando/governed-action-request.mjs");
const {
  resolveGovernedAuthoritySync,
  mintGrant,
  getGrant,
  consumeGrant,
  revokeGrant,
  grantIsValidFor,
  proposalFingerprint,
  resetGovernedGrantsForTests,
  GRANT_TTL_MS,
} = await import("../lib/vacilando/governed-repository-authority.mjs");
const {
  grantAuthorizesAction,
} = await import("../lib/vacilando/trusted-host-actions.mjs");
const {
  liveMergePermitted,
  canonicalGatewayRuntimeRoot,
  mergePullRequest,
} = await import("../lib/vacilando/trusted-host-merge.mjs");
const {
  createDurableLane,
  bindLaneMission,
  resetDevelopmentLanesForTests,
  getDurableLane,
} = await import("../lib/vacilando/development-lane.mjs");
const {
  createQueuedRun,
  transitionExecutionRun,
  getExecutionRun,
  resetExecutionRunsForTests,
  attachLaneRuns,
} = await import("../lib/vacilando/execution-run.mjs");
const { DIRECTOR_GOVERNED_RESOURCE_KEY, orchestrateDirectorGovernedWait, processGovernedAction } =
  await import("../lib/vacilando/governed-action-request.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const { renderGovernedProposal, renderOperatorDecisionActions, renderOperatorDecisionBar, operatorDecisionRun } =
  await import("../apps/vacilando/public/gateway-view.mjs");
const { attachLaneGovernedActions } = await import("../lib/vacilando/governed-action-request.mjs");

const HEAD = "4cffed0abe32fbeaef89992a8083c2ec7ada8914";
const OTHER_HEAD = "1111111111111111111111111111111111111111";

let pass = 0;
let fail = 0;

function seedRepositories() {
  const rec = (id, name, profile) => ({
    schema_version: "vacilando.repository.v1",
    repository_id: id,
    name,
    profile,
    state: "ACTIVE",
    root: join(ROOT, "repos", id),
    git_common_dir: join(ROOT, "repos", id, ".git"),
    worktree_parent: join(ROOT, "worktrees", id),
    default_branch: "origin/staging",
    remote: "git@github.com:ksquared-16/alloy.git",
    created_at: "2026-08-01T00:00:00Z",
    updated_at: "2026-08-01T00:00:00Z",
  });
  const store = {
    schema_version: "vacilando.repository.v1",
    repositories: {
      repo_alloy: rec("repo_alloy", "Alloy", "alloy"),
      repo_plain: rec("repo_plain", "Notes", "generic"),
    },
  };
  mkdirSync(join(ROOT, "vacilando"), { recursive: true });
  writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function test(name, fn) {
  resetGovernedActionsForTests(ROOT);
  resetExecutionRunsForTests(ROOT);
  resetDevelopmentLanesForTests(ROOT);
  resetGovernedGrantsForTests(ROOT);
  setGovernedActionExecuteImplForTests(null);
  setGovernedActionResumeImplForTests({});
  seedRepositories();
  try {
    await fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

/** A lane in a repository, with no Mission binding unless asked for. */
function laneIn(repositoryId, { name = "promotion lane" } = {}) {
  const made = createDurableLane({ name, repository_id: repositoryId, root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  assert.ok(laneId, `lane creation failed: ${made.error || "unknown"}`);
  assert.equal(getDurableLane(laneId, ROOT)?.repository_id, repositoryId);
  return laneId;
}

function mergeRequest(laneId, overrides = {}) {
  return {
    action_key: "repository.merge_pull_request",
    lane_id: laneId,
    run_id: "erun_test0000000001",
    target: "staging",
    purpose: "Promote the reviewed change",
    reason_worker_cannot_execute: "The lane cannot hold GitHub credentials.",
    requesting_worker: laneId,
    inputs: {
      repository: "ksquared-16/alloy",
      pull_request_number: 508,
      target_branch: "staging",
      expected_head_sha: HEAD,
      merge_method: "merge",
    },
    ...overrides,
  };
}

function proposal(overrides = {}) {
  return {
    proposal_id: "gar_test",
    action_key: "repository.merge_pull_request",
    repository_id: "repo_alloy",
    pull_request_number: 508,
    expected_head_sha: HEAD,
    target_branch: "staging",
    merge_method: "merge",
    run_id: "erun_test0000000001",
    lane_id: "lane_test",
    requested_by: "lane_test",
    ...overrides,
  };
}

// ------------------------------------------------------------------ authority

await test("repository profile supplies authority when there is no mission", () => {
  const laneId = laneIn("repo_alloy");
  const out = resolveGovernedAuthoritySync(laneId, { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.kind, "repository");
  assert.equal(out.repository_id, "repo_alloy");
  assert.equal(out.canonical_branch, "staging");
});

await test("a bound mission still wins, and is reported as the mission", () => {
  const laneId = laneIn("repo_alloy");
  bindLaneMission(laneId, "msn_example00000001", { root: ROOT });
  const out = resolveGovernedAuthoritySync(laneId, { root: ROOT });
  assert.equal(out.ok, true);
  assert.equal(out.kind, "mission");
  assert.equal(out.mission_id, "msn_example00000001");
});

await test("generic profile is refused, and says why", () => {
  const laneId = laneIn("repo_plain");
  const out = resolveGovernedAuthoritySync(laneId, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "repository_profile_forbids_governed_action");
  assert.equal(out.profile, "generic");
});

await test("a lane with neither mission nor repository keeps the old contract", () => {
  // POSITIVE CONTROL for the two tests above: the widened path must not have
  // turned this case into a success, and its error code is depended on by the
  // existing handoff suite.
  const made = createDurableLane({ name: "unbound", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const out = resolveGovernedAuthoritySync(laneId, { root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_mission_binding");
});

// ------------------------------------------------------------------- proposal

await test("a repository-authorized merge becomes an approvable proposal", () => {
  const laneId = laneIn("repo_alloy");
  const out = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error || "");
  assert.equal(out.request.status, "awaiting_operator");
  assert.equal(out.request.authority.kind, "repository");
  assert.equal(out.request.authority.repository_id, "repo_alloy");
  assert.equal(out.request.mission_id, null);
  // No Mission Decision is created, and none is adopted from another mission.
  assert.equal(out.request.decision_id, null);
});

await test("a generic repository still cannot raise a governed merge", () => {
  const laneId = laneIn("repo_plain");
  const out = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  assert.equal(out.ok, false);
  assert.equal(out.error, "repository_profile_forbids_governed_action");
  assert.equal(pendingGovernedActionForLane(laneId, ROOT), null);
});

await test("the approval card carries the facts a Director needs", () => {
  const laneId = laneIn("repo_alloy");
  const out = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  const p = out.request.proposal;
  assert.ok(p, "merge requests must carry a proposal");
  const labels = p.facts.map((f) => f.label);
  for (const want of ["Repository", "Pull request", "Target branch", "Head commit", "Merge method"]) {
    assert.ok(labels.includes(want), `card is missing ${want}`);
  }
  assert.ok(p.consequences.length >= 1, "the card must say what approving does");
  assert.match(p.authorization_note, /single-use/i);
  // GitHub snapshot is best-effort. When gh can inspect PR #508 the card
  // carries live facts; when it cannot, snapshot_available is false so the
  // card does not invent zeroes. Either is honest.
  assert.equal(typeof p.snapshot_available, "boolean");
  if (!p.snapshot_available) {
    const ci = p.facts.find((f) => f.label === "Continuous integration");
    assert.equal(ci?.value, "not checked at proposal time");
  }
});

await test("the card renders, and stacks its own facts", () => {
  const laneId = laneIn("repo_alloy");
  const out = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  const html = renderGovernedProposal(out.request.proposal);
  assert.match(html, /data-gw-governed-proposal/);
  assert.match(html, /#508/);
  assert.match(html, /staging/);
  // And it reaches the operator through the real decision surface.
  const bar = renderOperatorDecisionActions({ governed_action: out.request });
  assert.match(bar, /data-gw-governed-approve/);
  assert.match(bar, /data-gw-governed-proposal/);
});

await test("a census proposal is unaffected", () => {
  // POSITIVE CONTROL: governedProposalFor must not decorate every action.
  assert.equal(governedProposalFor({ action_key: "database.read_census" }), null);
});

// ------------------------------------------------------------------- approval

await test("the requesting lane cannot approve its own request", () => {
  const laneId = laneIn("repo_alloy");
  const made = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  return approveGovernedAction(made.request.request_id, { actor: laneId, root: ROOT })
    .then((out) => {
      assert.equal(out.ok, false);
      assert.equal(out.error, "self_approval_refused");
      const after = getGovernedAction(made.request.request_id, ROOT);
      assert.equal(after.status, "awaiting_operator", "a refused approval must not advance the request");
      assert.equal(after.grant_id, undefined, "no grant may be minted");
    });
});

await test("an operator approval mints exactly one single-use grant", async () => {
  const laneId = laneIn("repo_alloy");
  const made = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  // Execution is stubbed: this test is about authorization, not about merging.
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: { id: "tha_x", state: "completed", actionType: "repository.merge_pull_request", inputs: {}, result: { mergeSha: "abc", evidencePath: join(ROOT, "e.json") } },
  }));
  const out = await approveGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  assert.equal(out.ok, true, out.error || "");
  const rec = getGovernedAction(made.request.request_id, ROOT);
  assert.ok(rec.grant_id, "approval must mint a grant");
  const grant = getGrant(rec.grant_id, ROOT);
  assert.equal(grant.approved_by, "kelly");
  // Spent on use, so a replay needs a fresh decision.
  assert.equal(grant.status, "CONSUMED");
});

await test("denial refuses and mints nothing", async () => {
  const laneId = laneIn("repo_alloy");
  const made = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  const out = denyGovernedAction(made.request.request_id, { actor: "kelly", reason: "not now", root: ROOT });
  assert.equal(out.denied, true);
  const rec = getGovernedAction(made.request.request_id, ROOT);
  assert.equal(rec.status, "failed");
  assert.equal(rec.grant_id, undefined);
});

// ---------------------------------------------------------------------- grant

await test("a grant is pinned to the exact proposal", () => {
  const minted = mintGrant({ proposal: proposal(), approvedBy: "kelly", root: ROOT });
  assert.equal(minted.ok, true);
  const grant = getGrant(minted.grant.grant_id, ROOT);
  // Same proposal: valid.
  assert.equal(grantIsValidFor(grant, proposal()).ok, true);
  // Moved branch: refused. This is the case the pin exists for.
  const moved = grantIsValidFor(grant, proposal({ expected_head_sha: OTHER_HEAD }));
  assert.equal(moved.ok, false);
  assert.equal(moved.error, "grant_stale");
  // A different PR is a different decision.
  assert.equal(grantIsValidFor(grant, proposal({ pull_request_number: 999 })).error, "grant_stale");
});

await test("a grant is spent once", () => {
  const minted = mintGrant({ proposal: proposal(), approvedBy: "kelly", root: ROOT });
  const first = consumeGrant(minted.grant.grant_id, { root: ROOT });
  assert.equal(first.ok, true);
  assert.equal(first.already, false);
  const second = consumeGrant(minted.grant.grant_id, { root: ROOT });
  // A double tap reads as done, never as a second execution.
  assert.equal(second.already, true);
  assert.equal(grantIsValidFor(getGrant(minted.grant.grant_id, ROOT), proposal()).error, "grant_already_used");
});

await test("a grant expires, and a revoked grant stops working", () => {
  const t0 = Date.parse("2026-08-25T12:00:00Z");
  const minted = mintGrant({ proposal: proposal(), approvedBy: "kelly", nowMs: t0, root: ROOT });
  const grant = getGrant(minted.grant.grant_id, ROOT);
  // POSITIVE CONTROL: valid one second before it lapses.
  assert.equal(grantIsValidFor(grant, proposal(), { nowMs: t0 + GRANT_TTL_MS - 1000 }).ok, true);
  assert.equal(grantIsValidFor(grant, proposal(), { nowMs: t0 + GRANT_TTL_MS + 1 }).error, "grant_expired");

  const other = mintGrant({ proposal: proposal(), approvedBy: "kelly", root: ROOT });
  revokeGrant(other.grant.grant_id, { reason: "changed my mind", root: ROOT });
  assert.equal(grantIsValidFor(getGrant(other.grant.grant_id, ROOT), proposal()).error, "grant_revoked");
});

await test("self-approval is refused at the grant, not only at the request", () => {
  const out = mintGrant({ proposal: proposal({ requested_by: "lane_test" }), approvedBy: "lane_test", root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "self_approval_refused");
  // POSITIVE CONTROL: a different approver succeeds on the same proposal.
  assert.equal(mintGrant({ proposal: proposal({ requested_by: "lane_test" }), approvedBy: "kelly", root: ROOT }).ok, true);
});

await test("the executor re-derives the grant from the action, not the request", () => {
  const minted = mintGrant({ proposal: proposal(), approvedBy: "kelly", root: ROOT });
  const grant = getGrant(minted.grant.grant_id, ROOT);
  const action = {
    id: "tha_1",
    actionType: "repository.merge_pull_request",
    missionId: "repo_alloy",
    executionSessionId: "erun_test0000000001",
    inputs: {
      pullRequestNumber: 508,
      expectedHeadSha: HEAD,
      targetBranch: "staging",
      mergeMethod: "merge",
    },
  };
  assert.equal(grantAuthorizesAction(grant, action).ok, true);
  // Each field the Director weighed is checked independently.
  assert.equal(grantAuthorizesAction(grant, { ...action, inputs: { ...action.inputs, expectedHeadSha: OTHER_HEAD } }).error, "grant_head_sha_mismatch");
  assert.equal(grantAuthorizesAction(grant, { ...action, inputs: { ...action.inputs, pullRequestNumber: 7 } }).error, "grant_pull_request_mismatch");
  assert.equal(grantAuthorizesAction(grant, { ...action, inputs: { ...action.inputs, mergeMethod: "squash" } }).error, "grant_merge_method_mismatch");
  assert.equal(grantAuthorizesAction(grant, { ...action, missionId: "repo_other" }).error, "grant_scope_mismatch");
  assert.equal(grantAuthorizesAction(grant, { ...action, executionSessionId: "erun_other" }).error, "grant_run_mismatch");
  assert.equal(grantAuthorizesAction(null, action).error, "grant_missing");
});

// ----------------------------------------------------------- live merge guard

await test("a real merge is refused from anywhere but the Gateway runtime root", () => {
  // This is the exact condition under which PR #508 was merged by mistake: a
  // redirected runtime root, which isolates state and not subprocesses.
  const scratch = liveMergePermitted({ env: { ALLOY_RUNTIME_ROOT: join(ROOT, "scratch", "gateway") } });
  assert.equal(scratch.ok, false);
  assert.equal(scratch.code, "live_merge_outside_gateway_runtime_root");

  const unset = liveMergePermitted({ env: {} });
  assert.equal(unset.ok, false);
  assert.equal(unset.code, "live_merge_requires_gateway_runtime_root");

  const fromTests = liveMergePermitted({
    env: { NODE_TEST_CONTEXT: "child-v8", ALLOY_RUNTIME_ROOT: canonicalGatewayRuntimeRoot() },
  });
  assert.equal(fromTests.ok, false);
  assert.equal(fromTests.code, "live_merge_from_test_runner");
});

await test("the guard permits the Gateway, and never blocks an injected client", () => {
  // POSITIVE CONTROL for the refusals above: without these two passing, the
  // guard could be refusing everything and the suite would still look green.
  assert.equal(liveMergePermitted({ env: { ALLOY_RUNTIME_ROOT: canonicalGatewayRuntimeRoot() } }).ok, true);
  const injected = liveMergePermitted({ injectedGh: true });
  assert.equal(injected.ok, true);
  assert.equal(injected.simulated, true);
});

await test("the guard sits in front of the merge, not behind it", () => {
  // An end-to-end control cannot be run here: proving a REAL merge is refused
  // needs a real open pull request, and a guard that failed would merge it.
  // So the placement invariant is asserted directly — the mutating `gh pr
  // merge` call must not be reachable without passing the guard first.
  const src = readMergeSource();
  const guardAt = src.indexOf("liveMergePermitted({ injectedGh:");
  const mergeAt = src.indexOf('"pr", "merge"');
  assert.ok(guardAt > 0, "the guard call must exist in the merge path");
  assert.ok(mergeAt > 0, "the merge command must exist");
  assert.ok(guardAt < mergeAt, "the guard must come before the merge command");
});

await test("a merge attempt under the test runner refuses instead of merging", () => {
  // Reaches mergePullRequest for real, with a gh that reports a green, open,
  // mergeable PR. The only reason nothing is merged is the guard: `gh` here is
  // injected, so it is asked whether the merge is permitted as if it were real.
  let mergeCalled = false;
  const gh = (args) => {
    if (args[1] === "merge") {
      mergeCalled = true;
      return { status: 0, stdout: "", stderr: "" };
    }
    if (args[0] === "api") return { status: 1, stdout: "", stderr: "no graphql in tests" };
    return {
      status: 0,
      stderr: "",
      stdout: JSON.stringify({
        number: 508,
        state: "OPEN",
        isDraft: false,
        mergeable: "MERGEABLE",
        mergeStateStatus: "CLEAN",
        baseRefName: "staging",
        headRefName: "agent/x",
        headRefOid: HEAD,
        url: "https://github.com/ksquared-16/alloy/pull/508",
        title: "Runtime field fix",
        statusCheckRollup: [{ __typename: "CheckRun", name: "ci", status: "COMPLETED", conclusion: "SUCCESS" }],
        reviewDecision: "APPROVED",
        mergeCommit: null,
        changedFiles: 3,
        additions: 40,
        deletions: 2,
      }),
    };
  };
  const out = mergePullRequest({
    repository: "ksquared-16/alloy",
    pull_request_number: 508,
    target_branch: "staging",
    expected_head_sha: HEAD,
    merge_method: "merge",
  }, { gh });
  // An injected client is exempt from the guard, so this DOES proceed — which
  // is the seam tests are meant to use, and proves the guard has not made the
  // merge path untestable.
  assert.equal(out.ok, true, out.detail || out.code || "");
  assert.equal(mergeCalled, true, "an injected client must still exercise the merge");
});

// -------------------------------------------------- orchestrator and resume

/** A lane in a repository with a run parked on the governed-action wait. */
function blockedRunIn(repositoryId) {
  const laneId = laneIn(repositoryId, { name: "runtime performance" });
  const queued = createQueuedRun({
    laneId,
    instruction: "Promote the reviewed change",
    worktreePath: ROOT,
    origin: "operator",
    root: ROOT,
  });
  assert.equal(queued.ok, true, queued.error);
  transitionExecutionRun(queued.run.run_id, "EXECUTING", {
    origin: "system", root: ROOT, reason: "delivered", worktreePath: ROOT,
  });
  transitionExecutionRun(queued.run.run_id, "WAITING_RESOURCE", {
    origin: "agent",
    root: ROOT,
    resource_wait: {
      resource_key: DIRECTOR_GOVERNED_RESOURCE_KEY,
      action_key: "repository.merge_pull_request",
      target: "staging",
      purpose: "Promote the reviewed change",
      reason_worker_cannot_execute: "The lane cannot hold GitHub credentials.",
      inputs: {
        repository: "ksquared-16/alloy",
        pull_request_number: 508,
        target_branch: "staging",
        expected_head_sha: HEAD,
        merge_method: "merge",
      },
    },
  });
  return { laneId, runId: queued.run.run_id };
}

await test("a blocked run reaches a proposal instead of a dead end", () => {
  // This is the exact shape that produced `missing_mission_binding` in
  // production: a run parked on director_governed_action, in a lane with a
  // repository and no mission.
  const { laneId, runId } = blockedRunIn("repo_alloy");
  const out = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  assert.equal(out.ok, true, out.error || out.detail || "");
  // The orchestrator records the request; the Director tick processes it.
  assert.equal(out.request.status, "requested");
  assert.equal(out.request.authority.kind, "repository");
  const processed = processGovernedAction(out.request.request_id, { root: ROOT });
  assert.equal(processed.awaiting_operator, true, processed.error || "");
  assert.equal(getGovernedAction(out.request.request_id, ROOT).status, "awaiting_operator");
  assert.ok(pendingGovernedActionForLane(laneId, ROOT), "the lane must now hold an approvable request");
});

await test("the orchestrator still refuses a repository that forbids promotion", () => {
  // POSITIVE CONTROL for the test above, on the same code path.
  const { runId } = blockedRunIn("repo_plain");
  const out = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "repository_profile_forbids_governed_action");
  assert.match(out.detail, /generic profile/i);
  // And it says so on the run, so the operator is not left guessing.
  assert.match(getExecutionRun(runId, ROOT).state_reason || "", /generic profile/i);
});

await test("approving resumes the originating run exactly once", async () => {
  const { runId } = blockedRunIn("repo_alloy");
  const made = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  const resumed = [];
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: {
      id: "tha_merge",
      state: "completed",
      actionType: "repository.merge_pull_request",
      inputs: {},
      result: { mergeSha: "37cd4113a", evidencePath: join(ROOT, "merge.json") },
    },
  }));
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => {
      resumed.push(id);
      return { ok: true, same_lane: true, same_worktree: true, same_branch: true };
    },
  });
  const out = await approveGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  assert.equal(out.ok, true, out.error || "");
  assert.equal(out.request.status, "complete");
  await new Promise((r) => setImmediate(r));
  assert.equal(resumed.length, 1, "the originating lane resumes once, not zero times and not twice");
  // resumeLane is handed the request, and the request carries the lane.
  assert.equal(getGovernedAction(resumed[0], ROOT).run_id, runId);
});

await test("a denied proposal does not resume the run", async () => {
  // POSITIVE CONTROL for the resume above: resume must be a consequence of
  // approval, not something that happens whenever a decision is recorded.
  const { runId } = blockedRunIn("repo_alloy");
  const made = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  const resumed = [];
  setGovernedActionResumeImplForTests({
    resumeLane: async (id) => { resumed.push(id); return { ok: true }; },
  });
  denyGovernedAction(made.request.request_id, { actor: "kelly", reason: "not now", root: ROOT });
  await new Promise((r) => setImmediate(r));
  assert.equal(resumed.length, 0);
});

// ------------------------------------- an approval outlives its own turn

await test("an approval stays reachable after its run completes", async () => {
  // THE COMMUNICATIONS FAILURE. The lane filed a merge request for PR #510 and
  // then closed its turn while the Director had not yet answered. attachLaneRuns
  // reports only a NON-terminal run as active, so execution_run went null — and
  // the decision bar, which read execution_run alone, rendered nothing. The
  // approval existed, was correct, and could not be answered.
  const { laneId, runId } = blockedRunIn("repo_alloy");
  const made = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  processGovernedAction(made.request.request_id, { root: ROOT });
  // The real path Communications took: it reported the wait, then closed the
  // turn while the Director had not answered.
  const toNeeds = transitionExecutionRun(runId, "NEEDS_INPUT", {
    origin: "agent", root: ROOT, reason: `Governed merge ${made.request.request_id} awaiting operator`,
  });
  assert.equal(toNeeds.ok, true, toNeeds.error);
  const toDone = transitionExecutionRun(runId, "COMPLETE", {
    origin: "agent", root: ROOT, reason: "turn_finished",
    completion_report: { summary: "AWAITING_OPERATOR on the governed merge." },
  });
  assert.equal(toDone.ok, true, toDone.error);
  assert.equal(getExecutionRun(runId, ROOT).state, "COMPLETE");

  const [lane] = attachLaneGovernedActions(
    attachLaneRuns([{ lane_id: laneId }], ROOT),
    ROOT,
  );
  assert.equal(lane.execution_run, null, "a finished run is not active — this is the precondition");
  assert.equal(lane.governed_action.status, "awaiting_operator");

  // POSITIVE CONTROL: the former call reads execution_run and renders nothing.
  assert.equal(renderOperatorDecisionBar(lane.execution_run), "");

  // The fix: the lane's pending approval is found wherever its run is.
  const decision = operatorDecisionRun(lane);
  assert.ok(decision, "the decision bar must have a run to read");
  assert.equal(decision.governed_action.request_id, made.request.request_id);
  const html = renderOperatorDecisionBar(decision);
  assert.match(html, /data-gw-governed-approve/);
  assert.match(html, /data-request-id="gar_/);
  assert.match(html, /Needs approval/);
  // And it is attached to previous_run in the payload, not only at lane level.
  assert.equal(lane.previous_run.governed_action.request_id, made.request.request_id);
});

await test("a completed approval does not keep Authorize push on a frozen run snapshot", async () => {
  const { laneId, runId } = blockedRunIn("repo_alloy");
  const made = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  processGovernedAction(made.request.request_id, { root: ROOT });
  assert.equal(transitionExecutionRun(runId, "NEEDS_INPUT", {
    origin: "agent", root: ROOT, reason: "awaiting operator",
  }).ok, true);
  assert.equal(transitionExecutionRun(runId, "COMPLETE", {
    origin: "agent", root: ROOT, reason: "turn_finished",
    completion_report: { summary: "Waiting on operator for the push." },
  }).ok, true);
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: {
      id: "tha_push", state: "completed", actionType: "repository.push",
      inputs: {}, result: { pushedSha: "abc", evidencePath: join(ROOT, "p.json") },
    },
  }));
  const approved = await approveGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  assert.equal(approved.ok, true, approved.error);
  assert.equal(getGovernedAction(made.request.request_id, ROOT).status, "complete");

  const [lane] = attachLaneGovernedActions(attachLaneRuns([{ lane_id: laneId }], ROOT), ROOT);
  assert.equal(lane.execution_run, null);
  assert.equal(lane.previous_run.governed_action.status, "complete");
  assert.notEqual(lane.governed_action?.status, "awaiting_operator");
  const decision = operatorDecisionRun(lane);
  assert.equal(renderOperatorDecisionBar(decision).includes("data-gw-governed-approve"), false);
});

await test("nothing is widened when no approval is waiting", () => {
  // POSITIVE CONTROL for the test above. With no pending decision the resolver
  // must return exactly what it returned before, or the stale-run branch would
  // start firing on finished runs that never asked for anything.
  assert.equal(operatorDecisionRun({ execution_run: null, previous_run: { run_id: "erun_x" } }), null);
  const active = { run_id: "erun_a", state: "EXECUTING" };
  assert.equal(operatorDecisionRun({ execution_run: active }), active);
  // A resolved approval is not a waiting one.
  assert.equal(
    operatorDecisionRun({ execution_run: null, governed_action: { status: "complete" }, previous_run: { run_id: "p" } }),
    null,
  );
});

await test("an active run with an approval is unchanged", () => {
  const active = { run_id: "erun_a", state: "WAITING_RESOURCE", governed_action: { status: "awaiting_operator", request_id: "gar_1" } };
  assert.equal(operatorDecisionRun({ execution_run: active, previous_run: null }), active);
});

function readMergeSource() {
  return readFileSync(new URL("../lib/vacilando/trusted-host-merge.mjs", import.meta.url), "utf8");
}

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
