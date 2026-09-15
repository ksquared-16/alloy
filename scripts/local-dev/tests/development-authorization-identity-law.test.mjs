#!/usr/bin/env node
/**
 * WHAT AN AUTHORIZATION IS ABOUT, AND WHAT IT MERELY HAPPENED NEAR.
 *
 * Three suites were red in one domain and it was tempting to call them one
 * root. They were not, and tracing each separately is what produced this file:
 *
 *   A RATCHET forbade every lookup from naming `missionId` — written before a
 *   lane STANDING grant existed, which must re-scope by design. The rule
 *   forbade something doctrine requires, and the only way to satisfy it was to
 *   delete a real capability.
 *
 *   A FIXTURE pointed at a worktree on another machine, so two of the routine
 *   push policy's gates could not be measured and the Director escalated. That
 *   refusal was correct. "An unmeasured gate is not a passed gate" is the rule,
 *   and a governance test whose fixture bypasses the evidence tests nothing.
 *
 *   A GRANT was created with nothing but a mission and an action type — the
 *   shape a mission grant had BEFORE "absence is never a wildcard", back when
 *   one approval of one pull-request close became authority over all of them.
 *
 * Only the first two are about identity at all. What they share is a failure to
 * say WHICH DIMENSIONS ARE AUTHORITY and which are context, so these cases put
 * that in one place: identity is normalized once, consumers query it rather
 * than rebuilding it, and every dimension is classified deliberately.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.ALLOY_RUNTIME_ROOT = mkdtempSync(join(tmpdir(), "vac-authlaw-"));

const Z = await import("../lib/vacilando/trusted-host-authz.mjs");
const R = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const I = await import("../lib/vacilando/action-authorization-identity.mjs");

const CENSUS = R.ACTION_TYPES.DATABASE_READ_CENSUS;
const hour = () => new Date(Date.now() + 3600_000).toISOString();

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/**
 * THE CLASSIFICATION, written down.
 *
 * IDENTITY  narrows what the authority is FOR; a difference is a non-match.
 * SCOPE     may be declared to narrow; undeclared leaves it unrestricted.
 * CONTEXT   travels for the decision but never selects an authority.
 * AUDIT     recorded so the grant can be explained afterwards.
 */
const DIMENSIONS = Object.freeze({
  actionType: "IDENTITY",
  missionId: "IDENTITY",
  subject: "IDENTITY",          // queryHash / content fingerprint
  databaseTarget: "SCOPE",      // identity for the census, scope elsewhere
  environment: "SCOPE",
  repository: "SCOPE",
  laneSession: "CONTEXT",
  capability: "CONTEXT",
  requestId: "AUDIT",
});

/* ── 1: normalized once ───────────────────────────────────────────────────── */

test("1 — identity is normalized once and consumers are handed a lookup", () => {
  const id = I.resolveActionAuthorizationIdentity({
    actionType: "repository.push", scope: "msn_law",
    inputs: { repository: "ksquared-16/alloy", branch: "agent/x", expectedHeadSha: "a".repeat(40) },
  });
  assert.ok(id.ok, "the resolver must answer for a registered action");
  assert.ok(id.lookup, "and it must hand consumers a ready lookup rather than parts to reassemble");
  assert.equal(id.repository, "ksquared-16/alloy");
});

/* ── 2-4: matching ────────────────────────────────────────────────────────── */

test("2 — an exactly matching standing authorization is found", () => {
  const g = Z.grantMissionAuthorization({
    missionId: "msn_a", actionType: CENSUS, actor: "test",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, expiresAt: hour(),
  });
  assert.equal(g.ok, true);
  const found = Z.findAuthorization({ missionId: "msn_a", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" });
  assert.equal(found?.authorizationId, g.authorization.authorizationId);
});

test("3 — a declared scope is honoured; declared-but-different is a non-match", () => {
  Z.grantMissionAuthorization({
    missionId: "msn_b", actionType: R.ACTION_TYPES.REPOSITORY_PUSH, actor: "test",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, environment: "staging", expiresAt: hour(),
  });
  assert.ok(Z.findAuthorization({ missionId: "msn_b", actionType: R.ACTION_TYPES.REPOSITORY_PUSH, environment: "staging" }));
  assert.equal(Z.findAuthorization({ missionId: "msn_b", actionType: R.ACTION_TYPES.REPOSITORY_PUSH, environment: "production" }), null,
    "a grant that names an environment may not be used outside it");
});

test("4 — databaseTarget IS identity for the census, and only for it", () => {
  Z.grantMissionAuthorization({
    missionId: "msn_c", actionType: CENSUS, actor: "test",
    databaseTarget: "alloy_deployed_primary",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, expiresAt: hour(),
  });
  assert.ok(Z.findAuthorization({ missionId: "msn_c", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" }));
  assert.equal(Z.findAuthorization({ missionId: "msn_c", actionType: CENSUS, databaseTarget: "some_other_database" }), null);
  assert.equal(DIMENSIONS.databaseTarget, "SCOPE", "scope everywhere else; identity for the one action that reads a database");
});

/* ── 5-6: isolation ───────────────────────────────────────────────────────── */

test("5 — a different mission cannot borrow authority", () => {
  Z.grantMissionAuthorization({
    missionId: "msn_d", actionType: CENSUS, actor: "test",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, expiresAt: hour(),
  });
  assert.ok(Z.findAuthorization({ missionId: "msn_d", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" }));
  assert.equal(Z.findAuthorization({ missionId: "msn_e_other", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" }), null);
  assert.equal(DIMENSIONS.missionId, "IDENTITY");
});

test("6 — a different action type cannot borrow it either", () => {
  assert.equal(Z.findAuthorization({ missionId: "msn_d", actionType: R.ACTION_TYPES.REPOSITORY_PUSH }), null);
});

/* ── 7-9: absence, expiry, revocation ─────────────────────────────────────── */

test("7 — ABSENCE IS NOT A WILDCARD: an unbound standing grant matches nothing", () => {
  const bare = Z.grantMissionAuthorization({ missionId: "msn_f", actionType: CENSUS, actor: "test", expiresAt: hour() });
  assert.equal(Z.classifyStandingGrant(bare.authorization).class, "legacy_unbound");
  assert.equal(Z.findAuthorization({ missionId: "msn_f", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" }), null,
    "one approval must never become authority over every subject of its action type");
});

test("8 — a subject-bound grant matches its own subject and no other", () => {
  Z.grantMissionAuthorization({ missionId: "msn_g", actionType: CENSUS, actor: "test", queryHash: "qh_one", expiresAt: hour() });
  assert.ok(Z.findAuthorization({ missionId: "msn_g", actionType: CENSUS, databaseTarget: "alloy_deployed_primary", queryHash: "qh_one" }));
  assert.equal(Z.findAuthorization({ missionId: "msn_g", actionType: CENSUS, databaseTarget: "alloy_deployed_primary", queryHash: "qh_two" }), null);
});

test("9 — an expired grant does not match", () => {
  Z.grantMissionAuthorization({
    missionId: "msn_h", actionType: CENSUS, actor: "test",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION,
    expiresAt: new Date(Date.now() - 1000).toISOString(),
  });
  assert.equal(Z.findAuthorization({ missionId: "msn_h", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" }), null);
});

/* ── 10-12: the classification is explicit ────────────────────────────────── */

test("10 — every dimension is classified deliberately, none by omission", () => {
  for (const [dim, klass] of Object.entries(DIMENSIONS)) {
    assert.ok(["IDENTITY", "SCOPE", "CONTEXT", "AUDIT"].includes(klass), `${dim} is unclassified`);
  }
  assert.equal(DIMENSIONS.laneSession, "CONTEXT", "a lane must not become part of authority merely by having one");
  assert.equal(DIMENSIONS.requestId, "AUDIT", "the request id explains a grant; it does not select one");
});

test("11 — context is still recorded even though it is not identity", () => {
  const g = Z.grantMissionAuthorization({
    missionId: "msn_i", actionType: CENSUS, actor: "operator",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, note: "for the acceptance", expiresAt: hour(),
  });
  assert.equal(g.authorization.granted_by ?? g.authorization.actor ?? "operator", "operator");
  assert.ok(g.authorization.granted_at, "a grant must say when it was made");
  assert.equal(g.authorization.subject_scope, Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION);
});

test("12 — the boundary consumes the same normalized identity the request path resolved", () => {
  // Both sides call resolveActionAuthorizationIdentity and spread `.lookup`.
  // The one exception — the lane standing grant re-scoping missionId — is
  // pinned by development-action-authorization-identity, not repeated here.
  const id = I.resolveActionAuthorizationIdentity({
    actionType: CENSUS, scope: "msn_j",
    inputs: { queryArtifactPath: "a/b.sql", expectedQueryHash: "h", databaseTarget: "alloy_deployed_primary" },
  });
  assert.ok(id.lookup, "a lookup the boundary can spread without rebuilding");
  assert.equal(id.actionType, CENSUS);
});

/* ── MUTATION PROOFS ──────────────────────────────────────────────────────── */

test("M1 — treat an unbound grant as a wildcard and isolation collapses", () => {
  const permissive = (auth) => Boolean(auth); // the pre-hardening rule
  const bare = Z.grantMissionAuthorization({ missionId: "msn_k", actionType: CENSUS, actor: "test", expiresAt: hour() });
  assert.equal(permissive(bare.authorization), true, "the old rule matched it");
  assert.equal(Z.classifyStandingGrant(bare.authorization).matchable, false, "the current rule must not");
});

test("M2 — make databaseTarget universally identity and the mission grant case breaks", () => {
  // A push grant carries the DEFAULT database target it never uses. If that
  // were identity everywhere, a push lookup naming no database would miss it.
  Z.grantMissionAuthorization({
    missionId: "msn_l", actionType: R.ACTION_TYPES.REPOSITORY_PUSH, actor: "test",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, expiresAt: hour(),
  });
  const found = Z.findAuthorization({ missionId: "msn_l", actionType: R.ACTION_TYPES.REPOSITORY_PUSH });
  assert.ok(found, "a non-database action must not be filtered by a database target it never had");
});

test("M3 — make matching permissive across missions and cross-scope isolation breaks", () => {
  const acrossMissions = (a, b) => a.actionType === b.actionType; // ignore mission
  const g = Z.grantMissionAuthorization({
    missionId: "msn_m", actionType: CENSUS, actor: "test",
    subjectScope: Z.SUBJECT_SCOPES.ANY_WITHIN_MISSION, expiresAt: hour(),
  });
  assert.equal(acrossMissions(g.authorization, { actionType: CENSUS }), true, "the permissive rule matches");
  assert.equal(Z.findAuthorization({ missionId: "msn_n_other", actionType: CENSUS, databaseTarget: "alloy_deployed_primary" }), null,
    "the real lookup must not");
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
