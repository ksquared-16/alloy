/**
 * A worker names a KEY, never a URL.
 *
 * THE DEFECT THIS SITS ON TOP OF. A managed browser session could only be
 * minted for a slot, and a slot is a port on loopback. Three assumptions each
 * enforced that independently: validateBrowserAuthRequest refuses a non-loopback
 * base, the base is derived as http://127.0.0.1:<slotPort>, and the mint writes
 * cookies for the literal domains "localhost" and "127.0.0.1". So a governed
 * action labelled target=alloy_deployed_primary completed and VERIFIED while
 * producing cookies that could never authenticate a deployed host: the target
 * was an authorization label that never reached the session destination.
 *
 * The security property these fixtures hold is the one that must survive the
 * fix: a worker still cannot say "mint me a session for https://whatever".
 */
import test from "node:test";
import assert from "node:assert/strict";

const R = await import("../lib/vacilando/deployed-target-registry.mjs");

const AUTH_ROOT = "/Users/x/.local/state/alloy-dev/gateway/auth";

test("a known key resolves every dimension the session needs", () => {
  const out = R.resolveDeployedTarget("alloy_staging_web");
  assert.equal(out.ok, true);
  assert.equal(out.target.base_url, "https://staging.workwithalloy.com");
  assert.equal(out.target.host, "staging.workwithalloy.com");
  assert.equal(out.target.environment, "staging");
  assert.equal(out.target.qa_identity, "qa-slot1-product@example.com");
  assert.ok(out.target.trusted_env_key, "the target must name WHICH trusted env holds its credentials");
});

test("the registry stores a pointer to credentials, never a credential", () => {
  const raw = JSON.stringify(R.DEPLOYED_TARGETS);
  for (const leak of ["service_role", "anon", "eyJ", "SUPABASE_SERVICE_ROLE_KEY", "password"]) {
    assert.doesNotMatch(raw, new RegExp(leak, "i"), `the table must not contain ${leak}`);
  }
});

/* ── refusals ────────────────────────────────────────────────────────────── */

test("an unknown deployed target is refused — there is no default", () => {
  for (const k of ["", "   ", "whatever", "alloy_deployed_primary", "production", "prod"]) {
    const out = R.resolveDeployedTarget(k);
    assert.equal(out.ok, false, `"${k}" must be refused`);
    assert.equal(out.error, R.DEPLOYED_TARGET_REFUSALS.UNKNOWN_TARGET);
  }
});

test("production is absent by construction, not disabled", () => {
  // There is nothing to mis-key or accidentally enable.
  for (const k of Object.keys(R.DEPLOYED_TARGETS)) {
    assert.notEqual(R.DEPLOYED_TARGETS[k].environment, "production");
  }
  assert.deepEqual(R.DEPLOYED_TARGET_KEYS, ["alloy_staging_web"]);
});

test("a caller supplying ANY dimension of the target is refused", () => {
  for (const field of ["baseUrl", "base_url", "url", "host", "domain", "identity", "email",
    "supabaseUrl", "projectRef", "storagePath", "envSource", "cookieDomain"]) {
    const out = R.rejectCallerSuppliedTargetFields({ [field]: "https://whatever.example" });
    assert.equal(out.ok, false, `${field} must be refused`);
    assert.equal(out.error, R.DEPLOYED_TARGET_REFUSALS.CALLER_SUPPLIED_TARGET_FIELD);
    assert.match(out.detail, new RegExp(field));
  }
});

test("an arbitrary URL cannot be smuggled in as a key", () => {
  for (const k of ["https://whatever.example", "http://127.0.0.1:3011", "staging.workwithalloy.com"]) {
    assert.equal(R.resolveDeployedTarget(k).ok, false, `"${k}" is not a key`);
  }
});

test("naming only a key is accepted", () => {
  assert.equal(R.rejectCallerSuppliedTargetFields({ deployed_target: "alloy_staging_web" }).ok, true);
});

/* ── table integrity ─────────────────────────────────────────────────────── */

test("a target whose base does not match its declared host is refused", () => {
  const bad = { rogue: { key: "rogue", environment: "staging", host: "staging.workwithalloy.com",
    base_url: "https://evil.example", qa_identity: "q@e.com", trusted_env_key: "X", storage_key: "rogue" } };
  const out = R.resolveDeployedTarget("rogue", { targets: bad });
  assert.equal(out.ok, false);
  assert.equal(out.error, R.DEPLOYED_TARGET_REFUSALS.BASE_MISMATCH);
});

test("a non-https deployed base is refused — a Secure cookie cannot ride plaintext", () => {
  const bad = { plain: { key: "plain", environment: "staging", host: "staging.workwithalloy.com",
    base_url: "http://staging.workwithalloy.com", qa_identity: "q@e.com", trusted_env_key: "X", storage_key: "plain" } };
  const out = R.resolveDeployedTarget("plain", { targets: bad });
  assert.equal(out.ok, false);
  assert.equal(out.error, R.DEPLOYED_TARGET_REFUSALS.NOT_HTTPS);
});

/* ── storage isolation ───────────────────────────────────────────────────── */

test("deployed storage cannot collide with a slot session", () => {
  const p = R.deployedAuthStoragePath("alloy_staging_web", { authRoot: AUTH_ROOT });
  assert.match(p, /\/deployed\/alloy_staging_web\/storage-state\.json$/);
  // The slot sessions live at auth/slot<N>/storage-state.json. Neither path can
  // ever be produced by the other's resolver.
  assert.doesNotMatch(p, /\/slot\d+\//);
  assert.equal(R.isDeployedStoragePath(p), true);
  assert.equal(R.isDeployedStoragePath(`${AUTH_ROOT}/slot1/storage-state.json`), false);
});

test("an unknown target yields no storage path at all", () => {
  assert.equal(R.deployedAuthStoragePath("whatever", { authRoot: AUTH_ROOT }), null);
});

/* ── the project backing the target must be PROVEN, not assumed ──────────── */

test("a project match must be observed on both sides", () => {
  // Minting from the wrong project fails in one of two ways, and the second is
  // worse: it authenticates against a DIFFERENT environment that shares the
  // identity, and a tester then certifies the wrong system.
  assert.equal(R.verifyDeployedProjectMatch({ envProjectRef: "abc", observedProjectRef: null }).ok, false);
  assert.equal(R.verifyDeployedProjectMatch({ envProjectRef: null, observedProjectRef: "abc" }).ok, false);
  assert.equal(R.verifyDeployedProjectMatch({}).error, "deployed_project_unverified");
});

test("a mismatched project is refused and the detail names no value", () => {
  const out = R.verifyDeployedProjectMatch({ envProjectRef: "aaaa", observedProjectRef: "bbbb" });
  assert.equal(out.ok, false);
  assert.equal(out.error, "deployed_project_mismatch");
  assert.doesNotMatch(out.detail, /aaaa|bbbb/, "a refusal must not echo the values it compared");
});

test("a matching project passes", () => {
  const out = R.verifyDeployedProjectMatch({ envProjectRef: "Abc123", observedProjectRef: "abc123" });
  assert.equal(out.ok, true);
  assert.equal(out.project_ref, "abc123");
});

test("the project ref is extracted from a Supabase URL, and only that", () => {
  assert.equal(R.projectRefFromSupabaseUrl("https://ikaxilmwmrmbagoidedu.supabase.co"), "ikaxilmwmrmbagoidedu");
  for (const bad of ["", "not a url", "https://supabase.co", "https://x.supabase.co"]) {
    assert.equal(R.projectRefFromSupabaseUrl(bad), null, `${bad} yields no ref`);
  }
});
