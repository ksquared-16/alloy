#!/usr/bin/env node
/**
 * MISSION-SCOPED DELEGATED AUTHORITY — THE SAFETY MATRIX.
 *
 * A delegation may remove a redundant CLICK. It may never remove a BINDING.
 * These tests are written so that every way of getting more authority than the
 * mission gave is a named, asserted refusal.
 *
 * The A-J matrix from the brief is implemented below under its own headings.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-delegation-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const D = await import("../lib/vacilando/mission-delegation.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");

const PUSH = ACTION_TYPES.REPOSITORY_PUSH;
const OPEN = ACTION_TYPES.PROMOTION_OPEN_PR;
const MERGE = ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
const REPO = "ksquared-16/alloy";
const MISSION = "msn_cert";

let pass = 0;
let fail = 0;
function test(name, fn) {
  try {
    rmSync(D.delegationStorePath(ROOT), { force: true });
    fn();
    pass += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (e) {
    fail += 1;
    process.stdout.write(`FAIL - ${name} :: ${e.message}\n`);
  }
}

const opts = { root: ROOT };

function delegate(text, extra = {}) {
  return D.recordMissionDelegation({
    missionId: MISSION,
    laneId: "lane_cert",
    repository: REPO,
    missionText: text,
    ...extra,
    ...opts,
  });
}

function cover(actionKey, ctx = {}) {
  return D.findCoveringDelegation({
    missionId: MISSION,
    laneId: "lane_cert",
    actionKey,
    repository: REPO,
    targetBranch: "staging",
    checksGreen: true,
    unrelatedCommits: 0,
    ...ctx,
  }, opts);
}

const FULL = "validate this work, push it, open the PR, and merge it to staging when checks pass";

// ------------------------------------------------------------------ grammar

test("grammar: the headline mission delegates exactly the three eligible actions", () => {
  const p = D.parseMissionDelegation(FULL);
  const actions = p.delegations.map((d) => d.action).sort();
  assert.deepEqual(actions, [OPEN, MERGE, PUSH].sort());
  for (const d of p.delegations) {
    if (d.action !== PUSH) assert.equal(d.target_branch, "staging");
  }
});

test("grammar: vague language never delegates", () => {
  for (const text of ["finish this", "take care of it", "get this done", "ship it", "handle it", "make it happen"]) {
    const p = D.parseMissionDelegation(text);
    assert.equal(p.delegations.length, 0, `"${text}" must not delegate`);
    assert.equal(p.vague, true, `"${text}" must be reported as vague`);
  }
});

test("grammar: prohibitions and approval-seeking never delegate", () => {
  for (const text of [
    "do not merge to staging",
    "don't merge it to staging",
    "ask me before you merge to staging",
    "check with me before merging to staging",
    "merge to staging only if I approve",
    "wait for my approval, then merge to staging",
    "never push this branch",
  ]) {
    const p = D.parseMissionDelegation(text);
    assert.equal(p.delegations.length, 0, `"${text}" must not delegate`);
  }
});

test("grammar: a refusal disarms only its own clause", () => {
  // The mixed case: one action delegated, another explicitly withheld.
  const p = D.parseMissionDelegation("push the branch, but ask me before merging");
  assert.deepEqual(p.delegations.map((d) => d.action), [PUSH]);
});

test("grammar: an action with no explicit target is refused", () => {
  const p = D.parseMissionDelegation("merge it");
  assert.equal(p.delegations.length, 0);
  assert.equal(p.refusals[0].reason, "no_explicit_target_branch");
});

test("grammar: production and other protected targets are refused outright", () => {
  for (const t of ["production", "prod", "main", "master"]) {
    const p = D.parseMissionDelegation(`merge it to ${t} when checks pass`);
    assert.equal(p.delegations.length, 0, `${t} must not be delegable`);
    assert.equal(p.refusals[0].reason, "operator_only_target");
  }
});

test("grammar: a non-staging branch is not delegable in V1", () => {
  const p = D.parseMissionDelegation("merge it to release-2026 when checks pass");
  assert.equal(p.delegations.length, 0);
  assert.equal(p.refusals[0].reason, "target_not_delegable_in_v1");
});

test("grammar: adversarial and malformed input never delegates", () => {
  for (const text of [
    "", "   ", null, undefined,
    "merge",
    "the mission is about merging strategy documents",
    "we discussed merging to staging last week",
    "MERGE TO PRODUCTION",
    "push",
  ]) {
    const p = D.parseMissionDelegation(text);
    const merges = p.delegations.filter((d) => d.action === MERGE);
    assert.equal(merges.length, 0, `"${text}" must not delegate a merge`);
  }
});

// ----------------------------------------------------------- A-J matrix

test("A: an explicit mission authorizes all three actions with no second click", () => {
  const out = delegate(FULL);
  assert.equal(out.created, 3);
  for (const action of [PUSH, OPEN, MERGE]) {
    const c = cover(action, action === PUSH ? { branch: "promote/x" } : {});
    assert.equal(c.ok, true, `${action} should be covered: ${c.error}`);
  }
});

test("B: a moved head cannot be merged under authority given for the old content", () => {
  // The delegation never carries a SHA. Binding happens at execution against
  // the concrete request, and the trusted-host grant pins the SHA — so a moved
  // head fails the grant, not this gate. What this asserts is the division of
  // labour: delegation does not and cannot vouch for content.
  delegate(FULL);
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT })
    .find((d) => d.action_key === MERGE);
  assert.equal(rec.expected_head_sha, undefined, "a delegation must not pin a SHA itself");
  assert.ok(!("sha" in rec), "authority is a class of action, never a content promise");
});

test("C: a delegation for staging cannot authorize production", () => {
  delegate(FULL);
  for (const t of ["production", "prod", "main"]) {
    const c = cover(MERGE, { targetBranch: t });
    assert.equal(c.ok, false, `${t} must refuse`);
    assert.ok(["operator_only_target", "delegation_target_mismatch"].includes(c.error), c.error);
  }
});

test("D: authority for one repository cannot be used for another", () => {
  delegate(FULL);
  const c = cover(MERGE, { repository: "someone-else/other" });
  assert.equal(c.ok, false);
  assert.equal(c.error, "delegation_repository_mismatch");
});

test("E: a mission with no merge language keeps operator approval for merge", () => {
  const out = delegate("validate this work and push the branch");
  assert.equal(out.created, 1);
  assert.equal(cover(PUSH, { branch: "promote/x" }).ok, true);
  const c = cover(MERGE);
  assert.equal(c.ok, false);
  assert.equal(c.error, "no_delegation_for_action");
});

test("F: push delegated, merge not — push proceeds, merge still asks", () => {
  delegate("push the branch, but ask me before merging");
  assert.equal(cover(PUSH, { branch: "promote/x" }).ok, true);
  assert.equal(cover(MERGE).ok, false);
});

test("G: failing or unknown checks refuse an auto merge", () => {
  delegate(FULL);
  assert.equal(cover(MERGE, { checksGreen: false }).error, "required_checks_not_green");
  assert.equal(cover(MERGE, { checksGreen: null }).error, "required_checks_not_green");
  // Unknown is not green. A card that has not looked must not read as fine.
  assert.equal(cover(MERGE, { checksGreen: undefined }).error, "required_checks_not_green");
});

test("H: unrelated commits stop delegated authority", () => {
  delegate(FULL);
  const c = cover(MERGE, { unrelatedCommits: 1 });
  assert.equal(c.ok, false);
  assert.equal(c.error, "unrelated_commits_present");
});

test("I: expired or revoked delegation cannot satisfy approval", () => {
  delegate(FULL, { ttlMs: 1 });
  const later = Date.now() + 5000;
  const expired = D.findCoveringDelegation({
    missionId: MISSION, actionKey: MERGE, repository: REPO, targetBranch: "staging", checksGreen: true,
  }, { root: ROOT, nowMs: later });
  assert.equal(expired.ok, false);
  assert.equal(expired.error, "delegation_expired");

  rmSync(D.delegationStorePath(ROOT), { force: true });
  delegate(FULL);
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).find((d) => d.action_key === MERGE);
  D.revokeMissionDelegation(rec.delegation_id, opts);
  assert.equal(cover(MERGE).error, "delegation_revoked");
});

test("J: a consumed delegation cannot be replayed for another PR", () => {
  delegate(FULL);
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).find((d) => d.action_key === MERGE);
  const spent = D.consumeMissionDelegation(rec.delegation_id, { requestId: "gar_first", ...opts });
  assert.equal(spent.ok, true);
  assert.equal(cover(MERGE).error, "delegation_already_consumed");
  // And it cannot be spent twice.
  assert.equal(D.consumeMissionDelegation(rec.delegation_id, { requestId: "gar_second", ...opts }).ok, false);
});

// --------------------------------------------------------------- lifecycle

test("a push delegation does not license a protected-ref write", () => {
  delegate(FULL);
  for (const b of ["staging", "main", "production"]) {
    const c = cover(PUSH, { branch: b });
    assert.equal(c.ok, false, `${b} must refuse`);
    assert.equal(c.error, "protected_branch_push_refused");
  }
});

test("a merge method the mission did not delegate refuses", () => {
  delegate(FULL);
  const c = cover(MERGE, { mergeMethod: "squash" });
  assert.equal(c.ok, false);
  assert.equal(c.error, "delegation_merge_method_mismatch");
});

test("only the three V1 actions are delegable at all", () => {
  delegate(FULL);
  for (const other of [
    ACTION_TYPES.DATABASE_APPLY_MIGRATION,
    ACTION_TYPES.DATABASE_READ_CENSUS,
    ACTION_TYPES.REPOSITORY_DELETE_REMOTE_BRANCH,
    ACTION_TYPES.REPOSITORY_CLOSE_PULL_REQUEST,
  ]) {
    const c = cover(other);
    assert.equal(c.ok, false, `${other} must never be delegable`);
  }
  assert.deepEqual([...D.DELEGABLE_ACTIONS].sort(), [PUSH, OPEN, MERGE].sort());
});

test("the record is inspectable: it carries the Director's own sentence", () => {
  delegate(FULL);
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).find((d) => d.action_key === MERGE);
  assert.ok(rec.mission_clause.includes("merge"), "the delegating clause must be retained verbatim");
  assert.equal(rec.repository, REPO);
  assert.equal(rec.target_branch, "staging");
  assert.equal(rec.checks_required, true);
  assert.equal(rec.status, "unconsumed");
  assert.ok(rec.expires_at, "authority must expire");
  // Never a broad boolean.
  assert.equal(rec.can_merge, undefined);
});

test("every repository shape compares equal — the capture/compare seam", () => {
  // The registry normalizer yields `github.com/owner/repo`, governed inputs
  // carry `owner/repo`, and a raw remote is `git@github.com:owner/repo.git`.
  // Storing one and comparing another would have made EVERY delegation fail as
  // a repository mismatch — the same input-contract defect family already fixed
  // twice in this control plane.
  const shapes = [
    "ksquared-16/alloy",
    "github.com/ksquared-16/alloy",
    "git@github.com:ksquared-16/alloy.git",
    "https://github.com/ksquared-16/alloy",
  ];
  for (const stored of shapes) {
    rmSync(D.delegationStorePath(ROOT), { force: true });
    D.recordMissionDelegation({
      missionId: MISSION, laneId: "lane_cert", repository: stored, missionText: FULL, ...opts,
    });
    for (const asked of shapes) {
      const c = cover(MERGE, { repository: asked });
      assert.equal(c.ok, true, `stored ${stored} vs asked ${asked}: ${c.error}`);
    }
  }
  // A genuinely different repository still refuses.
  const other = cover(MERGE, { repository: "someone-else/other" });
  assert.equal(other.error, "delegation_repository_mismatch");
});

test("no mission scope means no delegated authority", () => {
  const out = D.recordMissionDelegation({ repository: REPO, missionText: FULL, ...opts });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_mission_or_lane");
  const c = D.findCoveringDelegation({ actionKey: MERGE, repository: REPO }, opts);
  assert.equal(c.ok, false);
  assert.equal(c.error, "no_mission_scope");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
