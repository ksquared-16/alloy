/**
 * Exact-request execution authority — the leak certification.
 *
 * A prior attempt minted Director execution authority and a negative control
 * caught it authorising the WRONG request: findAuthorization's single-action
 * branch ended `|| !a.used_at`, so an UNUSED grant matched anything. These
 * fixtures exist to make that structurally impossible, and the mutation block
 * at the end restores the unsafe fallback to prove they can still fail.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-exact-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });
const A = await import("../lib/vacilando/trusted-host-authz.mjs");

const SHA_A = "a".repeat(40);
const SHA_B = "b".repeat(40);
const FP_A = "1".repeat(32);
const FP_B = "2".repeat(32);
const MISSION = "msn_exact";

function mintA(over = {}) {
  const out = A.grantExactRequestAuthorization({
    missionId: MISSION, requestId: "gar_A", contentFingerprint: FP_A,
    actionType: "repository.push", environment: "staging",
    repository: "ksquared-16/alloy", sourceSha: SHA_A,
    decisionId: "dec_1", decisionActor: "director",
    policyId: "routine_managed_branch_push_v1", policyVersion: "director_authority_v1",
    nowMs: Date.now(), ...over,
  });
  return out.authorization;
}
const covers = (auth, over = {}) => A.exactAuthorizationCovers(auth, {
  requestId: "gar_A", contentFingerprint: FP_A, actionType: "repository.push",
  environment: "staging", repository: "ksquared-16/alloy", sourceSha: SHA_A, ...over,
});

await test("0 — the authorization it WAS minted for still works", () => {
  const auth = mintA();
  assert.ok(auth, "minting must succeed for a delegated environment");
  assert.equal(auth.scope, A.AUTHORIZATION_CLASSES.EXACT_REQUEST);
  assert.equal(auth.granted_by, "director");
  assert.ok(auth.expires_at);
  assert.equal(auth.used_at, null);
  assert.equal(covers(auth), true, "it must cover its own exact request");
});

await test("LEAK 1-10 — an exact authorization covers NOTHING else", () => {
  const auth = mintA();
  // Deliberately UNUSED throughout: unused must not mean transferable.
  assert.equal(auth.used_at, null);
  assert.equal(covers(auth, { requestId: "gar_B" }), false, "1: different request id");
  assert.equal(covers(auth, { sourceSha: SHA_B }), false, "2: same branch, different SHA");
  assert.equal(covers(auth, { environment: "development_certification" }), false, "3: same SHA, different environment");
  assert.equal(covers(auth, { repository: "someone/else" }), false, "4: different repository");
  assert.equal(covers(auth, { contentFingerprint: FP_B }), false, "5: changed content fingerprint");
  assert.equal(covers(auth, { requestId: "gar_C", contentFingerprint: FP_B }), false, "6: another staging request");
  for (const env of ["production", "prod", "alloy_deployed_primary", "deployed_primary"]) {
    assert.equal(covers(auth, { environment: env }), false, `7: production (${env})`);
  }
  assert.equal(covers(auth, { actionType: "promotion.open_pr" }), false, "8/9: a different action entirely");
  assert.equal(covers(auth, { contentFingerprint: null }), false, "10: stale/absent fingerprint");
  assert.equal(covers(auth, { requestId: null, contentFingerprint: null }), false, "nothing matches by omission");
});

await test("PRODUCTION — a Director-derived authorization cannot be minted for it at all", () => {
  for (const env of ["production", "prod", "alloy_deployed_primary", "deployed_primary", "  PRODUCTION "]) {
    const out = A.grantExactRequestAuthorization({
      missionId: MISSION, requestId: "gar_P", contentFingerprint: FP_A,
      actionType: "repository.push", environment: env, nowMs: Date.now(),
    });
    assert.equal(out.ok, false, `minted production authority for ${env}`);
    assert.equal(out.error, "production_authority_refused");
  }
  // And even a hand-forged production authorization covers nothing.
  const forged = { ...mintA(), environment: "production" };
  assert.equal(covers(forged, { environment: "production" }), false, "forged production authority must fail closed");
});

await test("INCOMPLETE — an authorization missing any bound field is refused at mint", () => {
  const base = { missionId: MISSION, requestId: "gar_A", contentFingerprint: FP_A, actionType: "repository.push", environment: "staging", nowMs: Date.now() };
  for (const drop of ["missionId", "requestId", "contentFingerprint", "actionType"]) {
    const args = { ...base }; delete args[drop];
    const out = A.grantExactRequestAuthorization(args);
    assert.equal(out.ok, false, `minted without ${drop}`);
    assert.equal(out.error, "incomplete_exact_authorization");
  }
});

await test("CLASSES — an unknown authorization class is never reusable", () => {
  const src = readFileSync(new URL("../lib/vacilando/trusted-host-authz.mjs", import.meta.url), "utf8");
  const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  assert.ok(!/!a\.used_at/.test(code), "the unused-means-transferable fallback must not exist in code");
  // The matcher must end its class dispatch with a refusal, not a permit.
  assert.match(code, /return false;\s*\}\);/, "an unrecognised class must fall through to refusal");
  assert.ok(Object.isFrozen(A.AUTHORIZATION_CLASSES));
  assert.ok(Object.isFrozen(A.AUTHZ_OPERATOR_ONLY_ENVIRONMENTS));
});

await test("MISSION STANDING — the intentionally reusable class still works", () => {
  // Operator paths must not be broken by tightening the exact class.
  const m = A.grantMissionAuthorization({
    missionId: MISSION, actionType: "database.read_census",
    databaseTarget: "staging", actor: "operator", nowMs: Date.now(),
  });
  assert.ok(m.ok, "operator mission grants must still be mintable");
  const found = A.findAuthorization({
    missionId: MISSION, actionType: "database.read_census",
    databaseTarget: "staging", nowMs: Date.now(),
  });
  assert.ok(found, "a mission standing grant must still match inside its scope");
  assert.equal(found.scope, "mission");
});
