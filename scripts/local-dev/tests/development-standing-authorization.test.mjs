/**
 * STANDING AUTHORITY — the redundant-ask certification.
 *
 * Over a measured 17-hour sample of 200 governed requests, 173 required an
 * operator click and 153 of those were a REPEAT ask for one of only 20
 * (lane, capability) pairs. The store held 303 grants: 300 CONSUMED, and not
 * one minted standing. The authorization model already had MISSION_STANDING
 * and an explicit subject scope; the mint site never used them, and half the
 * requests had no authority scope at all so they could not have inherited one
 * anyway.
 *
 * These fixtures certify the fix in BOTH directions. The positive cases prove
 * a repeated safe capability stops asking. The negative cases matter more:
 * they prove the same change did not hand a lane authority over a merge, a
 * migration, the deployed primary, another lane, another repository or
 * another environment. A reduction in asks that also reduced the boundaries
 * would not be an improvement.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-standing-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
const A = await import("../lib/vacilando/trusted-host-authz.mjs");

const LANE = "lane_9b9082778292";
const REPO = "ksquared-16/alloy";

function mintStanding(over = {}) {
  const out = A.grantMissionAuthorization({
    missionId: LANE,
    actionType: "repository.push",
    actor: "operator",
    subjectScope: A.SUBJECT_SCOPES.ANY_WITHIN_MISSION,
    repository: REPO,
    environment: "staging",
    nowMs: Date.now(),
    ...over,
  });
  return out.authorization;
}
const find = (over = {}) => A.findAuthorization({
  missionId: LANE, actionType: "repository.push",
  repository: REPO, environment: "staging",
  queryHash: "sha_second_push", nowMs: Date.now(), ...over,
});

await test("the allowlist is the three capabilities the evidence justifies", () => {
  assert.deepEqual([...A.STANDING_ELIGIBLE_ACTIONS].sort(), [
    "environment.restore_qa_session",
    "promotion.open_pr",
    "repository.push",
  ]);
});

await test("eligibility — safe and repeatable in, trust boundaries out", () => {
  assert.equal(A.standingGrantEligible("repository.push"), true);
  assert.equal(A.standingGrantEligible("promotion.open_pr"), true);
  assert.equal(A.standingGrantEligible("environment.restore_qa_session"), true);
  // Each of these was asked repeatedly in the sample. Volume is not an
  // argument against a boundary.
  assert.equal(A.standingGrantEligible("repository.merge_pull_request"), false, "promotion authority");
  assert.equal(A.standingGrantEligible("database.apply_migration"), false, "production mutation");
  assert.equal(A.standingGrantEligible("repository.delete_remote_branch"), false, "destructive");
  assert.equal(A.standingGrantEligible("environment.assign_qa_identity_access"), false, "identity and access");
  assert.equal(A.standingGrantEligible("unknown.capability"), false, "unknown is never eligible");
});

await test("an operator-only environment defeats eligibility outright", () => {
  // database.read_census reads the deployed primary. Read-only is not the same
  // as inside the boundary.
  for (const env of ["production", "prod", "alloy_deployed_primary", "deployed_primary", "PRODUCTION"]) {
    assert.equal(A.standingGrantEligible("repository.push", { environment: env }), false, env);
  }
  assert.equal(A.standingGrantEligible("database.read_census", { environment: "alloy_deployed_primary" }), false);
});

await test("THE POINT — a second identical push is covered without asking again", () => {
  const auth = mintStanding();
  assert.ok(auth, "a lane-scoped standing grant must mint");
  assert.equal(auth.scope, A.AUTHORIZATION_CLASSES.MISSION_STANDING);
  assert.equal(auth.subject_scope, A.SUBJECT_SCOPES.ANY_WITHIN_MISSION);
  assert.equal(A.classifyStandingGrant(auth).class, "explicit_wildcard");
  // A DIFFERENT subject — the next commit on the same branch — is the exact
  // case that used to re-ask.
  const found = find({ queryHash: "sha_a_later_commit" });
  assert.equal(found?.authorizationId, auth.authorizationId);
  // And again. Standing means standing, not single-use.
  assert.ok(find({ queryHash: "sha_a_third_commit" }), "it must not be consumed by use");
});

await test("LEAK — the standing grant covers nothing beyond its declared scope", () => {
  mintStanding();
  assert.equal(find({ missionId: "lane_someone_else" }), null, "another lane");
  assert.equal(find({ repository: "someone/else" }), null, "another repository");
  assert.equal(find({ environment: "production" }), null, "another environment");
  assert.equal(find({ actionType: "repository.merge_pull_request" }), null, "another capability");
  assert.equal(find({ actionType: "database.apply_migration" }), null, "a migration");
  assert.equal(find({ actionType: "repository.delete_remote_branch" }), null, "a deletion");
});

await test("a merge is never reusable, even if one were minted standing by mistake", () => {
  // Defence in depth: standingGrantEligible already refuses to mint this. If a
  // future edit routed it anyway, the matcher must still refuse it.
  A.grantMissionAuthorization({
    missionId: LANE, actionType: "repository.merge_pull_request",
    subjectScope: A.SUBJECT_SCOPES.ANY_WITHIN_MISSION,
    repository: REPO, environment: "staging", actor: "operator", nowMs: Date.now(),
  });
  assert.equal(
    A.findAuthorization({
      missionId: LANE, actionType: "repository.merge_pull_request",
      repository: REPO, environment: "staging",
      queryHash: "some_other_head_sha", nowMs: Date.now(),
    }),
    null,
    "a merge must stay bound to one exact head SHA",
  );
});

await test("a grant is revocable and it expires", () => {
  const auth = mintStanding();
  assert.ok(auth.expires_at, "an unbounded-in-time standing grant is not bounded at all");
  assert.ok(Date.parse(auth.expires_at) > Date.now());
  assert.equal(find({ nowMs: Date.parse(auth.expires_at) + 1000 }), null, "expired grants stop matching");
  A.revokeAuthorization?.(LANE, auth.authorizationId, { nowMs: Date.now() });
});

await test("absence is still never a wildcard — an undeclared scope stays unusable", () => {
  const legacy = A.grantMissionAuthorization({
    missionId: "lane_legacy", actionType: "repository.push",
    actor: "operator", nowMs: Date.now(),
  }).authorization;
  assert.equal(A.classifyStandingGrant(legacy).class, "legacy_unbound");
  assert.equal(
    A.findAuthorization({ missionId: "lane_legacy", actionType: "repository.push", queryHash: "anything", nowMs: Date.now() }),
    null,
    "a grant that declared no subject binding must not match by omission",
  );
});

await test("REGRESSION — a repository is not an owner", () => {
  // The first implementation filed standing grants under the same scope the
  // ordinary lookup uses, which falls back to `authority.repository_id`. A
  // certification caught it: a brand-new lane auto-executed a push on
  // authority nobody had given it, because a SIBLING lane on the same
  // repository had been approved once. A shared resource cannot hold
  // authority on behalf of everything that shares it.
  A.grantMissionAuthorization({
    missionId: "repo_alloy", actionType: "repository.push",
    subjectScope: A.SUBJECT_SCOPES.ANY_WITHIN_MISSION,
    repository: REPO, environment: "staging", actor: "operator", nowMs: Date.now(),
  });
  assert.equal(
    A.findAuthorization({
      missionId: "lane_a_different_lane", actionType: "repository.push",
      repository: REPO, environment: "staging", queryHash: "any", nowMs: Date.now(),
    }),
    null,
    "a repository-scoped grant must not reach a lane",
  );
});
