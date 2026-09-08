/**
 * Two destination classes, and neither can be mistaken for the other.
 *
 * validateBrowserAuthRequest is untouched: slot-derived, loopback-only, and it
 * still refuses a non-loopback base. Widening it would have meant the one
 * function guaranteeing "a slot session is a loopback session" no longer
 * guaranteed it, and every existing caller would have inherited the looser rule
 * silently. Deployed targets get their own validator instead.
 *
 * The failure being designed out is a loopback session presented as deployed
 * proof. Its mirror — deployed storage satisfying a local check — is equally
 * wrong, so both directions are asserted.
 */
import test from "node:test";
import assert from "node:assert/strict";

const A = await import("../lib/vacilando/browser-auth.mjs");
const R = await import("../lib/vacilando/deployed-target-registry.mjs");

const KEY = "alloy_staging_web";
const AUTH = "/Users/x/.local/state/alloy-dev/gateway/auth";

/* ── deployed class ──────────────────────────────────────────────────────── */

test("a registry key resolves the whole destination", () => {
  const v = A.validateDeployedBrowserAuthRequest({ deployed_target: KEY });
  assert.equal(v.ok, true);
  assert.equal(v.destination_class, "deployed_target");
  assert.equal(v.base_url, "https://staging.workwithalloy.com");
  assert.equal(v.host, "staging.workwithalloy.com");
  assert.equal(v.expected_identity, "qa-slot1-product@example.com");
  assert.ok(v.trusted_env_key);
});

test("an unknown target is refused", () => {
  for (const k of ["nope", "", "alloy_deployed_primary", "production"]) {
    const v = A.validateDeployedBrowserAuthRequest({ deployed_target: k });
    assert.equal(v.ok, false, `${k} must be refused`);
  }
});

test("an arbitrary URL cannot be smuggled past the key", () => {
  for (const f of ["baseUrl", "base_url", "url", "host", "domain", "supabaseUrl", "projectRef", "storagePath"]) {
    const v = A.validateDeployedBrowserAuthRequest({ deployed_target: KEY, [f]: "https://evil.example" });
    assert.equal(v.ok, false, `${f} must be refused`);
    assert.equal(v.error, R.DEPLOYED_TARGET_REFUSALS.CALLER_SUPPLIED_TARGET_FIELD);
  }
});

test("a deployed target may never resolve to loopback", () => {
  const loopback = { l: { key: "l", environment: "staging", host: "127.0.0.1",
    base_url: "https://127.0.0.1", qa_identity: "q@e.com", trusted_env_key: "X", storage_key: "l" } };
  const v = A.validateDeployedBrowserAuthRequest({ deployed_target: "l" }, {
    resolveTarget: (k) => R.resolveDeployedTarget(k, { targets: loopback }),
    rejectCallerFields: () => ({ ok: true }),
  });
  assert.equal(v.ok, false, "a deployed proof must not be satisfiable by the local dev server");
});

test("a target naming no managed identity is refused", () => {
  const anon = { a: { key: "a", environment: "staging", host: "s.example",
    base_url: "https://s.example", qa_identity: "", trusted_env_key: "X", storage_key: "a" } };
  const v = A.validateDeployedBrowserAuthRequest({ deployed_target: "a" }, {
    resolveTarget: (k) => R.resolveDeployedTarget(k, { targets: anon }),
    rejectCallerFields: () => ({ ok: true }),
  });
  assert.equal(v.ok, false);
  assert.match(String(v.detail), /no silent fallback account/);
});

/* ── the two classes cannot substitute for each other ────────────────────── */

test("local storage cannot prove a deployed session", () => {
  const out = A.assertStorageMatchesDestination({
    destinationClass: "deployed_target", storagePath: `${AUTH}/slot1/storage-state.json`,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "local_storage_cannot_prove_deployed");
});

test("deployed storage cannot prove a local session", () => {
  const out = A.assertStorageMatchesDestination({
    destinationClass: "local_slot", storagePath: `${AUTH}/deployed/${KEY}/storage-state.json`,
  });
  assert.equal(out.ok, false);
  assert.equal(out.error, "deployed_storage_cannot_prove_local");
});

test("each class accepts only its own storage", () => {
  assert.equal(A.assertStorageMatchesDestination({
    destinationClass: "deployed_target", storagePath: `${AUTH}/deployed/${KEY}/storage-state.json` }).ok, true);
  assert.equal(A.assertStorageMatchesDestination({
    destinationClass: "local_slot", storagePath: `${AUTH}/slot1/storage-state.json` }).ok, true);
});

test("target A cannot reuse target B's storage path", () => {
  const a = R.deployedAuthStoragePath(KEY, { authRoot: AUTH });
  const other = { b: { key: "b", environment: "staging", host: "s.example",
    base_url: "https://s.example", qa_identity: "q@e.com", trusted_env_key: "X", storage_key: "b" } };
  const resolved = R.resolveDeployedTarget("b", { targets: other });
  assert.equal(resolved.ok, true);
  const b = `${AUTH}/deployed/${resolved.target.storage_key}/storage-state.json`;
  assert.notEqual(a, b, "two targets must not share one storage path");
});

/* ── local class is untouched ────────────────────────────────────────────── */

test("the local validator still refuses a non-loopback base", () => {
  const lane = { lane_id: "lane_x", binding: { worktree_path: "/w" } };
  const v = A.validateBrowserAuthRequest({
    lane, slot: 1, baseUrl: "https://staging.workwithalloy.com", expectedIdentity: "q@e.com",
  });
  assert.equal(v.ok, false, "widening this function would have loosened every existing caller");
  assert.equal(v.error, A.BROWSER_AUTH_REFUSALS.NON_LOOPBACK);
});

test("the local validator still produces a loopback slot session", () => {
  const lane = { lane_id: "lane_x", binding: { worktree_path: "/w" } };
  const v = A.validateBrowserAuthRequest({ lane, slot: 1, expectedIdentity: "qa-slot1-product@example.com" });
  assert.equal(v.ok, true);
  assert.equal(A.isLoopbackBase(v.base_url), true);
  assert.equal(A.destinationClassOf(v), "local_slot");
});

test("the local validator still refuses a missing identity", () => {
  const lane = { lane_id: "lane_x", binding: { worktree_path: "/w" } };
  assert.equal(A.validateBrowserAuthRequest({ lane, slot: 1 }).ok, false);
});

/* ── positive control ────────────────────────────────────────────────────── */

test("POSITIVE CONTROL — an always-ok implementation fails this suite", () => {
  // A broken implementation that returns verified for everything must not be
  // able to pass. If any of these ever start succeeding, the guard is gone.
  const alwaysOk = () => ({ ok: true });
  const v = A.validateDeployedBrowserAuthRequest({ deployed_target: "definitely-not-a-target" }, {
    resolveTarget: (k) => R.resolveDeployedTarget(k),
    rejectCallerFields: alwaysOk,
  });
  assert.equal(v.ok, false, "an unknown key must still fail even when field-rejection is stubbed open");
  // And storage substitution must still be caught with no stubbing available.
  assert.equal(A.assertStorageMatchesDestination({
    destinationClass: "deployed_target", storagePath: `${AUTH}/slot1/storage-state.json` }).ok, false);
});
