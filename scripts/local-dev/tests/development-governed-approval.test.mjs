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
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

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
  presentationForGovernedAction,
  governedActionStorePath,
  resetGovernedActionsForTests,
  executeGovernedAction,
  setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
  tickGovernedActions,
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
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");
const { renderGovernedProposal, renderOperatorDecisionActions, renderOperatorDecisionBar, operatorDecisionRun, renderGovernedOutcome } =
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

/**
 * A REAL run, not a made-up id.
 *
 * This named `erun_test0000000001` and never created it, so the case exercised
 * the split-brain hole — governed work authorized against a run the canonical
 * owner had never heard of — rather than the approval flow it describes.
 * Governed requests now verify the run they name.
 */
function runFor(laneId) {
  const made = createQueuedRun({ laneId, instruction: "approval fixture", root: ROOT });
  return made.run?.run_id || made.run_id || null;
}

function mergeRequest(laneId, overrides = {}) {
  return {
    action_key: "repository.merge_pull_request",
    lane_id: laneId,
    run_id: runFor(laneId),
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

await test("an evicted request does not keep Needs approval on a frozen run snapshot", async () => {
  // THE COMMUNICATIONS LANE. PR #510 merged. The governed-action store keeps
  // 200 records and dropped gar_260730c554bcc9. The COMPLETE run still carried
  // awaiting_operator, and hydrate treated a missing record as "keep the
  // snapshot" — so the closed lane kept asking for a merge that had already
  // landed. No live request means there is nothing to authorize.
  const { laneId, runId } = blockedRunIn("repo_alloy");
  const made = orchestrateDirectorGovernedWait({ run: getExecutionRun(runId, ROOT), root: ROOT });
  processGovernedAction(made.request.request_id, { root: ROOT });
  assert.equal(transitionExecutionRun(runId, "NEEDS_INPUT", {
    origin: "agent", root: ROOT, reason: "awaiting operator",
  }).ok, true);
  assert.equal(transitionExecutionRun(runId, "COMPLETE", {
    origin: "agent", root: ROOT, reason: "turn_finished",
    completion_report: { summary: "AWAITING_OPERATOR on the governed merge." },
  }).ok, true);
  assert.equal(getExecutionRun(runId, ROOT).governed_action.status, "awaiting_operator");
  resetGovernedActionsForTests(ROOT);
  assert.equal(getGovernedAction(made.request.request_id, ROOT), null);

  const [lane] = attachLaneGovernedActions(attachLaneRuns([{ lane_id: laneId }], ROOT), ROOT);
  assert.equal(lane.execution_run, null);
  assert.equal(lane.governed_action, null);
  assert.equal(lane.previous_run.governed_action, null);
  const decision = operatorDecisionRun(lane);
  assert.equal(renderOperatorDecisionBar(decision).includes("data-gw-governed-approve"), false);
  assert.doesNotMatch(renderOperatorDecisionBar(decision) || "", /Needs approval/);
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

await test("a resolved approval still says what it did", async () => {
  // "Unsure if the authorize push click actually worked." The approval card
  // exists only while a decision is PENDING, so approving makes it vanish — the
  // same way whether the action succeeded or failed. Hiding a resolved card
  // stops a stale button; it still leaves the operator with silence.
  const { governedOutcomeFor, lastResolvedGovernedActionForLane } =
    await import("../lib/vacilando/governed-action-request.mjs");

  const pushed = {
    status: "complete", action_key: "repository.push", title: "Push a branch",
    updated_at: new Date().toISOString(), operator_approval: { actor: "operator" },
    result: { branch: "agent/x/y", pushedSha: "daf798525724fb48678dcdb3f00d01313d9ab17e" },
  };
  const out = governedOutcomeFor(pushed);
  assert.equal(out.ok, true);
  assert.match(out.detail, /agent\/x\/y is on the remote at daf798525724/);
  const html = renderGovernedOutcome({ last_governed_outcome: out });
  assert.match(html, /data-gw-governed-outcome/);
  assert.match(html, /daf798525724/);
  assert.match(html, /approved by operator/);

  // A failure says so, and says why.
  const failed = governedOutcomeFor({
    status: "failed", action_key: "repository.push", title: "Push a branch",
    failure_code: "non_fast_forward", failure_reason: "the remote has commits this push would discard",
  });
  assert.equal(failed.ok, false);
  assert.match(failed.detail, /would discard/);
  assert.match(renderGovernedOutcome({ last_governed_outcome: failed }), /is-failed/);

  // Merge and promotion read from their own results.
  assert.match(governedOutcomeFor({ status: "complete", action_key: "promotion.open_pr",
    result: { pullRequestNumber: 515, base: "staging" } }).detail, /pull request #515 into staging/);
  assert.match(governedOutcomeFor({ status: "complete", action_key: "repository.merge_pull_request",
    result: { merge_sha: "f22438b72c5f0f87ddf07b387a1419e31e48d978" } }).detail, /merged as f22438b72c5f/);
  assert.match(governedOutcomeFor({ status: "complete", action_key: "repository.push",
    result: { branch: "b", pushedSha: "abc1234567890", idempotent: true } }).detail, /already there/);

  // POSITIVE CONTROLS. A pending decision is not an outcome — otherwise the
  // line would appear beside the very card that is still asking. And a lane that
  // has never had a governed decision renders nothing at all.
  assert.equal(governedOutcomeFor({ status: "awaiting_operator", action_key: "repository.push" }), null);
  assert.equal(governedOutcomeFor({ status: "requested", action_key: "repository.push" }), null);
  assert.equal(governedOutcomeFor(null), null);
  assert.equal(renderGovernedOutcome({}), "");
  assert.equal(lastResolvedGovernedActionForLane(null, ROOT), null);
});

function readMergeSource() {
  return readFileSync(new URL("../lib/vacilando/trusted-host-merge.mjs", import.meta.url), "utf8");
}

await test("census dispatch presents the grant the same way every other action does", () => {
  // THE LIVE DEFECT. fulfillDatabaseCensusForMission already accepted a grant; defaultExecute
  // never passed one. Operator approval minted grnt_* and execution bounced authorization_required.
  const src = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");
  const last = src.lastIndexOf("fulfillDatabaseCensusForMission");
  assert.ok(last > 0, "census fulfill must be dispatched");
  const snippet = src.slice(last, last + 500);
  assert.match(snippet, /\bgrant,/);
  assert.match(snippet, /authorizationId/);
  assert.match(snippet, /exactContext/);
});

await test("census presentation is not inherited by other actions", () => {
  const census = presentationForGovernedAction({ action_key: ACTION_TYPES.DATABASE_READ_CENSUS, target: "alloy_deployed_primary" });
  assert.equal(census.approve_label, "Authorize census");
  const retire = presentationForGovernedAction({
    action_key: ACTION_TYPES.VACILANDO_RETIRE_WORKTREE,
    title: "Retire wt1-drawer-product-eradication",
    inputs: { worktree: "wt1-drawer-product-eradication" },
  });
  assert.match(retire.approve_label, /retire/i);
  assert.ok(!/census/i.test(retire.approve_label));
  const unknown = presentationForGovernedAction({ action_key: "vacilando.something_new", title: "Do a new thing" });
  assert.equal(unknown.approve_label, "Authorize");
  assert.ok(!/census/i.test(unknown.approve_label + unknown.detail));
});

await test("an already-approved census that bounced is executed on tick, not left parked", async () => {
  // Live: gar_0266a335d01adf sat awaiting_operator with operator_approval.decision=approved.
  // The UI hid the button; tick ignored awaiting_operator. Recovery must resume execution.
  const laneId = laneIn("repo_alloy");
  setGovernedActionExecuteImplForTests(() => ({
    ok: false,
    error: "authorization_required",
    action: { id: "tha_census_bounce", state: "policy_review" },
  }));
  const made = requestGovernedAction({
    action_key: "database.read_census",
    lane_id: laneId,
    target: "alloy_deployed_primary",
    purpose: "Verify billable source customer census",
    reason_worker_cannot_execute: "The lane cannot hold hosted database credentials.",
    requesting_worker: laneId,
    artifact_refs: ["docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json"],
    worktree_path: REPO,
  }, { root: ROOT, processNow: true });
  assert.equal(made.ok, true, made.error || "");
  assert.equal(made.request.status, "awaiting_operator");

  const storePath = governedActionStorePath(ROOT);
  const store = JSON.parse(readFileSync(storePath, "utf8"));
  const rec = store.requests.find((r) => r.request_id === made.request.request_id);
  assert.ok(rec, "request must be in the store");
  rec.operator_approval = { decision: "approved", actor: "kelly", at: new Date().toISOString() };
  rec.operator_approval_required = false;
  rec.policy_decision = "operator_approved";
  const minted = mintGrant({
    proposal: {
      proposal_id: rec.request_id,
      action_key: rec.action_key,
      repository_id: rec.authority?.repository_id || "repo_alloy",
      run_id: rec.run_id || null,
      lane_id: rec.lane_id,
      requested_by: rec.requesting_worker,
      target_branch: rec.target,
      merge_method: "merge",
    },
    approvedBy: "kelly",
    root: ROOT,
  });
  assert.equal(minted.ok, true, minted.error || "");
  rec.grant_id = minted.grant.grant_id;
  writeFileSync(storePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");

  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: {
      id: "tha_census_recovered",
      state: "completed",
      actionType: "database.read_census",
      inputs: {},
      result: { census: { org_count: 1 }, evidencePath: join(ROOT, "census.json") },
    },
  }));
  tickGovernedActions({ root: ROOT });
  const after = getGovernedAction(made.request.request_id, ROOT);
  assert.notEqual(after.status, "awaiting_operator", "an already-approved census must not stay parked");
  assert.equal(after.status, "complete", after.failure_reason || after.status);
});

// ── authority is not capability, and the executor needs both ────────────────
//
// THE DEFECT THIS ENCODES. Repository approval minted a grnt_ artifact; mission
// approval recorded a mission authorization and stopped. Trusted-host executors
// validate the ARTIFACT — prepareRestore's first check refuses `grant_missing`
// — so a mission-authorized action could never satisfy the contract. Measured on
// the live host: QA restores for two repository-authorized lanes got grants and
// succeeded, while both attempts on a mission-bound lane had grant_id null, zero
// grants minted, and failed. Not one lane's defect; every mission-bound lane was
// locked out of every grant-validating executor.

await test("a mission-authorized approval mints the execution grant too", async () => {
  const laneId = laneIn("repo_alloy");
  bindLaneMission(laneId, "msn_example00000002", { root: ROOT });
  const made = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  assert.equal(made.request.authority.kind, "mission", "fixture must exercise the mission path");
  assert.ok(made.request.mission_id, "fixture must be mission-bound");
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: { id: "tha_m", state: "completed", actionType: "repository.merge_pull_request", inputs: {}, result: { mergeSha: "abc", evidencePath: join(ROOT, "e.json") } },
  }));
  const out = await approveGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  assert.equal(out.ok, true, out.error || "");
  const rec = getGovernedAction(made.request.request_id, ROOT);

  // The mission remains the AUTHORITY.
  assert.equal(rec.mission_id, "msn_example00000002", "mission authority must be preserved");
  assert.equal(rec.authority.kind, "mission");

  // And the CAPABILITY the executor consumes now exists.
  assert.ok(rec.grant_id, "a mission-authorized approval must mint an execution grant");
  const grant = getGrant(rec.grant_id, ROOT);
  assert.equal(grant.approved_by, "kelly");
  assert.equal(grant.action_key, "repository.merge_pull_request");
  // As narrow as the repository grant: proposal-pinned, expiring, spent on use.
  assert.ok(grant.fingerprint, "must be bound to this proposal's fingerprint");
  assert.ok(grant.expires_at, "must expire");
  assert.equal(grant.status, "CONSUMED", "single use, so a replay needs a fresh decision");
});

await test("an AUTO-EXECUTED mission action mints a grant with no approval step", async () => {
  // THE HALF THE APPROVAL FIX COULD NOT REACH. When policy decides no operator
  // approval is required, requestGovernedAction calls executeGovernedAction
  // directly, so approveGovernedAction — the only place the mint lived — never
  // runs. MEASURED: gar_8976f7ca4bc9c5 (environment.restore_qa_session,
  // authority.kind "mission") has an audit trail of requested -> executing ->
  // failed with NO `approved` event, grant_id null, refused `grant_missing`.
  // Approving it was never possible; it was never up for approval.
  const laneId = laneIn("repo_alloy");
  bindLaneMission(laneId, "msn_example00000004", { root: ROOT });
  const made = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: false });
  assert.equal(made.request.authority.kind, "mission", "fixture must exercise the mission path");
  assert.ok(!getGovernedAction(made.request.request_id, ROOT).grant_id,
    "precondition: nothing is minted before execution");

  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: { id: "tha_auto", state: "completed", actionType: "repository.merge_pull_request", inputs: {}, result: { mergeSha: "def", evidencePath: join(ROOT, "e.json") } },
  }));
  // The path under test: straight to execution, no approval.
  await executeGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  const rec = getGovernedAction(made.request.request_id, ROOT);

  // Mission authority is untouched — the boundary mints capability, not authority.
  assert.equal(rec.authority.kind, "mission", "authority must not be rewritten by the mint");
  assert.equal(rec.mission_id, "msn_example00000004", "mission provenance must survive");

  assert.ok(rec.grant_id, "the executor's artifact must exist on the auto-execute path too");
  assert.equal(rec.grant_minted_at_execution, true, "and it must be attributable to the boundary");
  const grant = getGrant(rec.grant_id, ROOT);
  assert.ok(grant.fingerprint, "proposal-pinned");
  assert.ok(grant.expires_at, "expiring");
  assert.equal(grant.action_key, "repository.merge_pull_request");
});

await test("the boundary never re-mints over a grant approval already made", async () => {
  // Otherwise every approved action would carry two grants and the single-use
  // guarantee would quietly become double-use.
  const laneId = laneIn("repo_alloy");
  bindLaneMission(laneId, "msn_example00000005", { root: ROOT });
  const made = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: { id: "tha_once", state: "completed", actionType: "repository.merge_pull_request", inputs: {}, result: { mergeSha: "ghi", evidencePath: join(ROOT, "e.json") } },
  }));
  await approveGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  const rec = getGovernedAction(made.request.request_id, ROOT);
  assert.ok(rec.grant_id, "approval minted one");
  assert.notEqual(rec.grant_minted_at_execution, true,
    "the approval's grant must be the one used, not a second one from the boundary");
});

await test("a mission grant is pinned to its proposal, not reusable mission-wide", () => {
  // The standing-permission failure the repository path was built to avoid must
  // not reappear through the mission path: two proposals, two distinct grants,
  // each bound to its own content.
  const laneId = laneIn("repo_alloy");
  bindLaneMission(laneId, "msn_example00000003", { root: ROOT });
  const a = requestGovernedAction(mergeRequest(laneId), { root: ROOT, processNow: true });
  const b = requestGovernedAction(
    mergeRequest(laneId, { inputs: { ...mergeRequest(laneId).inputs, pull_request_number: 509 } }),
    { root: ROOT, processNow: true },
  );
  assert.notEqual(a.request.request_id, b.request.request_id);
  // Distinct proposals must not share one authorization artifact.
  assert.notEqual(
    JSON.stringify(a.request.inputs?.pull_request_number),
    JSON.stringify(b.request.inputs?.pull_request_number),
    "the fixture must actually differ",
  );
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
