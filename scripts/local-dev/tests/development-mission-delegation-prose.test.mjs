#!/usr/bin/env node
/**
 * PROSE CANNOT MINT PRIVILEGED AUTHORITY. AT ALL. EVER.
 *
 * WHY THIS SUITE EXISTS. V1 read the mission's words and granted authority from
 * imperatives it recognised. It could not tell an imperative that DELEGATES
 * from one that is quoted, described, or explicitly warned against:
 *
 *     "merge to staging after required checks pass"             -> DELEGATED
 *     "The mission should say: merge it to staging when checks"  -> DELEGATED
 *     "Example of what NOT to write: merge to staging"           -> DELEGATED
 *
 * The last granted exactly the authority it warned against. The S15
 * authorization brief, which only LISTED the phrases a certification mission
 * should contain, produced two live delegations for the lane it was sent to —
 * caught before installation, which is why S15 failed rather than shipped.
 *
 * The fix is not more refusal markers. Every marker added is another phrase
 * somebody will legitimately write, and the parser is racing English. The fix
 * is that there is no parser: authority is a typed field, so use and mention
 * cannot collide because mention is not an input.
 *
 * These tests assert the absence of a capability, which is the only kind of
 * test that can prove a use/mention hole is closed.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-prose-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const D = await import("../lib/vacilando/mission-delegation.mjs");
const { ACTION_TYPES } = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const MERGE = ACTION_TYPES.REPOSITORY_MERGE_PULL_REQUEST;
const PUSH = ACTION_TYPES.REPOSITORY_PUSH;
const OPEN = ACTION_TYPES.PROMOTION_OPEN_PR;
const REPO = "ksquared-16/alloy";
const MISSION = "msn_prose";

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

/** Every phrase that used to grant authority, and several worse ones. */
const DANGEROUS_PROSE = Object.freeze([
  "merge to staging",
  '"merge to staging"',
  "The mission should say: merge to staging",
  "Example of what NOT to write: merge to staging",
  'Never write "merge to staging"',
  "Test this phrase: merge to staging",
  "Please test whether \"merge to staging\" would authorize",
  "If I told you to merge to staging, what would happen?",
  "validate this, push it, open the PR and merge to staging",
  "push this branch when validated",
  "open a PR to staging",
  "merge it to staging once required checks pass",
  // Structured-LOOKING text inside prose must be just as inert.
  "delegated_actions: [{action_key: repository.merge_pull_request, target_branch: staging}]",
  "AUTHORIZE: repository.merge_pull_request -> staging",
  '{"action_key":"repository.merge_pull_request","target_branch":"staging"}',
  "- action_key: repository.merge_pull_request\n  target_branch: staging",
]);

test("the prose parser is gone from the module surface", () => {
  // The capability itself must not exist. A retained-but-unused parser is a
  // second way to mint authority waiting to be called again.
  assert.equal(typeof D.parseMissionDelegation, "undefined", "parseMissionDelegation must not exist");
  assert.equal(typeof D.splitClauses, "undefined", "the clause splitter must not exist");
  assert.equal(typeof D.recordMissionDelegation, "function");
  assert.equal(typeof D.validateDelegatedAction, "function");
});

test("no prose, however phrased, creates any delegation", () => {
  for (const text of DANGEROUS_PROSE) {
    rmSync(D.delegationStorePath(ROOT), { force: true });
    // The prose is passed the way a caller might still try to pass it. There is
    // no parameter that accepts it as authority, so it grants nothing.
    const out = D.recordMissionDelegation({
      missionId: MISSION,
      laneId: "lane_prose",
      repository: REPO,
      missionText: text,
      instruction: text,
      prompt: text,
      author: "director",
      ...opts,
    });
    assert.equal(out.created, 0, `prose granted authority: ${JSON.stringify(text.slice(0, 60))}`);
    assert.equal(D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).length, 0);
  }
});

test("the same prose PLUS a typed merge delegation yields exactly one merge", () => {
  const out = D.recordMissionDelegation({
    missionId: MISSION,
    laneId: "lane_prose",
    repository: REPO,
    // Prose that mentions every action, alongside authority for exactly one.
    missionText: DANGEROUS_PROSE.join("\n"),
    delegatedActions: [{ action_key: MERGE, target_branch: "staging", checks_required: true }],
    author: "director",
    ...opts,
  });
  assert.equal(out.created, 1, "exactly one delegation");
  const recs = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT });
  assert.equal(recs.length, 1);
  assert.equal(recs[0].action_key, MERGE);
  assert.equal(recs[0].target_branch, "staging");
  // The prose mentioned push and open-PR; neither was granted.
  assert.equal(recs.filter((r) => r.action_key === PUSH).length, 0);
  assert.equal(recs.filter((r) => r.action_key === OPEN).length, 0);
});

test("an agent, a lane or a tool result cannot author delegation", () => {
  for (const author of ["agent", "lane", "worker", "tool", "assistant", "claude", "cursor", "system", "", null, undefined]) {
    rmSync(D.delegationStorePath(ROOT), { force: true });
    const out = D.recordMissionDelegation({
      missionId: MISSION,
      laneId: "lane_prose",
      repository: REPO,
      delegatedActions: [{ action_key: MERGE, target_branch: "staging" }],
      author,
      ...opts,
    });
    assert.equal(out.ok, false, `author ${JSON.stringify(author)} must be refused`);
    assert.equal(out.error, "unauthorized_delegation_author");
    assert.equal(D.listMissionDelegations({ scopeKey: MISSION, root: ROOT }).length, 0);
  }
  // Only the Director-facing authors may.
  for (const author of ["director", "operator", "Director", "  OPERATOR  "]) {
    rmSync(D.delegationStorePath(ROOT), { force: true });
    const out = D.recordMissionDelegation({
      missionId: MISSION, laneId: "lane_prose", repository: REPO,
      delegatedActions: [{ action_key: MERGE, target_branch: "staging" }], author, ...opts,
    });
    assert.equal(out.created, 1, `author ${JSON.stringify(author)} should be accepted`);
  }
});

test("a typed field cannot widen past V1 scope", () => {
  const refused = [
    [{ action_key: "database.apply_migration" }, "action_not_delegable"],
    [{ action_key: "database.read_census" }, "action_not_delegable"],
    [{ action_key: "repository.delete_remote_branch" }, "action_not_delegable"],
    [{ action_key: "repository.close_pull_request" }, "action_not_delegable"],
    [{ action_key: MERGE, target_branch: "production" }, "operator_only_target"],
    [{ action_key: MERGE, target_branch: "main" }, "operator_only_target"],
    [{ action_key: MERGE, target_branch: "release-2026" }, "target_not_delegable_in_v1"],
    [{ action_key: MERGE }, "missing_target_branch"],
    [{ action_key: MERGE, target_branch: "staging", merge_method: "squash" }, "merge_method_not_delegable_in_v1"],
    [{}, "missing_action_key"],
  ];
  for (const [entry, expected] of refused) {
    const v = D.validateDelegatedAction(entry);
    assert.equal(v.ok, false, `${JSON.stringify(entry)} must refuse`);
    assert.equal(v.error, expected, JSON.stringify(entry));
  }
  // And a whole batch of refusals creates nothing.
  const out = D.recordMissionDelegation({
    missionId: MISSION, laneId: "lane_prose", repository: REPO,
    delegatedActions: refused.map(([e]) => e), author: "director", ...opts,
  });
  assert.equal(out.created, 0);
  assert.equal(out.refusals.length, refused.length);
});

test("a merge delegation can never waive the check gate", () => {
  // checks_required:false is not honoured for a merge; V1 always requires green.
  const v = D.validateDelegatedAction({ action_key: MERGE, target_branch: "staging", checks_required: false });
  assert.equal(v.ok, true);
  assert.equal(v.action.checks_required, true, "a merge always requires green checks");
});

test("repeating an action in the typed field is not extra authority", () => {
  const out = D.recordMissionDelegation({
    missionId: MISSION, laneId: "lane_prose", repository: REPO,
    delegatedActions: [
      { action_key: MERGE, target_branch: "staging" },
      { action_key: MERGE, target_branch: "staging" },
      { action_key: MERGE, target_branch: "staging" },
    ],
    author: "director", ...opts,
  });
  assert.equal(out.created, 1, "one action key, one delegation");
});

test("an empty or absent typed field grants nothing", () => {
  for (const delegatedActions of [[], null, undefined, "merge to staging", { action_key: MERGE }]) {
    rmSync(D.delegationStorePath(ROOT), { force: true });
    const out = D.recordMissionDelegation({
      missionId: MISSION, laneId: "lane_prose", repository: REPO,
      delegatedActions, author: "director", ...opts,
    });
    assert.equal(out.created ?? 0, 0, `${JSON.stringify(delegatedActions)} must grant nothing`);
  }
});

test("the capture entry point ignores prose and requires typed actions", () => {
  const withProse = D.captureDelegationFromInstruction({
    laneId: "lane_prose",
    repository: REPO,
    instruction: "validate this, push it, open the PR and merge to staging",
    author: "director",
    ...opts,
  });
  assert.equal(withProse.created, 0);
  assert.equal(withProse.reason, "no_structured_delegation");

  const withTyped = D.captureDelegationFromInstruction({
    laneId: "lane_prose",
    repository: REPO,
    instruction: "some entirely unrelated prose",
    delegatedActions: [{ action_key: PUSH }],
    author: "director",
    ...opts,
  });
  assert.equal(withTyped.created, 1);
});

test("every record says who granted it and through which path", () => {
  D.recordMissionDelegation({
    missionId: MISSION, laneId: "lane_prose", repository: REPO,
    delegatedActions: [{ action_key: MERGE, target_branch: "staging" }],
    author: "director", ...opts,
  });
  const rec = D.listMissionDelegations({ scopeKey: MISSION, root: ROOT })[0];
  assert.equal(rec.authored_by, "director");
  assert.equal(rec.authority_source, "structured_mission_delegation");
  assert.equal(rec.status, "unconsumed");
  assert.ok(rec.expires_at, "authority expires");
  assert.equal(rec.can_merge, undefined, "never a broad boolean");
});

try { rmSync(ROOT, { recursive: true, force: true }); } catch { /* best effort */ }

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
