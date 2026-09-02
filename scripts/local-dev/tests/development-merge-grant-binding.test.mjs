#!/usr/bin/env node
/**
 * AN OPERATOR-APPROVED MERGE MUST BE EXECUTABLE.
 *
 * THE MEASURED INCIDENT. Two operator-approved governed merges for PR #596
 * (gar_71a81af3495a4a and gar_6fc51ddcdb9f1d) reached the trusted host and were
 * both refused with `grant_pull_request_mismatch`. Their grants —
 * grnt_bce311bfb0a54567 and grnt_e1172652d4774162 — were ACTIVE, unexpired, for
 * the right repository and the right target branch, and both carried:
 *
 *     pull_request_number: null
 *     expected_head_sha:   null
 *
 * while the requests they were issued from carried, in `inputs`:
 *
 *     pull_request: 596
 *     head_sha:     a842fb059c984b3d2706044a9910d7444cfe6947
 *
 * THE CAUSE was two independent spelling lists for the same fields. The
 * executor (validateMergeInputs) had been widened to accept `pull_request`
 * after a lane proposed `{"pull_request": 522}`; the grant issuer
 * (proposalForRequest) still accepted only `pull_request_number` /
 * `pullRequestNumber`, and `expected_head_sha` / `expectedHeadSha` but not
 * `head_sha`. So the executor resolved PR 596 while the grant had been pinned
 * to null, and `Number(null)` = 0 was compared against 596.
 *
 * The refusal named the pull request number, which is why it read as "wrong
 * PR" rather than "the field name was never read".
 *
 * Both sides now read through readMergeInputIdentity. These tests pin that:
 * the tolerated spellings produce an executable grant, and the authority still
 * does not generalize to any other PR, SHA, target or method.
 */
import assert from "node:assert/strict";

const { readMergeInputIdentity, validateMergeInputs } =
  await import("../lib/vacilando/trusted-host-merge.mjs");
const { grantAuthorizesAction } =
  await import("../lib/vacilando/trusted-host-actions.mjs");

/** The inputs exactly as the refused requests carried them. */
const LIVE_INPUTS = Object.freeze({
  repository: "ksquared-16/alloy",
  pull_request: 596,
  base: "staging",
  head: "promote/operational-cards-staging",
  head_sha: "a842fb059c984b3d2706044a9910d7444cfe6947",
  target_branch: "staging",
});

const HOUR = 60 * 60 * 1000;

/** A grant shaped the way proposalForRequest pins one, from given identity. */
function grantFrom(identity, overrides = {}) {
  return {
    action_key: "repository.merge_pull_request",
    repository_id: "repo_alloy",
    pull_request_number: identity.pullRequestNumber,
    expected_head_sha: identity.expectedHeadSha,
    target_branch: identity.targetBranch || "staging",
    merge_method: identity.mergeMethod,
    branch: null,
    status: "ACTIVE",
    expires_at: new Date(Date.now() + HOUR).toISOString(),
    ...overrides,
  };
}

/** The action as the executor presents it at execution time. */
function actionFrom(inputs = LIVE_INPUTS) {
  const v = validateMergeInputs(inputs);
  assert.equal(v.ok, true, `validateMergeInputs refused: ${v.code} ${v.detail || ""}`);
  return { actionType: "repository.merge_pull_request", inputs: v.normalized };
}

let pass = 0;
let fail = 0;

function test(name, fn) {
  try {
    fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

test("the executor and the grant issuer read the SAME pull request number", () => {
  const identity = readMergeInputIdentity(LIVE_INPUTS);
  const action = actionFrom();
  assert.equal(identity.pullRequestNumber, 596, "the grant issuer must see PR 596");
  assert.equal(action.inputs.pullRequestNumber, 596, "the executor must see PR 596");
  assert.equal(identity.expectedHeadSha, LIVE_INPUTS.head_sha);
  assert.equal(action.inputs.expectedHeadSha, LIVE_INPUTS.head_sha);
});

test("the live PR #596 request now yields an EXECUTABLE grant", () => {
  // This is the exact refusal, reproduced end to end.
  const grant = grantFrom(readMergeInputIdentity(LIVE_INPUTS));
  const out = grantAuthorizesAction(grant, actionFrom());
  assert.equal(out.ok, true, `still refused: ${out.error}`);
});

test("the old narrow issuer is what produced the null pin", () => {
  // The pre-fix spelling list, verbatim, against the same request inputs.
  const legacy = {
    pullRequestNumber: LIVE_INPUTS.pull_request_number ?? LIVE_INPUTS.pullRequestNumber ?? null,
    expectedHeadSha: LIVE_INPUTS.expected_head_sha || LIVE_INPUTS.expectedHeadSha || null,
    targetBranch: "staging",
    mergeMethod: "merge",
  };
  assert.equal(legacy.pullRequestNumber, null, "the old list could not see `pull_request`");
  assert.equal(legacy.expectedHeadSha, null, "the old list could not see `head_sha`");
  const out = grantAuthorizesAction(grantFrom(legacy), actionFrom());
  assert.equal(out.ok, false);
  assert.equal(out.error, "grant_pull_request_mismatch", "the exact live refusal");
});

test("every tolerated spelling produces the same identity", () => {
  const spellings = [
    { pull_request_number: 596, expected_head_sha: LIVE_INPUTS.head_sha },
    { pullRequestNumber: 596, expectedHeadSha: LIVE_INPUTS.head_sha },
    { pull_request: 596, head_sha: LIVE_INPUTS.head_sha },
    { pullRequest: 596, expected_head_sha: LIVE_INPUTS.head_sha },
    { pr: 596, head_sha: LIVE_INPUTS.head_sha },
  ];
  for (const s of spellings) {
    const id = readMergeInputIdentity(s);
    assert.equal(id.pullRequestNumber, 596, `spelling ${JSON.stringify(Object.keys(s))}`);
    assert.equal(id.expectedHeadSha, LIVE_INPUTS.head_sha, `spelling ${JSON.stringify(Object.keys(s))}`);
  }
});

test("authority does NOT generalize to another pull request", () => {
  const grant = grantFrom(readMergeInputIdentity(LIVE_INPUTS));
  const other = actionFrom({ ...LIVE_INPUTS, pull_request: 597 });
  const out = grantAuthorizesAction(grant, other);
  assert.equal(out.ok, false);
  assert.equal(out.error, "grant_pull_request_mismatch");
});

test("authority does NOT survive the branch moving", () => {
  const grant = grantFrom(readMergeInputIdentity(LIVE_INPUTS));
  const moved = actionFrom({ ...LIVE_INPUTS, head_sha: "b".repeat(40) });
  const out = grantAuthorizesAction(grant, moved);
  assert.equal(out.ok, false);
  assert.equal(out.error, "grant_head_sha_mismatch");
});

test("authority does NOT generalize to another target or merge method", () => {
  const identity = readMergeInputIdentity(LIVE_INPUTS);
  const wrongTarget = grantAuthorizesAction(
    grantFrom(identity, { target_branch: "main" }),
    actionFrom(),
  );
  assert.equal(wrongTarget.error, "grant_target_branch_mismatch");
  const wrongMethod = grantAuthorizesAction(
    grantFrom(identity, { merge_method: "squash" }),
    actionFrom(),
  );
  assert.equal(wrongMethod.error, "grant_merge_method_mismatch");
});

test("a malformed pull request number is null, never a guess", () => {
  for (const bad of [{ pull_request: "not-a-number" }, { pr: 0 }, { pr: -3 }, {}]) {
    assert.equal(readMergeInputIdentity(bad).pullRequestNumber, null, JSON.stringify(bad));
  }
  // A short-but-valid sha is accepted; anything else is null rather than a guess.
  assert.equal(readMergeInputIdentity({ head_sha: "a842fb0" }).expectedHeadSha, "a842fb0");
  assert.equal(readMergeInputIdentity({ head_sha: "zzz" }).expectedHeadSha, null);
});

test("a consumed, revoked or expired grant is still refused", () => {
  const identity = readMergeInputIdentity(LIVE_INPUTS);
  const action = actionFrom();
  assert.equal(grantAuthorizesAction(grantFrom(identity, { status: "CONSUMED" }), action).error, "grant_already_used");
  assert.equal(grantAuthorizesAction(grantFrom(identity, { status: "REVOKED" }), action).error, "grant_revoked");
  assert.equal(
    grantAuthorizesAction(grantFrom(identity, { expires_at: new Date(Date.now() - HOUR).toISOString() }), action).error,
    "grant_expired",
  );
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
