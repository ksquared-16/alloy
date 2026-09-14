#!/usr/bin/env node
/**
 * THE FOUR REPOSITORY-STATE ACTIONS, THROUGH THE WRAPPER LIVE EXECUTION USES.
 *
 * These sit in the normal promotion lifecycle and mutate GitHub. Until now each
 * had direct executor tests only, and every recent live-only defect lived in the
 * layer BETWEEN registration and executor:
 *
 *   registered action -> dispatch wrapper -> dependency construction -> executor
 *
 * So nothing here calls pushBranch, openPullRequest, closePullRequest or
 * deleteRemoteBranch directly as its proof. Each case seeds a real action record
 * and drives `executeTrustedHostAction`, the same entry point a governed action
 * uses.
 *
 * TWO WRAPPER DEFECTS WERE FOUND BY WRITING THIS, both in the housekeeping pair:
 *
 *   1. The dispatch wrapper called closePullRequest / deleteRemoteBranch with
 *      `{}` - no injection seam at all - so there was no way to exercise them
 *      without reaching real GitHub. That is why they could not be covered.
 *   2. trusted-host-repository-housekeeping.mjs never imported
 *      liveRemoteMutationPermitted. Five modules do; it did not. Closing a pull
 *      request and DELETING A REMOTE BRANCH were the two remote mutations
 *      nothing stopped from running outside the Gateway runtime root.
 *
 * Nothing real is mutated here: push runs against a bare repo in a temp
 * directory, and the gh-backed verbs take a recording fake.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

const ROOT = mkdtempSync(join(tmpdir(), "repo-dispatch-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;

const TH = await import("../lib/vacilando/trusted-host-actions.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const { defaultGit } = await import("../lib/vacilando/trusted-host-push.mjs");
const { describeExecutionFailure } = await import("../lib/vacilando/governed-action-request.mjs");
const { liveRemoteMutationPermitted } = await import("../lib/vacilando/trusted-host-remote-guard.mjs");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const REPO = "ksquared-16/alloy";
const g = (args, cwd) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function seedAction(actionType, inputs) {
  const dir = join(ROOT, "vacilando", "trusted-host-actions");
  mkdirSync(dir, { recursive: true });
  const id = `tha_test_${Math.random().toString(16).slice(2, 10)}`;
  writeFileSync(join(dir, `${id}.json`), JSON.stringify({
    schema_version: "vacilando.trusted_host_action.v1",
    id, missionId: "mission-repo-dispatch", actionType, actionVersion: 1,
    requestedBy: "director", requestedInputs: inputs, inputs,
    authorizationIdentity: { scope: "mission-repo-dispatch", actionType, resolved: true },
    authorizationState: "authorized", authorizationId: "authz-test",
    executionState: "not_started", state: "authorized",
    retryState: { attempts: 0, maxAttempts: 1 },
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, null, 2));
  return id;
}
const dispatch = (id) =>
  TH.executeTrustedHostAction(id, { actor: "director", nowMs: Date.now(), grant: { grant_id: "g1" } });

/* ── WS1: repository.push ─────────────────────────────────────────────────── */

function pushFixture() {
  const base = mkdtempSync(join(tmpdir(), "repo-push-"));
  const bare = join(base, "origin.git");
  const work = join(base, "work");
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", bare]);
  execFileSync("git", ["clone", "-q", bare, work], { stdio: "ignore" });
  g(["config", "user.email", "t@example.com"], work);
  g(["config", "user.name", "t"], work);

  writeFileSync(join(work, "a.txt"), "one\n");
  g(["add", "a.txt"], work); g(["commit", "-qm", "base"], work);
  g(["push", "-q", "origin", "main"], work);
  const baseSha = g(["rev-parse", "HEAD"], work);
  g(["checkout", "-q", "-b", "agent/work"], work);
  writeFileSync(join(work, "b.txt"), "two\n");
  g(["add", "b.txt"], work); g(["commit", "-qm", "candidate"], work);
  return { base, bare, work, baseSha, head: g(["rev-parse", "HEAD"], work) };
}


/**
 * The git the push wrapper runs on: the REAL one, with a single substitution.
 *
 * `evaluatePushReadiness` asks `git remote get-url origin` and refuses
 * `worktree_repository_mismatch` unless it names the declared repository. Only
 * ksquared-16/alloy is allowlisted, and this fixture obviously cannot own that
 * slug - the first version of these cases was refused by exactly that guard,
 * which is a good sign: the wrapper really does reach it.
 *
 * So the remote IDENTITY is simulated and nothing else is: `remote get-url`
 * answers with the GitHub URL, every other command - ls-remote, rev-list, push,
 * and their cwd and opts - goes to the real git against the bare repo beside
 * the worktree. `insteadOf` was tried first and is unusable here: it rewrites
 * `get-url` too, so the guard saw the temp path again. `pushInsteadOf` leaves
 * `get-url` alone but sends the fetch-direction ls-remote to github.com.
 */
function pushGit(f, seen) {
  return (args, cwd, opts) => {
    seen.push({ args, cwd, opts });
    if (args[0] === "remote" && args[1] === "get-url") {
      return { status: 0, stdout: `https://github.com/${REPO}\n`, stderr: "" };
    }
    const routed = args.map((a) => (a === "origin" ? f.bare : a));
    return defaultGit(routed, cwd, opts);
  };
}

test("P1 — an authorized push reaches the remote through the real dispatcher", () => {
  const f = pushFixture();
  const seen = [];
  // A REAL git, wrapped so the guard reads it as injected. The wrapper's own
  // cwd and opts handling is therefore exercised, not stubbed away.
  TH.setPushGitForTests(pushGit(f, seen));
  try {
    const out = dispatch(seedAction(ACTION_TYPES.REPOSITORY_PUSH, {
      repository: REPO, branch: "agent/work", expectedHeadSha: f.head,
      base_ref: f.baseSha, expected_commits: [f.head], worktreePath: f.work, remote: "origin",
    }));
    assert.notEqual(out.error, "action_unavailable");
    assert.equal(out.ok, true, `refused: ${out.error || ""} ${out.detail || ""}`);
    assert.equal(g(["rev-parse", "refs/heads/agent/work"], f.bare), f.head, "the remote did not receive the exact SHA");
    const push = seen.find((c) => c.args[0] === "push");
    assert.ok(push, "the wrapper never reached a push");
    assert.equal(push.cwd, f.work, "the worktree path was not carried to git");
    assert.ok(push.args.join(" ").includes(`${f.head}:refs/heads/agent/work`), "exact-SHA refspec lost in the wrapper");
    assert.ok(!push.args.includes("--force"), "no force, ever");
  } finally { TH.setPushGitForTests(null); rmSync(f.base, { recursive: true, force: true }); }
});

test("P2 — a semantic refusal survives the wrapper instead of becoming a throw", () => {
  const f = pushFixture();
  TH.setPushGitForTests(pushGit(f, []));
  try {
    // staging is a protected ref for a push: promotion is a merge, not a push.
    const out = dispatch(seedAction(ACTION_TYPES.REPOSITORY_PUSH, {
      repository: REPO, branch: "staging", expectedHeadSha: f.head,
      base_ref: f.baseSha, expected_commits: [f.head], worktreePath: f.work,
    }));
    assert.equal(out.ok, false);
    assert.doesNotMatch(String(out.error), /threw/, "a declared refusal must not arrive as an exception");
    assert.ok(out.detail, "the refusal must carry its reason through the wrapper");
  } finally { TH.setPushGitForTests(null); rmSync(f.base, { recursive: true, force: true }); }
});

test("P3 — the candidate declaration is forwarded, not dropped", () => {
  // base_ref and expected_commits are the ownership contract. If the wrapper
  // loses them the push guard is skipped and a commit sweep goes unnoticed.
  const f = pushFixture();
  writeFileSync(join(f.work, "c.txt"), "three\n");
  g(["add", "c.txt"], f.work); g(["commit", "-qm", "an undeclared second commit"], f.work);
  const head2 = g(["rev-parse", "HEAD"], f.work);
  TH.setPushGitForTests(pushGit(f, []));
  try {
    const out = dispatch(seedAction(ACTION_TYPES.REPOSITORY_PUSH, {
      repository: REPO, branch: "agent/work", expectedHeadSha: head2,
      base_ref: f.baseSha, expected_commits: [f.head], worktreePath: f.work,
    }));
    assert.equal(out.ok, false, "an undeclared commit must be refused");
    assert.match(String(out.error) + String(out.detail), /scope|commit|declar/i);
  } finally { TH.setPushGitForTests(null); rmSync(f.base, { recursive: true, force: true }); }
});

/* ── WS2: promotion.open_pr ───────────────────────────────────────────────── */

/** A recording gh. Returns canned JSON for reads; records every call. */
function ghFake(over = {}) {
  const calls = [];
  let created = false;
  const impl = (args) => {
    calls.push(args.join(" "));
    const a = args.join(" ");
    if (a.startsWith("pr list")) {
      // After a create, the read-back must find it - open_pr verifies rather
      // than assuming the command worked, and a fake that forgets this reports
      // open_pr_verification_failed.
      const list = created ? [{ number: 4242, url: "https://github.com/x/pull/4242", baseRefName: "staging", headRefName: "agent/work", headRefOid: over.remoteSha ?? "f".repeat(40), title: "a title", state: "OPEN" }] : (over.existing ?? []);
      return { status: 0, stdout: JSON.stringify(list), stderr: "" };
    }
    if (a.includes("git/ref/heads/")) return { status: over.remoteMissing ? 1 : 0, stdout: over.remoteSha ?? "f".repeat(40), stderr: "" };
    if (a.startsWith("pr create")) {
      if (over.createFails) return { status: 1, stdout: "", stderr: over.createErr ?? "\nGraphQL: a specimen failure from gh" };
      created = true;
      return { status: 0, stdout: "https://github.com/ksquared-16/alloy/pull/4242\n", stderr: "" };
    }
    if (a.startsWith("pr view")) return { status: 0, stdout: JSON.stringify(over.view ?? { number: 4242, url: "u", state: "OPEN" }), stderr: "" };
    if (a.startsWith("pr close")) return over.closeFails ? { status: 1, stdout: "", stderr: "\ngh pr close: a specimen failure" } : { status: 0, stdout: "", stderr: "" };
    if (a.startsWith("api -X DELETE")) return over.deleteFails ? { status: 1, stdout: "", stderr: "\ngh api delete: a specimen failure" } : { status: 0, stdout: "", stderr: "" };
    return { status: 0, stdout: "", stderr: "" };
  };
  impl.calls = calls;
  return impl;
}

const OPEN_PR_INPUTS = {
  repository: REPO, base: "staging", headBranch: "agent/work",
  expectedHeadSha: "f".repeat(40), title: "a title", body: "a body",
};

test("O1 — open_pr reaches its executor through the dispatcher and forwards every field", () => {
  const gh = ghFake();
  TH.setOpenPrGhForTests(gh);
  try {
    const out = dispatch(seedAction(ACTION_TYPES.PROMOTION_OPEN_PR, OPEN_PR_INPUTS));
    assert.notEqual(out.error, "action_unavailable");
    assert.equal(out.ok, true, `refused: ${out.error || ""} ${out.detail || ""}`);
    const create = gh.calls.find((c) => c.startsWith("pr create"));
    assert.ok(create, "the wrapper never reached pr create");
    for (const [what, token] of [["repository", REPO], ["base", "--base staging"], ["head", "--head agent/work"], ["title", "a title"], ["body", "a body"]]) {
      assert.ok(create.includes(token), `${what} lost in the wrapper: ${create}`);
    }
  } finally { TH.setOpenPrGhForTests(null); }
});

test("O2 — a gh failure keeps its sentence instead of collapsing to open_pr_failed", () => {
  const gh = ghFake({ createFails: true });
  TH.setOpenPrGhForTests(gh);
  try {
    const out = dispatch(seedAction(ACTION_TYPES.PROMOTION_OPEN_PR, OPEN_PR_INPUTS));
    assert.equal(out.ok, false);
    assert.match(String(out.detail), /specimen failure from gh/,
      "a useful gh diagnostic must survive the wrapper");
    // And through the governed boundary the operator actually reads.
    assert.match(describeExecutionFailure(out), /specimen failure from gh/);
  } finally { TH.setOpenPrGhForTests(null); }
});

test("O3 — line zero is often blank, and the sentence still survives", () => {
  // The historical defect: `err.split("\\n")[0]` reported "" for real failures.
  const gh = ghFake({ createFails: true, createErr: "\n\nsomething real went wrong" });
  TH.setOpenPrGhForTests(gh);
  try {
    const out = dispatch(seedAction(ACTION_TYPES.PROMOTION_OPEN_PR, OPEN_PR_INPUTS));
    assert.match(String(out.detail), /something real went wrong/);
  } finally { TH.setOpenPrGhForTests(null); }
});

test("O4 — a secret in a gh error does not reach the operator surface", () => {
  const gh = ghFake({ createFails: true, createErr: "\nrefused while reading postgresql://u:p@host:5432/db" });
  TH.setOpenPrGhForTests(gh);
  try {
    const out = dispatch(seedAction(ACTION_TYPES.PROMOTION_OPEN_PR, OPEN_PR_INPUTS));
    const shown = describeExecutionFailure(out);
    /*
     * MEASURED, NOT ASSUMED. The first version of this case expected a
     * "[redacted]" marker to reach the operator. It does not, and the reason is
     * better than the expectation: the wrapper's payloadHasSecrets check fires
     * FIRST and discards the entire result as `result_contained_secrets`. The
     * contract - the secret does not reach the operator - is satisfied by
     * refusal rather than by masking, and the test now says which.
     */
    assert.doesNotMatch(shown, /u:p@host/, "the secret must not reach the operator");
    assert.doesNotMatch(shown, /postgresql:/, "nor the connection string it sat in");
    assert.match(String(out.error), /result_contained_secrets/,
      "the whole result is discarded rather than partially masked");
  } finally { TH.setOpenPrGhForTests(null); }
});

/* ── WS3/WS4: the housekeeping pair, which had no seam at all ─────────────── */

test("H1 — the dispatch wrapper can now be given a client at all", () => {
  // Before this mission it called closePullRequest(action.inputs, {}), so `gh`
  // always resolved to the real client and this test could not exist.
  assert.equal(typeof TH.setRepositoryHousekeepingGhForTests, "function");
});

test("H2 — close_pull_request carries PR identity through the wrapper", () => {
  const gh = ghFake({
    view: { number: 77, url: "u", state: "OPEN", merged: false, headRefOid: "a".repeat(40), headRefName: "agent/work" },
  });
  TH.setRepositoryHousekeepingGhForTests(gh);
  try {
    const out = dispatch(seedAction(ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST, {
      repository: REPO, pullRequestNumber: 77, expectedHeadSha: "a".repeat(40), headBranch: "agent/work",
    }));
    assert.notEqual(out.error, "action_unavailable");
    const touched = gh.calls.join(" | ");
    assert.ok(touched.includes("77"), `the PR number never reached gh: ${touched}`);
    assert.ok(touched.includes(REPO), "the repository never reached gh");
    // Whatever the gates decide, the wrapper must not have thrown.
    assert.doesNotMatch(String(out.error || ""), /threw|not defined/);
  } finally { TH.setRepositoryHousekeepingGhForTests(null); }
});

test("H3 — delete_remote_branch carries the exact branch identity", () => {
  const gh = ghFake();
  TH.setRepositoryHousekeepingGhForTests(gh);
  try {
    const out = dispatch(seedAction(ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH, {
      repository: REPO, branch: "agent/work", expectedHeadSha: "f".repeat(40),
    }));
    assert.notEqual(out.error, "action_unavailable");
    assert.ok(gh.calls.join(" | ").includes("agent/work"), "the branch never reached gh");
    assert.doesNotMatch(String(out.error || ""), /threw|not defined/);
  } finally { TH.setRepositoryHousekeepingGhForTests(null); }
});

test("H4 — the housekeeping verbs consult the live-mutation guard before acting", () => {
  /*
   * STRUCTURAL, AND THE LIMIT IS STATED. The guard sits after the read gates and
   * immediately before the mutation, exactly where push places it - so reaching
   * it at runtime requires a gh that satisfies the reads, and a gh that
   * satisfies the reads is by definition injected, which the guard then treats
   * as simulated. There is no arrangement in which a test both passes the gates
   * and is refused by the guard.
   *
   * A first version asserted only that an un-injected delete comes back not-ok.
   * It passed with the guard REMOVED - the real gh simply returned 404 - so it
   * locked nothing. Worse, it proved the un-injected path reaches the live
   * GitHub API: `branch_absent :: gh: Not Found (HTTP 404)`. That is the exposure
   * the guard closes and the seam makes unnecessary.
   */
  const src = readFileSync(join(HERE, "..", "lib", "vacilando", "trusted-host-repository-housekeeping.mjs"), "utf8");
  assert.match(src, /import \{ liveRemoteMutationPermitted \}/,
    "the module that deletes remote branches must import the guard the other remote verbs use");
  const calls = [...src.matchAll(/liveRemoteMutationPermitted\(/g)];
  assert.equal(calls.length, 2, "one guard per remote mutation: close, and delete");
  for (const verb of ["pr\", \"close", "-X\", \"DELETE"]) {
    const at = src.indexOf(verb);
    assert.ok(at > 0, `mutation not found: ${verb}`);
    const before = src.slice(0, at);
    assert.ok(before.lastIndexOf("liveRemoteMutationPermitted(") > before.lastIndexOf("return {\n    ok: true"),
      `the guard does not precede ${verb}`);
  }
});

test("H5 — and that guard refuses a real mutation outside the Gateway runtime root", () => {
  const r = liveRemoteMutationPermitted({
    env: { ALLOY_RUNTIME_ROOT: "/tmp/not-the-gateway" }, injectedGh: false, operation: "remote branch deletion",
  });
  assert.equal(r.ok, false);
  assert.equal(r.code, "live_remote_mutation_outside_gateway_runtime_root");
  assert.match(r.detail, /remote branch deletion/, "the refusal must name the operation it stopped");
  // An injected client is simulated and permitted - that is what makes the
  // wrapper testable at all.
  assert.equal(liveRemoteMutationPermitted({ injectedGh: true }).ok, true);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
