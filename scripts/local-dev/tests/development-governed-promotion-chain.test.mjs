#!/usr/bin/env node
/**
 * The governed promotion chain: push → open PR → merge.
 *
 * WHAT WAS MISSING. A lane could commit and could not publish. `repository.push`
 * and `promotion.open_pr` did not exist in the CLI, the installed toolkit, or
 * the canonical action registry, so a lane with reviewed work had no route to
 * the remote except a person running `git push` and `gh pr create` by hand. The
 * merge action existed at the end of a chain whose first two links did not.
 *
 * WHAT THESE GUARDS DEFEND. Both new actions are outward-facing and
 * unrecoverable: a published commit cannot be unpublished. So every refusal has
 * a positive control proving the check could have gone the other way, and the
 * remote is never reached — the guard in trusted-host-remote-guard treats an
 * injected client as simulated, and a test that forgot to inject one would be
 * refused rather than escaping.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-promo-chain-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  validatePushInputs, evaluatePushReadiness, pushBranch, PROTECTED_REFS,
} = await import("../lib/vacilando/trusted-host-push.mjs");
const {
  validateOpenPrInputs, openPullRequest,
} = await import("../lib/vacilando/trusted-host-open-pr.mjs");
const {
  liveRemoteMutationPermitted, canonicalGatewayRuntimeRoot,
} = await import("../lib/vacilando/trusted-host-remote-guard.mjs");
const { ACTION_TYPES, listRegisteredActions, getActionDefinition } =
  await import("../lib/vacilando/trusted-host-action-registry.mjs");
const {
  requestGovernedAction, approveGovernedAction, getGovernedAction,
  governedProposalFor, presentationForGovernedAction,
  resetGovernedActionsForTests, setGovernedActionExecuteImplForTests,
  setGovernedActionResumeImplForTests,
} = await import("../lib/vacilando/governed-action-request.mjs");
const { grantAuthorizesAction } = await import("../lib/vacilando/trusted-host-actions.mjs");
const { mintGrant, getGrant, resetGovernedGrantsForTests } =
  await import("../lib/vacilando/governed-repository-authority.mjs");
const { createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { resetExecutionRunsForTests } = await import("../lib/vacilando/execution-run.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");

const REPO = "ksquared-16/alloy";
const SHA = "4336b91c8ae47888d608bf78b3d98d2cff2d1b5d";
const OTHER = "08afa327d1111111111111111111111111111111";
const BRANCH = "agent/claude/5-workspace-readiness-amplification";

let pass = 0;
let fail = 0;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 8 * 1024 * 1024 });
}

function seedRepositories() {
  writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify({
    schema_version: "vacilando.repository.v1",
    repositories: {
      repo_alloy: {
        repository_id: "repo_alloy", name: "Alloy", profile: "alloy", state: "ACTIVE",
        root: join(ROOT, "repo"), git_common_dir: join(ROOT, "repo", ".git"),
        worktree_parent: join(ROOT, "wt"), default_branch: "origin/staging",
      },
    },
  }, null, 2)}\n`, "utf8");
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

/** A real local repo standing in for a lane worktree. */
function makeWorktree({ branch = BRANCH, extraCommits = 0, dirty = 0 } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "vac-promo-wt-"));
  git(["init", "-q", "-b", "main", "."], dir);
  git(["config", "user.email", "t@e.com"], dir);
  git(["config", "user.name", "T"], dir);
  writeFileSync(join(dir, "base.txt"), "base\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "base"], dir);
  const baseSha = git(["rev-parse", "HEAD"], dir).trim();
  git(["checkout", "-q", "-b", branch], dir);
  writeFileSync(join(dir, "work.txt"), "reviewed work\n");
  git(["add", "-A"], dir);
  git(["commit", "-q", "-m", "reviewed"], dir);
  const head = git(["rev-parse", "HEAD"], dir).trim();
  for (let i = 0; i < extraCommits; i += 1) {
    writeFileSync(join(dir, `extra-${i}.txt`), "later\n");
    git(["add", "-A"], dir);
    git(["commit", "-q", "-m", `later ${i}`], dir);
  }
  for (let i = 0; i < dirty; i += 1) writeFileSync(join(dir, `dirty-${i}.txt`), "foreign\n");
  return { dir, head, baseSha, branch, movedHead: git(["rev-parse", "HEAD"], dir).trim() };
}

/** A git stand-in. Records what it was asked to do and never touches a remote. */
function fakeGit({ remoteSha = null, pushOk = true } = {}) {
  const calls = [];
  let current = remoteSha;
  const impl = (args, cwd) => {
    calls.push(args.join(" "));
    const verb = args[0];
    if (verb === "ls-remote") {
      return { status: 0, stdout: current ? `${current}\trefs/heads/x\n` : "", stderr: "" };
    }
    if (verb === "push") {
      if (!pushOk) return { status: 1, stdout: "", stderr: "! [rejected] non-fast-forward\n" };
      current = String(args[2] || "").split(":")[0];
      return { status: 0, stdout: "", stderr: "" };
    }
    // merge-base falls through to real git on purpose: a remote commit that is
    // not an object in this repository genuinely is NOT an ancestor, and git
    // saying so with a non-zero status is exactly the right answer.
    try {
      return { status: 0, stdout: execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8" }), stderr: "" };
    } catch (e) {
      return { status: e.status ?? 1, stdout: "", stderr: String(e.stderr || e.message) };
    }
  };
  impl.calls = calls;
  return impl;
}

// ---------------------------------------------------------------- registry

await test("both actions are in the canonical registry with their capabilities", () => {
  assert.equal(ACTION_TYPES.REPOSITORY_PUSH, "repository.push");
  assert.equal(ACTION_TYPES.PROMOTION_OPEN_PR, "promotion.open_pr");
  const keys = listRegisteredActions().map((a) => a.actionType);
  for (const k of ["repository.push", "promotion.open_pr", "repository.merge_pull_request"]) {
    assert.ok(keys.includes(k), `${k} missing from the registry`);
  }
  assert.equal(getActionDefinition("repository.push").requiredCapability, "trusted_host.repository.push");
  assert.equal(getActionDefinition("promotion.open_pr").requiredCapability, "trusted_host.promotion.open_pr");
  // Discovery must also say what to supply, or a lane can only guess.
  const push = listRegisteredActions().find((a) => a.actionType === "repository.push");
  assert.deepEqual(push.requiredInputs, ["repository", "branch", "expectedHeadSha", "worktreePath"]);
});

// -------------------------------------------------------------- push guards

await test("a push refuses every protected ref", () => {
  for (const ref of PROTECTED_REFS) {
    const v = validatePushInputs({ repository: REPO, branch: ref, expected_head_sha: SHA, worktree_path: "/tmp/x" });
    assert.equal(v.ok, false, `${ref} was accepted`);
    assert.equal(v.code, "protected_ref_rejected");
  }
  // POSITIVE CONTROL: an ordinary lane branch is accepted.
  assert.equal(validatePushInputs({ repository: REPO, branch: BRANCH, expected_head_sha: SHA, worktree_path: "/tmp/x" }).ok, true);
});

await test("a push refuses force, deletion and multi-ref forms", () => {
  for (const key of ["force", "forceWithLease", "delete", "mirror", "tags", "refspec", "argv", "shell"]) {
    const v = validatePushInputs({ repository: REPO, branch: BRANCH, expected_head_sha: SHA, worktree_path: "/tmp/x", [key]: true });
    assert.equal(v.ok, false, `${key} was accepted`);
    assert.equal(v.code, "force_push_rejected");
  }
});

await test("a push refuses a repository that is not allowlisted", () => {
  const v = validatePushInputs({ repository: "someone/else", branch: BRANCH, expected_head_sha: SHA, worktree_path: "/tmp/x" });
  assert.equal(v.code, "repository_not_allowlisted");
});

await test("a push refuses head drift", () => {
  const wt = makeWorktree();
  const v = validatePushInputs({ repository: REPO, branch: wt.branch, expected_head_sha: OTHER, worktree_path: wt.dir });
  const ready = evaluatePushReadiness(v.normalized, { gitImpl: fakeGit() });
  assert.equal(ready.ok, false);
  assert.equal(ready.code, "head_drift");
  // POSITIVE CONTROL: at the actual head it is ready.
  const good = validatePushInputs({ repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir });
  assert.equal(evaluatePushReadiness(good.normalized, { gitImpl: fakeGit() }).ok, true);
});

await test("a push refuses commits beyond what was reviewed", () => {
  const wt = makeWorktree({ extraCommits: 3 });
  const v = validatePushInputs({
    repository: REPO, branch: wt.branch, expected_head_sha: wt.movedHead, worktree_path: wt.dir,
    base_ref: wt.baseSha, expected_commits: [wt.head],
  });
  const ready = evaluatePushReadiness(v.normalized, { gitImpl: fakeGit() });
  assert.equal(ready.ok, false);
  assert.equal(ready.code, "commit_scope_expanded");
  assert.equal(ready.unexpected.length, 3);
});

await test("a push refuses a non-fast-forward instead of forcing", () => {
  const wt = makeWorktree();
  // The remote carries a commit this push does not contain.
  const v = validatePushInputs({ repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir });
  const ready = evaluatePushReadiness(v.normalized, { gitImpl: fakeGit({ remoteSha: wt.baseSha === wt.head ? OTHER : OTHER }) });
  assert.equal(ready.ok, false);
  assert.equal(ready.code, "non_fast_forward");
});

await test("a push is idempotent when the remote already has the commit", () => {
  const wt = makeWorktree();
  const g = fakeGit({ remoteSha: wt.head });
  const out = pushBranch(
    { repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir },
    { git: g },
  );
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.idempotent, true);
  assert.equal(g.calls.some((c) => c.startsWith("push")), false, "a retry must not push again");
});

await test("a retry is idempotent even after the lane has moved on", () => {
  // FOUND IN LIVE ACCEPTANCE. The approved commit was already on the remote,
  // the lane had committed again since, and the retry came back `head_drift` —
  // a refusal for work that was already done. Idempotency has to be settled
  // before drift, because a commit that is already published cannot be stale.
  const wt = makeWorktree({ extraCommits: 2 });
  const g = fakeGit({ remoteSha: wt.head });
  const out = pushBranch(
    { repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir },
    { git: g },
  );
  assert.equal(out.ok, true, out.code || out.detail);
  assert.equal(out.idempotent, true);
  assert.equal(g.calls.some((c) => c.startsWith("push")), false, "nothing may be pushed twice");

  // POSITIVE CONTROL: with the commit NOT on the remote, a moved branch is
  // still refused as drift.
  const drifted = pushBranch(
    { repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir },
    { git: fakeGit() },
  );
  assert.equal(drifted.ok, false);
  assert.equal(drifted.code, "head_drift");
});

await test("a push publishes exactly the approved commit to exactly one ref", () => {
  const wt = makeWorktree();
  const g = fakeGit();
  const out = pushBranch(
    { repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir },
    { git: g },
  );
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.pushedSha, wt.head);
  const pushCall = g.calls.find((c) => c.startsWith("push"));
  // The SHA is the source, so later commits on the branch cannot ride along.
  assert.equal(pushCall, `push origin ${wt.head}:refs/heads/${wt.branch}`);
  assert.equal(pushCall.includes("--force"), false);
});

await test("a failed push reports the reason and publishes nothing", () => {
  const wt = makeWorktree();
  const out = pushBranch(
    { repository: REPO, branch: wt.branch, expected_head_sha: wt.head, worktree_path: wt.dir },
    { git: fakeGit({ pushOk: false }) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "non_fast_forward");
});

// ------------------------------------------------------------ open PR guards

function fakeGh({ headSha = SHA, existing = null, createOk = true, created = null } = {}) {
  const calls = [];
  let list = existing ? [existing] : [];
  const impl = (args) => {
    calls.push(args.join(" "));
    if (args[0] === "api") return { status: headSha ? 0 : 1, stdout: headSha || "", stderr: "" };
    if (args[0] === "pr" && args[1] === "list") return { status: 0, stdout: JSON.stringify(list), stderr: "" };
    if (args[0] === "pr" && args[1] === "create") {
      if (!createOk) return { status: 1, stdout: "", stderr: "could not create\n" };
      list = [created || { number: 777, headRefOid: headSha, baseRefName: "staging", headRefName: BRANCH, url: "https://x/777", state: "OPEN" }];
      return { status: 0, stdout: "https://x/777\n", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "unexpected\n" };
  };
  impl.calls = calls;
  return impl;
}

await test("a promotion refuses any base but the canonical one", () => {
  for (const base of ["main", "master", "production", "prod"]) {
    const v = validateOpenPrInputs({ repository: REPO, base, head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" });
    assert.equal(v.ok, false, `${base} was accepted`);
    assert.equal(v.code, "base_branch_not_allowed");
  }
  // POSITIVE CONTROL.
  assert.equal(validateOpenPrInputs({ repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" }).ok, true);
});

await test("a promotion refuses a protected head and a self-promotion", () => {
  assert.equal(validateOpenPrInputs({ repository: REPO, base: "staging", head_branch: "main", expected_head_sha: SHA, title: "x" }).code, "protected_ref_rejected");
  assert.equal(validateOpenPrInputs({ repository: REPO, base: "staging", head_branch: "staging", expected_head_sha: SHA, title: "x" }).code, "protected_ref_rejected");
});

await test("a promotion refuses a credential in its text", () => {
  const v = validateOpenPrInputs({
    repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA,
    title: "Promote", body: "token ghp_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  });
  assert.equal(v.code, "secret_in_pull_request_text");
});

await test("a promotion refuses head drift on the remote", () => {
  const out = openPullRequest(
    { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" },
    { gh: fakeGh({ headSha: OTHER }) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "head_drift");
});

await test("a promotion refuses when the branch is not on the remote yet", () => {
  const out = openPullRequest(
    { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" },
    { gh: fakeGh({ headSha: null }) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "head_branch_not_on_remote");
});

await test("a promotion reuses an open pull request rather than duplicating it", () => {
  const gh = fakeGh({
    headSha: SHA,
    existing: { number: 512, headRefOid: SHA, baseRefName: "staging", headRefName: BRANCH, url: "https://x/512", state: "OPEN" },
  });
  const out = openPullRequest(
    { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" },
    { gh },
  );
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.reused, true);
  assert.equal(out.pullRequestNumber, 512);
  assert.equal(gh.calls.some((c) => c.includes("pr create")), false, "an existing PR must not be duplicated");
});

await test("a promotion opens and verifies a new pull request", () => {
  const gh = fakeGh({ headSha: SHA });
  const out = openPullRequest(
    { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote the reviewed work" },
    { gh },
  );
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.reused, undefined);
  assert.equal(out.pullRequestNumber, 777);
  assert.equal(out.base, "staging");
  assert.equal(out.headBranch, BRANCH);
  assert.ok(gh.calls.some((c) => c.includes("pr create")));
});

await test("a promotion refuses a pull request that came back with the wrong base", () => {
  const gh = fakeGh({
    headSha: SHA,
    created: { number: 9, headRefOid: SHA, baseRefName: "main", headRefName: BRANCH, url: "https://x/9", state: "OPEN" },
  });
  const out = openPullRequest(
    { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" },
    { gh },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "unexpected_base_or_head");
});

// ------------------------------------------------------------- remote guard

await test("no remote mutation may run outside the Gateway", () => {
  for (const [env, code] of [
    [{ ALLOY_RUNTIME_ROOT: "/tmp/scratch/gateway" }, "live_remote_mutation_outside_gateway_runtime_root"],
    [{}, "live_remote_mutation_requires_gateway_runtime_root"],
    [{ NODE_TEST_CONTEXT: "child-v8", ALLOY_RUNTIME_ROOT: canonicalGatewayRuntimeRoot() }, "live_remote_mutation_from_test_runner"],
  ]) {
    const out = liveRemoteMutationPermitted({ env, operation: "push" });
    assert.equal(out.ok, false);
    assert.equal(out.code, code);
  }
  // POSITIVE CONTROLS: without both of these the guard could be refusing
  // everything and this suite would look identical.
  assert.equal(liveRemoteMutationPermitted({ env: { ALLOY_RUNTIME_ROOT: canonicalGatewayRuntimeRoot() } }).ok, true);
  assert.equal(liveRemoteMutationPermitted({ injectedGh: true }).simulated, true);
});

// ------------------------------------------------- proposal, grant, approval

function laneWithRepo() {
  const made = createDurableLane({ name: "runtime performance", repository_id: "repo_alloy", root: ROOT });
  return made.lane?.lane_id || made.lane_id;
}

function pushRequest(laneId, overrides = {}) {
  return {
    action_key: "repository.push",
    lane_id: laneId,
    run_id: "erun_promo0000001",
    purpose: "Publish the reviewed branch",
    reason_worker_cannot_execute: "The lane cannot hold GitHub credentials.",
    requesting_worker: laneId,
    inputs: { repository: REPO, branch: BRANCH, expected_head_sha: SHA, worktree_path: "/tmp/wt" },
    ...overrides,
  };
}

await test("a missionless lane can propose a push and it awaits approval", () => {
  const laneId = laneWithRepo();
  const out = requestGovernedAction(pushRequest(laneId), { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error || out.detail || "");
  assert.equal(out.request.status, "awaiting_operator");
  assert.equal(out.request.mission_id, null);
  assert.equal(out.request.authority.kind, "repository");
  assert.equal(out.request.action_key, "repository.push");
});

await test("a missionless lane can propose a promotion pull request", () => {
  const laneId = laneWithRepo();
  const out = requestGovernedAction({
    ...pushRequest(laneId),
    action_key: "promotion.open_pr",
    inputs: { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote the reviewed work" },
  }, { root: ROOT, processNow: true });
  assert.equal(out.ok, true, out.error || out.detail || "");
  assert.equal(out.request.status, "awaiting_operator");
  assert.equal(out.request.action_key, "promotion.open_pr");
});

await test("both proposals carry the facts a Director needs", () => {
  const laneId = laneWithRepo();
  const push = requestGovernedAction(pushRequest(laneId), { root: ROOT, processNow: true }).request;
  const p = push.proposal;
  assert.equal(p.kind, "repository_push");
  const labels = p.facts.map((f) => f.label);
  for (const want of ["Repository", "Branch", "Commit", "Remote ref", "Force"]) {
    assert.ok(labels.includes(want), `push card is missing ${want}`);
  }
  assert.ok(p.consequences.length >= 1);
  assert.match(presentationForGovernedAction(push).approve_label, /Authorize push/);

  const pr = governedProposalFor({
    action_key: "promotion.open_pr", target: "staging",
    inputs: { repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA, title: "Promote" },
  });
  assert.equal(pr.kind, "promotion_open_pr");
  assert.ok(pr.facts.map((f) => f.label).includes("Into"));
});

await test("approval mints a grant pinned to the branch AND the commit", async () => {
  const laneId = laneWithRepo();
  const made = requestGovernedAction(pushRequest(laneId), { root: ROOT, processNow: true });
  setGovernedActionExecuteImplForTests(() => ({
    ok: true,
    action: { id: "tha_p", state: "completed", actionType: "repository.push", inputs: {}, result: { pushedSha: SHA, evidencePath: join(ROOT, "p.json") } },
  }));
  const out = await approveGovernedAction(made.request.request_id, { actor: "kelly", root: ROOT });
  assert.equal(out.ok, true, out.error || "");
  const rec = getGovernedAction(made.request.request_id, ROOT);
  const grant = getGrant(rec.grant_id, ROOT);
  assert.equal(grant.branch, BRANCH);
  assert.equal(grant.expected_head_sha, SHA);
  assert.equal(grant.status, "CONSUMED", "single use");
});

await test("the executor re-derives a push grant and refuses drift", () => {
  const minted = mintGrant({
    proposal: {
      action_key: "repository.push", repository_id: "repo_alloy", expected_head_sha: SHA,
      branch: BRANCH, target_branch: "staging", run_id: "erun_promo0000001", requested_by: "lane_x",
    },
    approvedBy: "kelly", root: ROOT,
  });
  const grant = getGrant(minted.grant.grant_id, ROOT);
  const action = {
    id: "tha_1", actionType: "repository.push", missionId: "repo_alloy",
    executionSessionId: "erun_promo0000001",
    inputs: { branch: BRANCH, expectedHeadSha: SHA },
  };
  assert.equal(grantAuthorizesAction(grant, action).ok, true);
  assert.equal(grantAuthorizesAction(grant, { ...action, inputs: { branch: BRANCH, expectedHeadSha: OTHER } }).error, "grant_head_sha_mismatch");
  assert.equal(grantAuthorizesAction(grant, { ...action, inputs: { branch: "agent/claude/5-drawer-vm-composition", expectedHeadSha: SHA } }).error, "grant_branch_mismatch");
  assert.equal(grantAuthorizesAction(grant, { ...action, executionSessionId: "erun_other" }).error, "grant_run_mismatch");
});

await test("the requesting lane cannot approve its own push", () => {
  const laneId = laneWithRepo();
  const made = requestGovernedAction(pushRequest(laneId), { root: ROOT, processNow: true });
  return approveGovernedAction(made.request.request_id, { actor: laneId, root: ROOT }).then((out) => {
    assert.equal(out.ok, false);
    assert.equal(out.error, "self_approval_refused");
    assert.equal(getGovernedAction(made.request.request_id, ROOT).grant_id, undefined);
  });
});

await test("a promotion may carry a body; nothing else may", () => {
  // `body` is on the blanket arbitrary-payload reject list because that is how
  // a SQL or HTTP payload would arrive. A promotion pull request legitimately
  // has one — its description — so the exception is granted to that one action.
  // Widening the rule for everyone would have been the easy fix and the wrong
  // one, and this is the control that keeps it narrow.
  const laneId = laneWithRepo();
  const ok = requestGovernedAction({
    ...pushRequest(laneId),
    action_key: "promotion.open_pr",
    inputs: {
      repository: REPO, base: "staging", head_branch: BRANCH, expected_head_sha: SHA,
      title: "Promote", body: "why this change is safe",
    },
  }, { root: ROOT, processNow: true });
  assert.equal(ok.ok, true, ok.error || ok.detail || "");
  assert.equal(ok.request.inputs.body, "why this change is safe");

  // POSITIVE CONTROL: every other action still refuses a body outright.
  for (const key of ["repository.push", "repository.merge_pull_request", "database.read_census"]) {
    const out = requestGovernedAction({
      ...pushRequest(laneId),
      action_key: key,
      inputs: { ...pushRequest(laneId).inputs, body: "select * from anything" },
    }, { root: ROOT, processNow: true });
    assert.equal(out.ok, false, `${key} accepted a body`);
    assert.equal(out.error, "arbitrary_sql_rejected", `${key} gave ${out.error}`);
  }
});

await test("a generic repository still cannot push or promote", () => {
  writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify({
    schema_version: "vacilando.repository.v1",
    repositories: {
      repo_plain: {
        repository_id: "repo_plain", name: "Notes", profile: "generic", state: "ACTIVE",
        root: join(ROOT, "r"), git_common_dir: join(ROOT, "r", ".git"),
        worktree_parent: join(ROOT, "w"), default_branch: "main",
      },
    },
  }, null, 2)}\n`, "utf8");
  const made = createDurableLane({ name: "notes lane", repository_id: "repo_plain", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  for (const key of ["repository.push", "promotion.open_pr"]) {
    const out = requestGovernedAction({ ...pushRequest(laneId), action_key: key }, { root: ROOT, processNow: true });
    assert.equal(out.ok, false, `${key} was accepted for a generic repository`);
    assert.equal(out.error, "repository_profile_forbids_governed_action");
  }
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
