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
  governedActionSubjectKey, decisionSubjectKey, reconcileGovernedApprovals,
} = await import("../lib/vacilando/governed-action-request.mjs");
const { grantAuthorizesAction } = await import("../lib/vacilando/trusted-host-actions.mjs");
const { mintGrant, getGrant, resetGovernedGrantsForTests } =
  await import("../lib/vacilando/governed-repository-authority.mjs");
const { createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { createQueuedRun, resetExecutionRunsForTests } = await import("../lib/vacilando/execution-run.mjs");
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

await test("a merge accepts every spelling of the pull request number", async () => {
  // A lane proposed {"pull_request": 522} — an unambiguous pull request number
  // by any reading — and got back "pull_request_number must be a positive
  // integer", which describes a malformed VALUE rather than a field name that
  // was not recognised. The promotion stalled on a near-miss.
  const { validateMergeInputs } = await import("../lib/vacilando/trusted-host-merge.mjs");
  const base = {
    repository: REPO, target_branch: "staging",
    expected_head_sha: SHA, merge_method: "merge",
  };
  for (const key of ["pull_request_number", "pullRequestNumber", "pull_request", "pullRequest", "pr"]) {
    const v = validateMergeInputs({ ...base, [key]: 522 });
    assert.equal(v.ok, true, `${key} was refused`);
    assert.equal(v.normalized.pullRequestNumber, 522);
  }

  // POSITIVE CONTROLS. Only the NAMING widened; the number is validated exactly
  // as before, and the refusal now says what actually arrived.
  for (const bad of [0, -1, 1.5, "abc", null, ""]) {
    const v = validateMergeInputs({ ...base, pull_request: bad });
    assert.equal(v.ok, false, `${JSON.stringify(bad)} was accepted`);
    assert.equal(v.code, "invalid_pull_request_number");
  }
  assert.match(validateMergeInputs({ ...base, pull_request: 0 }).detail, /received 0/);
  assert.match(validateMergeInputs(base).detail, /a pull request number is required/);
});

await test("a result envelope is selected by action type, never by default", async () => {
  // THE DEFECT. continuationTextForGovernedAction read `action.result.census`
  // whatever the action was, so a completed repository.push reported itself back
  // to the lane as { census_run_at: null, org_count: null, question_ids: null }
  // under the instruction "Do not retry the census from this lane" — every field
  // the lane needed absent, every field present meaningless.
  const { governedResultEnvelope, continuationTextForGovernedAction } =
    await import("../lib/vacilando/governed-action-request.mjs");

  const push = governedResultEnvelope("repository.push", {
    repository: REPO, branch: BRANCH, pushedSha: SHA,
    remoteRef: `refs/heads/${BRANCH}`, idempotent: false,
  });
  assert.equal(push.ok, true);
  assert.equal(push.summary.pushed_sha, SHA);
  assert.equal(push.summary.remote_ref, `refs/heads/${BRANCH}`);
  assert.equal(push.summary.state, "pushed");
  assert.equal(governedResultEnvelope("repository.push", {
    branch: BRANCH, pushedSha: SHA, remoteRef: "r", idempotent: true,
  }).summary.state, "already_present");

  // Each type reads its OWN shape.
  assert.equal(governedResultEnvelope("promotion.open_pr", { pullRequestNumber: 522, reused: true }).summary.state, "already_open");
  assert.equal(governedResultEnvelope("repository.merge_pull_request", { merge_sha: "abc123def456" }).summary.merge_sha, "abc123def456");
  assert.equal(governedResultEnvelope("database.read_census", { census: { org_count: 3 } }).summary.org_count, 3);

  // THE POSITIVE CONTROL. A mismatched envelope must FAIL, not render nulls.
  // Rendering nulls is what turned a wiring fault into something that merely
  // looked like nothing happened, and is why the defect survived a real push.
  for (const [key, bad] of [
    ["repository.push", { census: { org_count: null } }],
    ["repository.push", {}],
    ["promotion.open_pr", { pushedSha: SHA }],
    ["repository.merge_pull_request", { census: {} }],
    ["database.read_census", { pushedSha: SHA }],
  ]) {
    const out = governedResultEnvelope(key, bad);
    assert.equal(out.ok, false, `${key} accepted a mismatched envelope`);
    assert.equal(out.error, "result_envelope_mismatch");
    assert.equal(out.expected, key);
  }

  // And the text a push sends back to the lane carries no census vocabulary.
  const text = continuationTextForGovernedAction(
    { request_id: "gar_x", action_key: "repository.push", target: "staging", lane_id: "lane_y", run_id: "erun_z" },
    { id: "tha_1", result: { repository: REPO, branch: BRANCH, pushedSha: SHA, remoteRef: `refs/heads/${BRANCH}` } },
  );
  assert.doesNotMatch(text, /census|org_count|question_ids/i);
  assert.match(text, /Do not push from this lane/);
  assert.match(text, new RegExp(SHA));

  // A mismatch is reported to the lane as a mismatch, not as an empty summary.
  const broken = continuationTextForGovernedAction(
    { request_id: "gar_x", action_key: "repository.push", target: "staging" },
    { id: "tha_1", result: { census: {} } },
  );
  assert.match(broken, /RESULT ENVELOPE MISMATCH/);
  assert.match(broken, /result_envelope_mismatch/);
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

/**
 * A REAL run, not a made-up id.
 *
 * This fixture used to name `erun_promo0000001` and never create it, so these
 * cases were exercising the split-brain hole rather than the scenario they
 * describe: governed work was authorized against a run the canonical owner had
 * never heard of. Governed requests now VERIFY the run they name, so the
 * fixture has to supply one that exists — which is also the situation a
 * missionless lane is actually in.
 */
function runFor(laneId) {
  const made = createQueuedRun({ laneId, instruction: "promotion chain fixture", root: ROOT });
  return made.run?.run_id || made.run_id || null;
}

function pushRequest(laneId, overrides = {}) {
  return {
    action_key: "repository.push",
    lane_id: laneId,
    run_id: runFor(laneId),
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

// ── Decision collision: one decision must never speak for two subjects ───────
//
// THE FAILURE THIS ENCODES. Two governed merge requests in one mission —
// gar_34d898a2376afe (PR #529) and gar_17ebfc5fbac24e (PR #531) — both bound to
// decision dec_be6a37cc7bda45, titled "Merge PR #529". #529 was already merged,
// so the Director was shown an approval for finished work, approving it could
// not produce the #531 merge, and the stale request squatted on the shared
// decision. Three approvals failed to land.

await test("a decision's subject is the PR at its head SHA, read from prose or marker", () => {
  const req = (n, sha) => ({
    action_key: "repository.merge_pull_request",
    inputs: { pullRequestNumber: n, expectedHeadSha: sha, repository: REPO },
  });
  assert.equal(governedActionSubjectKey(req(529, "6b3a907f8a76acb75b8ba7783686fabc16e7e35f")),
    "merge:#529@6b3a907f8a76acb75b8ba7783686fabc16e7e35f");
  // Same PR, different head, is a different subject — as the single-use grant
  // already treats it.
  assert.notEqual(
    governedActionSubjectKey(req(531, SHA)),
    governedActionSubjectKey(req(531, OTHER)),
  );
  // A decision written before the structured marker existed still reads.
  assert.equal(
    decisionSubjectKey({ situation: "Merge PR #529 into staging\n\nPR: #529\nExpected SHA: 6b3a907f8a76acb75b8ba7783686fabc16e7e35f\n" }),
    "merge:#529@6b3a907f8a76acb75b8ba7783686fabc16e7e35f",
  );
  // The marker wins when present.
  assert.equal(
    decisionSubjectKey({ evidence: [{ governed_action_subject: "merge:#900@abc" }], situation: "PR: #529\n" }),
    "merge:#900@abc",
  );
  // Unknown is not equal to unknown: a subject-less decision matches nothing.
  assert.equal(decisionSubjectKey({ situation: "no subject here" }), null);
  assert.equal(governedActionSubjectKey({ action_key: "repository.merge_pull_request", inputs: {} }), null);
});

await test("a second merge request does not adopt the first PR's open decision", async () => {
  const made = createDurableLane({ name: "communications", repository_id: "repo_alloy", root: ROOT });
  const lane = made.lane;
  const mission = "msn_collision";
  const mk = async (n, sha) => {
    const out = await requestGovernedAction({
      actionKey: "repository.merge_pull_request",
      laneId: lane.lane_id,
      missionId: mission,
      title: `Merge PR #${n}`,
      purpose: "promote",
      reasonWorkerCannotExecute: "merge is Director-owned",
      inputs: {
        repository: REPO, pullRequestNumber: n, targetBranch: "staging",
        expectedHeadSha: sha, mergeMethod: "merge",
      },
      root: ROOT,
    });
    return out;
  };
  const a = await mk(529, "6b3a907f8a76acb75b8ba7783686fabc16e7e35f");
  const b = await mk(531, SHA);
  const recA = getGovernedAction(a.request?.request_id || a.request_id, ROOT);
  const recB = getGovernedAction(b.request?.request_id || b.request_id, ROOT);
  assert.ok(recA?.decision_id, "first request opened a decision");
  assert.ok(recB?.decision_id, "second request opened a decision");
  // THE REGRESSION: these were the same id.
  assert.notEqual(recA.decision_id, recB.decision_id);
  assert.equal(governedActionSubjectKey(recA) === governedActionSubjectKey(recB), false);
});

await test("an already-merged request is reconciled as satisfied, never denied", async () => {
  const made = createDurableLane({ name: "communications", repository_id: "repo_alloy", root: ROOT });
  const lane = made.lane;
  const out = await requestGovernedAction({
    actionKey: "repository.merge_pull_request",
    laneId: lane.lane_id,
    missionId: "msn_reconcile",
    title: "Merge PR #529",
    purpose: "promote",
    reasonWorkerCannotExecute: "merge is Director-owned",
    inputs: {
      repository: REPO, pullRequestNumber: 529, targetBranch: "staging",
      expectedHeadSha: SHA, mergeMethod: "merge",
    },
    root: ROOT,
  });
  const id = out.request?.request_id || out.request_id;
  assert.equal(getGovernedAction(id, ROOT).status, "awaiting_operator");

  const res = await reconcileGovernedApprovals({
    root: ROOT,
    // The remote is never reached: readiness is injected, exactly as the merge
    // guards require.
    inspect: () => ({ ok: true, idempotent: true, code: "already_merged", mergeSha: OTHER, stagingSha: OTHER }),
  });
  assert.equal(res.satisfied.length, 1);
  const rec = getGovernedAction(id, ROOT);
  assert.equal(rec.status, "complete");
  // Satisfied, not refused — recording a landed merge as denied would be false.
  assert.equal(rec.policy_decision, "already_satisfied");
  assert.equal(rec.result.code, "already_merged");
  assert.equal(rec.result.merge_sha, OTHER);
  // No authorization was created, because no privileged mutation was performed.
  assert.equal(rec.grant_id, undefined);
});

await test("an unreachable remote reconciles nothing", async () => {
  const made = createDurableLane({ name: "communications", repository_id: "repo_alloy", root: ROOT });
  const lane = made.lane;
  const out = await requestGovernedAction({
    actionKey: "repository.merge_pull_request",
    laneId: lane.lane_id,
    missionId: "msn_offline",
    title: "Merge PR #531",
    purpose: "promote",
    reasonWorkerCannotExecute: "merge is Director-owned",
    inputs: {
      repository: REPO, pullRequestNumber: 531, targetBranch: "staging",
      expectedHeadSha: SHA, mergeMethod: "merge",
    },
    root: ROOT,
  });
  const id = out.request?.request_id || out.request_id;
  const res = await reconcileGovernedApprovals({
    root: ROOT,
    inspect: () => { throw new Error("network unreachable"); },
  });
  // A remote we cannot read is not evidence that anything landed.
  assert.equal(res.satisfied.length, 0);
  assert.equal(getGovernedAction(id, ROOT).status, "awaiting_operator");
  assert.equal(res.unchanged[0].reason, "inspect_failed");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
