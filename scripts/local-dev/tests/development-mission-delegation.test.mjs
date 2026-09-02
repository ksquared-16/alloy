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

/**
 * V2: authority is TYPED. `text` is retained only so the A-J cases still read
 * like the mission they model; it is passed as prose alongside, never parsed.
 * FULL_ACTIONS is what actually grants anything.
 */
const FULL_ACTIONS = Object.freeze([
  { action_key: PUSH },
  { action_key: OPEN, target_branch: "staging" },
  { action_key: MERGE, target_branch: "staging", checks_required: true },
]);

function delegate(actions = FULL_ACTIONS, extra = {}) {
  return D.recordMissionDelegation({
    missionId: MISSION,
    laneId: "lane_cert",
    repository: REPO,
    delegatedActions: actions,
    author: "director",
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


// The V1 prose-grammar tests are gone with the parser they tested. Prose can no
// longer grant authority at all, which is proven in
// development-mission-delegation-prose.test.mjs rather than by asserting which
// sentences the parser happened to accept.

// ----------------------------------------------------------- A-J matrix

test("A: an explicit mission authorizes all three actions with no second click", () => {
  const out = delegate();
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
  delegate();
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT })
    .find((d) => d.action_key === MERGE);
  assert.equal(rec.expected_head_sha, undefined, "a delegation must not pin a SHA itself");
  assert.ok(!("sha" in rec), "authority is a class of action, never a content promise");
});

test("C: a delegation for staging cannot authorize production", () => {
  delegate();
  for (const t of ["production", "prod", "main"]) {
    const c = cover(MERGE, { targetBranch: t });
    assert.equal(c.ok, false, `${t} must refuse`);
    assert.ok(["operator_only_target", "delegation_target_mismatch"].includes(c.error), c.error);
  }
});

test("D: authority for one repository cannot be used for another", () => {
  delegate();
  const c = cover(MERGE, { repository: "someone-else/other" });
  assert.equal(c.ok, false);
  assert.equal(c.error, "delegation_repository_mismatch");
});

test("E: a mission with no merge language keeps operator approval for merge", () => {
  const out = delegate([{ action_key: PUSH }]);
  assert.equal(out.created, 1);
  assert.equal(cover(PUSH, { branch: "promote/x" }).ok, true);
  const c = cover(MERGE);
  assert.equal(c.ok, false);
  assert.equal(c.error, "no_delegation_for_action");
});

test("F: push delegated, merge not — push proceeds, merge still asks", () => {
  delegate([{ action_key: PUSH }]);
  assert.equal(cover(PUSH, { branch: "promote/x" }).ok, true);
  assert.equal(cover(MERGE).ok, false);
});

test("G: failing or unknown checks refuse an auto merge", () => {
  delegate();
  assert.equal(cover(MERGE, { checksGreen: false }).error, "required_checks_not_green");
  assert.equal(cover(MERGE, { checksGreen: null }).error, "required_checks_not_green");
  // Unknown is not green. A card that has not looked must not read as fine.
  assert.equal(cover(MERGE, { checksGreen: undefined }).error, "required_checks_not_green");
});

test("H: unrelated commits stop delegated authority", () => {
  delegate();
  const c = cover(MERGE, { unrelatedCommits: 1 });
  assert.equal(c.ok, false);
  assert.equal(c.error, "unrelated_commits_present");
});

test("I: expired or revoked delegation cannot satisfy approval", () => {
  delegate(FULL_ACTIONS, { ttlMs: 1 });
  const later = Date.now() + 5000;
  const expired = D.findCoveringDelegation({
    missionId: MISSION, actionKey: MERGE, repository: REPO, targetBranch: "staging", checksGreen: true,
  }, { root: ROOT, nowMs: later });
  assert.equal(expired.ok, false);
  assert.equal(expired.error, "delegation_expired");

  rmSync(D.delegationStorePath(ROOT), { force: true });
  delegate();
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).find((d) => d.action_key === MERGE);
  D.revokeMissionDelegation(rec.delegation_id, opts);
  assert.equal(cover(MERGE).error, "delegation_revoked");
});

test("J: a consumed delegation cannot be replayed for another PR", () => {
  delegate();
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).find((d) => d.action_key === MERGE);
  const spent = D.consumeMissionDelegation(rec.delegation_id, { requestId: "gar_first", ...opts });
  assert.equal(spent.ok, true);
  assert.equal(cover(MERGE).error, "delegation_already_consumed");
  // And it cannot be spent twice.
  assert.equal(D.consumeMissionDelegation(rec.delegation_id, { requestId: "gar_second", ...opts }).ok, false);
});

// --------------------------------------------------------------- lifecycle

test("a push delegation does not license a protected-ref write", () => {
  delegate();
  for (const b of ["staging", "main", "production"]) {
    const c = cover(PUSH, { branch: b });
    assert.equal(c.ok, false, `${b} must refuse`);
    assert.equal(c.error, "protected_branch_push_refused");
  }
});

test("a merge method the mission did not delegate refuses", () => {
  delegate();
  const c = cover(MERGE, { mergeMethod: "squash" });
  assert.equal(c.ok, false);
  assert.equal(c.error, "delegation_merge_method_mismatch");
});

test("only the three V1 actions are delegable at all", () => {
  delegate();
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
  delegate();
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).find((d) => d.action_key === MERGE);
  assert.equal(rec.authored_by, "director", "the record must name who granted it");
  assert.equal(rec.authority_source, "structured_mission_delegation");
  assert.equal(rec.mission_clause, undefined, "V2 keeps no quoted prose as authority");
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
      missionId: MISSION, laneId: "lane_cert", repository: stored,
      delegatedActions: FULL_ACTIONS, author: "director", ...opts,
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
  const out = D.recordMissionDelegation({ repository: REPO, delegatedActions: FULL_ACTIONS, author: "director", ...opts });
  assert.equal(out.ok, false);
  assert.equal(out.error, "missing_mission_or_lane");
  const c = D.findCoveringDelegation({ actionKey: MERGE, repository: REPO }, opts);
  assert.equal(c.ok, false);
  assert.equal(c.error, "no_mission_scope");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
