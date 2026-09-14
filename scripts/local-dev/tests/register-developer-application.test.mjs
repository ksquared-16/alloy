/**
 * `platform.register_developer_application` — the contract a caller meets before
 * any privileged connection is opened.
 *
 * The invariants themselves belong to the SQL function and are certified against
 * a real database in `web/tests/platform/developerPlatform`. What is proven HERE
 * is everything that must be refused without touching one: the V1 ownership
 * decision, the closed vocabularies, and the named database target. A refusal
 * that only the database can make is a refusal that costs a round trip to a
 * deployed system, and — for a reserved ownership mode — a refusal that arrives
 * after the operator has already approved the request.
 */
import test from "node:test";
import assert from "node:assert/strict";

import {
  RESERVED_OWNERSHIP_MODES,
  V1_OWNERSHIP_MODE,
  buildRegistrationSql,
  validateRegisterDeveloperApplicationInputs as validate,
} from "../lib/vacilando/trusted-host-register-application.mjs";
import { ACTION_TYPES, getActionDefinition, listRegisteredActions } from "../lib/vacilando/trusted-host-action-registry.mjs";

const base = {
  slug: "alloy-cert-sandbox",
  name: "Alloy Certification Sandbox",
  publisher: "alloy-platform",
  databaseTarget: "alloy_deployed_primary",
};

await test("RA1 — a minimal alloy_managed registration validates and normalizes its defaults", () => {
  const v = validate(base);
  assert.equal(v.ok, true, v.detail);
  assert.equal(v.normalized.ownershipMode, V1_OWNERSHIP_MODE);
  // Defaults are the certification shape: a sandbox application nobody can see
  // but the operator who installs it.
  assert.equal(v.normalized.applicationEnvironment, "sandbox");
  assert.equal(v.normalized.distributionMode, "private");
  assert.equal(v.normalized.status, "active");
});

await test("RA2 — tenant_private is refused BY NAME, not silently coerced", () => {
  const v = validate({ ...base, ownershipMode: "tenant_private" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "reserved_ownership_mode");
  assert.match(v.detail, /alloy_managed only/);
  assert.match(v.detail, /tenant_private/);
});

await test("RA3 — partner_managed is refused the same way", () => {
  const v = validate({ ...base, ownershipMode: "partner_managed" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "reserved_ownership_mode");
});

await test("RA4 — an ownership mode outside the schema is a different refusal", () => {
  // Distinguished from RESERVED on purpose: "not yet" and "no such thing" are
  // different answers, and only one of them is a product decision to revisit.
  const v = validate({ ...base, ownershipMode: "community_managed" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "unsupported_ownership_mode");
  assert.equal(RESERVED_OWNERSHIP_MODES.includes("community_managed"), false);
});

await test("RA5 — production is registrable, and unknown environments are not", () => {
  assert.equal(validate({ ...base, applicationEnvironment: "production" }).ok, true);
  const v = validate({ ...base, applicationEnvironment: "staging" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "unsupported_environment");
});

await test("RA6 — status and distribution take only their schema vocabularies", () => {
  assert.equal(validate({ ...base, status: "disabled" }).ok, true);
  assert.equal(validate({ ...base, distributionMode: "listed" }).ok, true);
  assert.equal(validate({ ...base, status: "approved" }).code, "unsupported_status");
  assert.equal(validate({ ...base, distributionMode: "public" }).code, "unsupported_distribution_mode");
});

await test("RA7 — the database is named, never assumed", () => {
  // The census learned this the hard way: a defaulted target reads the deployed
  // primary in silence. A registration WRITES, so the same silence is worse.
  assert.equal(validate({ ...base, databaseTarget: "" }).code, "missing_database_target");
  assert.equal(validate({ ...base, databaseTarget: "production" }).code, "wrong_database_target");
  assert.equal(validate({ ...base, databaseTarget: "certification" }).ok, true);
});

await test("RA8 — an application key must be a key, not a sentence", () => {
  assert.equal(validate({ ...base, slug: "Alloy Cert" }).code, "invalid_application_key");
  assert.equal(validate({ ...base, slug: "a" }).code, "invalid_application_key");
  assert.equal(validate({ ...base, slug: "" }).code, "missing_application_key");
  assert.equal(validate({ ...base, name: "" }).code, "missing_name");
  assert.equal(validate({ ...base, publisher: "" }).code, "missing_publisher");
});

await test("RA9 — the statement is built from values, and a quote cannot end it", () => {
  const sql = buildRegistrationSql({
    slug: "cert-app", name: "O'Brien Tools", publisher: "alloy-platform",
    ownershipMode: "alloy_managed", applicationEnvironment: "sandbox",
    distributionMode: "private", status: "active", registeredBy: null,
  });
  assert.match(sql, /^SELECT public\.register_developer_application\(/);
  assert.match(sql, /'O''Brien Tools'/);
  // No caller-supplied SQL reaches the database: one call, nine arguments.
  assert.equal(sql.includes(";"), false);
  assert.match(sql, /, NULL, '\{\}'::jsonb\) AS result$/);
});

await test("RA10 — the action is registered as a privileged write with its own validator", () => {
  const key = ACTION_TYPES.PLATFORM_REGISTER_DEVELOPER_APPLICATION;
  assert.ok(listRegisteredActions().some((a) => a.actionType === key), "action must be registered");
  const def = getActionDefinition(key);
  assert.equal(def.riskClass, "privileged_write");
  assert.equal(typeof def.validateInputs, "function");
  // A registration is an identity in a catalog. An automatic second attempt is
  // how two near-identical applications appear while nobody is watching.
  assert.equal(def.retry.maxAttempts, 1);
  // It consumes no artifact, so it must not be declared as artifact-bearing.
  assert.equal(def.requiresArtifactRef, false);
});

await test("RA11 — registration creates an identity and nothing else", () => {
  // The evidence schema is the promise the handoff reads. An installation or a
  // credential appearing here would mean the action had started doing the
  // product flow's job, which is exactly what Surfaces must certify instead.
  const def = getActionDefinition(ACTION_TYPES.PLATFORM_REGISTER_DEVELOPER_APPLICATION);
  assert.ok(def.evidenceSchema.includes("application_id"));
  assert.equal(def.evidenceSchema.some((e) => /installation|credential/.test(e)), false);
});
