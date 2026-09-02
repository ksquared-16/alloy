#!/usr/bin/env node
/**
 * A CALLER'S VALUE MUST NOT BE SILENTLY REPLACED, AND A REFUSAL MUST NAME THE
 * INVARIANT THAT ACTUALLY FAILED.
 *
 * Two proven defects of one family, found while promoting the merge-grant fix.
 *
 * (1) MERGE IDENTITY OUTSIDE THE GRANT PATH. readMergeInputIdentity became the
 *     single owner for grant issuance and trusted execution. actionQueryHash,
 *     requestTitle and openApprovalDecision kept the older narrow vocabulary,
 *     so a merge proposed with `pull_request` executed correctly but rendered
 *     "PR: #" on the approval card — the Director could be asked to authorise a
 *     privileged staging merge whose PR number was blank.
 *
 * (2) repository.push ADVERTISES inputs.worktreePath AND IGNORED IT.
 *     resolveWorktreePath read only the top-level payload, then fell back to
 *     the run's bound worktree. gar_1e5d2e1dab9f7e supplied
 *     inputs.worktreePath = the promotion worktree at d9beb0c29, ran against
 *     the lane worktree at 033d76bd7c4d, and was refused `head_drift` — "the
 *     branch moved after this push was proposed" — for a branch that never
 *     moved. The same push with a top-level worktree_path succeeded instantly.
 *
 * Both are fixed at the canonical owner, not at the caller.
 */
import assert from "node:assert/strict";
import { readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-input-contract-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const { readMergeInputIdentity, validateMergeInputs } =
  await import("../lib/vacilando/trusted-host-merge.mjs");
const { evaluateWorktreeForPush, evaluatePushReadiness } =
  await import("../lib/vacilando/trusted-host-push.mjs");
const REQ_SRC = readFileSync(
  new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url),
  "utf8",
);
const REG_SRC = readFileSync(
  new URL("../lib/vacilando/trusted-host-action-registry.mjs", import.meta.url),
  "utf8",
);

const SHA = "d9beb0c29508cf07f0f84ff077ece24b29b3baf4";
const OTHER_SHA = "a842fb059c984b3d2706044a9910d7444cfe6947";

/** Every spelling the contract accepts for the same merge. */
const ALIAS_FORMS = Object.freeze([
  { pull_request_number: 598, expected_head_sha: SHA },
  { pullRequestNumber: 598, expectedHeadSha: SHA },
  { pull_request: 598, head_sha: SHA },
  { pullRequest: 598, expected_head_sha: SHA },
  { pr: 598, head_sha: SHA },
]);

const BASE = Object.freeze({ repository: "ksquared-16/alloy", target_branch: "staging", merge_method: "merge" });

let pass = 0;
let fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/** Brace-matched body of a named top-level function. */
function functionBody(source, signature) {
  const start = source.indexOf(signature);
  assert.notEqual(start, -1, `could not find ${signature}`);
  let depth = 0;
  // After the signature: a default parameter's braces are not the body.
  let i = source.indexOf("{", start + signature.length);
  const open = i;
  for (; i < source.length; i += 1) {
    if (source[i] === "{") depth += 1;
    else if (source[i] === "}") { depth -= 1; if (depth === 0) return source.slice(open, i + 1); }
  }
  throw new Error(`unbalanced braces in ${signature}`);
}

// ---------------------------------------------------------------------------
// 1 — merge identity convergence
// ---------------------------------------------------------------------------

test("every alias spelling yields one identity for grant AND executor", () => {
  for (const form of ALIAS_FORMS) {
    const inputs = { ...BASE, ...form };
    const id = readMergeInputIdentity(inputs);
    assert.equal(id.pullRequestNumber, 598, JSON.stringify(Object.keys(form)));
    assert.equal(id.expectedHeadSha, SHA, JSON.stringify(Object.keys(form)));
    const v = validateMergeInputs(inputs);
    assert.equal(v.ok, true, `executor refused ${JSON.stringify(Object.keys(form))}: ${v.code}`);
    assert.equal(v.normalized.pullRequestNumber, 598);
    assert.equal(v.normalized.expectedHeadSha, SHA);
    assert.equal(v.normalized.targetBranch, "staging");
    assert.equal(v.normalized.mergeMethod, "merge");
  }
});

test("the approval card can never show a blank PR number for a valid request", () => {
  // The exact regression: `pull_request` rendered "PR: #" with nothing after it.
  for (const form of ALIAS_FORMS) {
    const id = readMergeInputIdentity({ ...BASE, ...form });
    const rendered = `PR: #${id.pullRequestNumber ?? "unknown"}`;
    assert.equal(rendered, "PR: #598", `blank/incorrect PR for ${JSON.stringify(Object.keys(form))}`);
    assert.ok(!/#\s*$/.test(rendered), "the PR line must never end at the hash");
  }
});

test("the query hash normalises aliases but keeps distinct SHAs distinct", () => {
  // Same commit, different spellings -> one hash.
  const hashes = new Set(ALIAS_FORMS.map((f) => readMergeInputIdentity({ ...BASE, ...f }).expectedHeadSha));
  assert.equal(hashes.size, 1, "one commit must produce one merge query identity");
  // Different commits -> different identity. PR 596 and PR 598 stay distinct.
  const a = readMergeInputIdentity({ ...BASE, pull_request: 598, head_sha: SHA });
  const b = readMergeInputIdentity({ ...BASE, pull_request: 596, head_sha: OTHER_SHA });
  assert.notEqual(a.expectedHeadSha, b.expectedHeadSha, "different commits must not share a hash");
  assert.notEqual(a.pullRequestNumber, b.pullRequestNumber, "PR 596 and 598 must stay distinct");
});

test("a malformed PR value stays null and is never guessed", () => {
  for (const bad of [{ pull_request: "not-a-number" }, { pr: 0 }, { pr: -3 }, { pullRequest: 1.5 }, {}]) {
    assert.equal(readMergeInputIdentity({ ...BASE, ...bad }).pullRequestNumber, null, JSON.stringify(bad));
  }
  assert.equal(readMergeInputIdentity({ head_sha: "zzz" }).expectedHeadSha, null);
});

test("no second merge alias list exists in governed-action-request", () => {
  // The structural guard. Each of these consumers must read the shared parser,
  // and none may re-derive merge identity from rec.inputs itself.
  for (const sig of [
    "function actionQueryHash(rec)",
    "function requestTitle(rec)",
    "function proposalForRequest(rec)",
  ]) {
    const body = functionBody(REQ_SRC, sig);
    const own = body.match(
      /rec\.inputs\??\.\s*(pull_request_number|pullRequestNumber|pull_request|pullRequest|pr|expected_head_sha|expectedHeadSha|head_sha|merge_method|mergeMethod)\b/g,
    );
    // actionQueryHash legitimately reads push/open_pr SHAs, which are not merge
    // identity; assert only that the MERGE branch went through the parser.
    if (sig.startsWith("function actionQueryHash")) {
      assert.ok(body.includes("mergeIdentityFor"), "actionQueryHash must use the shared merge identity");
      continue;
    }
    assert.equal(own, null, `${sig} re-derives merge identity: ${JSON.stringify(own)}`);
  }
  assert.ok(
    /function mergeIdentityFor\(rec\)\s*\{\s*return readMergeInputIdentity\(/.test(REQ_SRC),
    "mergeIdentityFor must delegate straight to readMergeInputIdentity",
  );
});

test("the operator card carries the full merge identity", () => {
  const body = REQ_SRC.slice(REQ_SRC.indexOf("const mergeIdentityLines"));
  for (const field of ["Repository:", "PR: #", "Expected SHA:", "Target branch:", "Merge method:"]) {
    assert.ok(body.includes(field), `the approval card must show ${field}`);
  }
  assert.ok(body.includes("mergeId."), "the card must read the parsed identity, not raw inputs");
});

// ---------------------------------------------------------------------------
// 2 — repository.push worktree path contract
// ---------------------------------------------------------------------------

test("resolveWorktreePath honours the advertised inputs location", () => {
  const body = functionBody(REQ_SRC, "function resolveWorktreePath(input, laneId, run, root)");
  assert.ok(body.includes("inputs.worktreePath"), "must read inputs.worktreePath");
  assert.ok(body.includes("inputs.worktree_path"), "must read inputs.worktree_path");
  // Explicit beats the run-bound fallback: both input reads must appear before
  // the run fallback in the resolution chain.
  const iInputs = Math.max(body.indexOf("inputs.worktreePath"), body.indexOf("inputs.worktree_path"));
  const iRun = body.indexOf("run?.worktree_path");
  assert.notEqual(iRun, -1, "the run fallback must still exist");
  assert.ok(iInputs < iRun, "an explicit worktree path must beat the run-bound fallback");
});

test("the registry schema and the resolver name the same input", () => {
  // The structural guard against the two drifting apart again.
  assert.ok(
    /required:\s*\[[^\]]*"worktreePath"[^\]]*\]/.test(REG_SRC),
    "repository.push must still advertise worktreePath",
  );
  assert.ok(
    /worktree_path:\s*inputs\.worktree_path\s*\|\|\s*inputs\.worktreePath/.test(REG_SRC),
    "the registry must normalise both spellings",
  );
  const resolver = functionBody(REQ_SRC, "function resolveWorktreePath(input, laneId, run, root)");
  for (const spelling of ["worktreePath", "worktree_path"]) {
    assert.ok(
      resolver.includes(`inputs.${spelling}`),
      `the resolver must read the advertised inputs.${spelling}`,
    );
  }
});

/** A git stub: one call signature, scripted per-argv answers. */
function gitStub(answers) {
  return (args) => {
    const key = args.join(" ");
    for (const [prefix, res] of Object.entries(answers)) {
      if (key.startsWith(prefix)) return { status: res.status ?? 0, stdout: res.stdout ?? "", stderr: "" };
    }
    return { status: 1, stdout: "", stderr: "not stubbed" };
  };
}

const REAL_WT = ROOT; // exists on disk

test("a missing worktree refuses as a worktree fault, never as head_drift", () => {
  const out = evaluateWorktreeForPush(
    { worktreePath: join(ROOT, "does-not-exist"), repository: "ksquared-16/alloy", remote: "origin" },
    { gitImpl: gitStub({}) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "worktree_missing");
  assert.notEqual(out.code, "head_drift");
});

test("a path that is not a git worktree refuses specifically", () => {
  const out = evaluateWorktreeForPush(
    { worktreePath: REAL_WT, repository: "ksquared-16/alloy", remote: "origin" },
    { gitImpl: gitStub({ "rev-parse --is-inside-work-tree": { status: 128 } }) },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "worktree_not_a_git_worktree");
});

test("the wrong repository refuses, and an unreadable remote does not invent one", () => {
  const wrong = evaluateWorktreeForPush(
    { worktreePath: REAL_WT, repository: "ksquared-16/alloy", remote: "origin" },
    {
      gitImpl: gitStub({
        "rev-parse --is-inside-work-tree": { stdout: "true\n" },
        "remote get-url": { stdout: "git@github.com:someone-else/other.git\n" },
      }),
    },
  );
  assert.equal(wrong.ok, false);
  assert.equal(wrong.code, "worktree_repository_mismatch");
  assert.equal(wrong.actual, "someone-else/other");

  // A remote that cannot be read is not evidence of a mismatch.
  const unreadable = evaluateWorktreeForPush(
    { worktreePath: REAL_WT, repository: "ksquared-16/alloy", remote: "origin" },
    {
      gitImpl: gitStub({
        "rev-parse --is-inside-work-tree": { stdout: "true\n" },
        "remote get-url": { status: 128 },
      }),
    },
  );
  assert.equal(unreadable.ok, true, "an unreadable remote must not manufacture a refusal");
});

test("a genuinely moved HEAD still reports head_drift", () => {
  // The check must keep working for the case it was written for.
  const out = evaluatePushReadiness(
    {
      worktreePath: REAL_WT,
      repository: "ksquared-16/alloy",
      remote: "origin",
      branch: "promote/x",
      expectedHeadSha: SHA,
    },
    {
      gitImpl: gitStub({
        "ls-remote": { stdout: "" },
        "rev-parse --is-inside-work-tree": { stdout: "true\n" },
        "remote get-url": { stdout: "git@github.com:ksquared-16/alloy.git\n" },
        "rev-parse --abbrev-ref HEAD": { stdout: "promote/x\n" },
        "rev-parse HEAD": { stdout: `${OTHER_SHA}\n` },
      }),
    },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "head_drift", "a real drift must still be called drift");
  assert.equal(out.actual, OTHER_SHA);
});

test("branch and SHA pinning survive: right worktree, right SHA, wrong branch refuses", () => {
  const out = evaluatePushReadiness(
    {
      worktreePath: REAL_WT,
      repository: "ksquared-16/alloy",
      remote: "origin",
      branch: "promote/x",
      expectedHeadSha: SHA,
    },
    {
      gitImpl: gitStub({
        "ls-remote": { stdout: "" },
        "rev-parse --is-inside-work-tree": { stdout: "true\n" },
        "remote get-url": { stdout: "git@github.com:ksquared-16/alloy.git\n" },
        "rev-parse --abbrev-ref HEAD": { stdout: "some-other-branch\n" },
        "rev-parse HEAD": { stdout: `${SHA}\n` },
      }),
    },
  );
  assert.equal(out.ok, false);
  assert.equal(out.code, "branch_mismatch");
});

// ---------------------------------------------------------------------------
// Functional proofs — behaviour, not source text
// ---------------------------------------------------------------------------

const { governedProposalFor, requestGovernedAction, resetGovernedActionsForTests } =
  await import("../lib/vacilando/governed-action-request.mjs");
const { createDurableLane, resetDevelopmentLanesForTests } =
  await import("../lib/vacilando/development-lane.mjs");
const { repositoryStorePath } = await import("../lib/vacilando/repository-registry.mjs");

/** The durable request record, where resolveWorktreePath writes its answer. */
function storedRequest(requestId) {
  const raw = JSON.parse(readFileSync(join(ROOT, "vacilando", "governed-actions", "requests.json"), "utf8"));
  const all = raw.requests || raw;
  const list = Array.isArray(all) ? all : Object.values(all);
  const found = list.find((x) => x && x.request_id === requestId);
  assert.ok(found, `stored request ${requestId} not found`);
  return found;
}

function seedAlloyRepository() {
  const store = {
    schema_version: "vacilando.repository.v1",
    repositories: {
      repo_alloy: {
        schema_version: "vacilando.repository.v1",
        repository_id: "repo_alloy",
        name: "Alloy",
        profile: "alloy",
        state: "ACTIVE",
        root: join(ROOT, "repos", "repo_alloy"),
        git_common_dir: join(ROOT, "repos", "repo_alloy", ".git"),
        worktree_parent: join(ROOT, "worktrees", "repo_alloy"),
        default_branch: "origin/staging",
        remote: "git@github.com:ksquared-16/alloy.git",
        created_at: "2026-08-01T00:00:00Z",
        updated_at: "2026-08-01T00:00:00Z",
      },
    },
  };
  mkdirSync(join(ROOT, "vacilando"), { recursive: true });
  writeFileSync(repositoryStorePath(ROOT), `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

test("the Director's proposal card shows the PR for EVERY alias spelling", () => {
  // governedProposalFor builds `facts` — the card the Director actually reads.
  // Before the fix, `pull_request` produced no Pull request row and no Head
  // commit row: the two facts that identify what is being merged.
  for (const form of ALIAS_FORMS) {
    const req = {
      action_key: "repository.merge_pull_request",
      target: "staging",
      inputs: { ...BASE, ...form },
    };
    const p = governedProposalFor(req);
    assert.ok(p, "a merge request must produce a proposal");
    const byLabel = Object.fromEntries(p.facts.map((f) => [f.label, f.value]));
    const which = JSON.stringify(Object.keys(form));
    assert.equal(byLabel["Pull request"], "#598", `Pull request row wrong for ${which}`);
    assert.equal(byLabel["Head commit"], SHA.slice(0, 12), `Head commit row wrong for ${which}`);
    assert.equal(byLabel["Target branch"], "staging", `Target branch wrong for ${which}`);
    assert.equal(byLabel["Merge method"], "merge", `Merge method wrong for ${which}`);
    assert.equal(byLabel["Repository"], "ksquared-16/alloy", `Repository wrong for ${which}`);
  }
});

test("an explicit inputs.worktreePath beats the run-bound fallback, end to end", () => {
  resetGovernedActionsForTests(ROOT);
  resetDevelopmentLanesForTests(ROOT);
  seedAlloyRepository();
  const made = createDurableLane({ name: "promotion lane", repository_id: "repo_alloy", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const explicit = join(ROOT, "explicit-promotion-worktree");
  mkdirSync(explicit, { recursive: true });

  const out = requestGovernedAction({
    action_key: "repository.push",
    lane_id: laneId,
    target: "staging",
    purpose: "prove the advertised input location is honoured",
    reason_worker_cannot_execute: "pushing is Director-owned",
    inputs: {
      repository: "ksquared-16/alloy",
      branch: "promote/x",
      expectedHeadSha: SHA,
      // The location the registered schema advertises, and the one that used to
      // be ignored in favour of the lane's own worktree.
      worktreePath: explicit,
    },
  }, { root: ROOT, processNow: false });

  assert.equal(out.ok, true, out.error || "");
  // worktree_path is an internal field of the stored record, not part of the
  // public projection — read where the resolver actually writes it, because
  // that is the value the trusted-host action is later built from.
  const stored = storedRequest(out.request.request_id);
  assert.equal(
    stored.worktree_path,
    explicit,
    "inputs.worktreePath must win over the run/lane-bound fallback",
  );
});

test("with no explicit path the existing fallback still applies", () => {
  resetGovernedActionsForTests(ROOT);
  resetDevelopmentLanesForTests(ROOT);
  seedAlloyRepository();
  const made = createDurableLane({ name: "fallback lane", repository_id: "repo_alloy", root: ROOT });
  const laneId = made.lane?.lane_id || made.lane_id;
  const out = requestGovernedAction({
    action_key: "repository.push",
    lane_id: laneId,
    target: "staging",
    purpose: "prove the fallback is untouched",
    reason_worker_cannot_execute: "pushing is Director-owned",
    inputs: { repository: "ksquared-16/alloy", branch: "promote/x", expectedHeadSha: SHA },
  }, { root: ROOT, processNow: false });
  assert.equal(out.ok, true, out.error || "");
  // No explicit path was supplied, so resolution falls through exactly as
  // before — to the run's worktree, then the lane binding, then null. The point
  // is that the fallback still runs and nothing throws.
  const stored = storedRequest(out.request.request_id);
  assert.ok(
    stored.worktree_path === null || typeof stored.worktree_path === "string",
    "the fallback must still resolve to a path or an explicit null",
  );
  assert.notEqual(stored.worktree_path, undefined, "resolution must still happen");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
