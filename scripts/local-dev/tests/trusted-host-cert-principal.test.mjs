#!/usr/bin/env node
/**
 * Staging certification principal — lookup, ensure, bind, rotate, revoke.
 * Isolated runtime only. Does not print secrets.
 */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cert-principal-"));
process.env.ALLOY_RUNTIME_ROOT = ROOT;
mkdirSync(join(ROOT, "vacilando"), { recursive: true });

const {
  STAGING_CERT_PRINCIPAL_EMAIL,
  STAGING_CERT_PRINCIPAL_LABEL,
  validateEnsureCertificationPrincipalInputs,
  applyEnsureCertificationPrincipal,
  writeCertificationPrincipalBinding,
  readCertificationPrincipalBinding,
  overlayCertificationPrincipalBinding,
  payloadContainsPrincipalSecrets,
  principalPublicId,
} = await import("../lib/vacilando/trusted-host-cert-principal.mjs");
const { resolveCertificationPrincipal } = await import("../lib/vacilando/trusted-host-certify-app.mjs");

let passed = 0;
let failed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    process.stdout.write(`ok  - ${name}\n`);
  } catch (err) {
    failed += 1;
    process.stdout.write(`FAIL - ${name} :: ${err.message}\n`);
  }
}

function normalized(extra = {}) {
  const v = validateEnsureCertificationPrincipalInputs({
    environment: "staging",
    suite_key: "access_identity_v2",
    mode: "ensure",
    ...extra,
  });
  assert.equal(v.ok, true, v.detail || v.code);
  return v.normalized;
}

const secret = "already-bound-secret-value";

test("production target is rejected", () => {
  const v = validateEnsureCertificationPrincipalInputs({ environment: "production" });
  assert.equal(v.ok, false);
  assert.equal(v.code, "production_target_rejected");
});

test("arbitrary auth commands are rejected", () => {
  const v = validateEnsureCertificationPrincipalInputs({
    environment: "staging",
    sql: "delete from auth.users",
  });
  assert.equal(v.ok, false);
  assert.equal(v.code, "arbitrary_command_rejected");
});

test("existing principal + valid binding does not recreate or rotate", () => {
  writeCertificationPrincipalBinding(ROOT, {
    email: STAGING_CERT_PRINCIPAL_EMAIL,
    password: secret,
  });
  let created = 0;
  let rotated = 0;
  const out = applyEnsureCertificationPrincipal(normalized(), {
    runtimeRoot: ROOT,
    lookupPrincipal: () => ({ ok: true, found: true, user_id: "u1" }),
    assignRole: () => ({ ok: true }),
    verifyLogin: ({ password }) => ({ ok: password === secret }),
    createPrincipal: () => {
      created += 1;
      return { ok: true };
    },
    setPassword: () => {
      rotated += 1;
      return { ok: true };
    },
  });
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.operation, "unchanged");
  assert.equal(created, 0);
  assert.equal(rotated, 0);
  assert.equal(out.principal_label, STAGING_CERT_PRINCIPAL_LABEL);
  assert.equal(JSON.stringify(out).includes(secret), false);
  assert.equal(payloadContainsPrincipalSecrets(out), false);
});

test("existing principal + missing binding binds without creating a duplicate", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vac-cert-bind-"));
  let created = 0;
  let bound = 0;
  const out = applyEnsureCertificationPrincipal(normalized(), {
    runtimeRoot: isolated,
    generatePassword: () => "fresh-bind-secret",
    lookupPrincipal: () => ({ ok: true, found: true, user_id: "u1" }),
    assignRole: () => ({ ok: true }),
    verifyLogin: ({ password }) => ({ ok: password === "fresh-bind-secret" }),
    createPrincipal: () => {
      created += 1;
      return { ok: true };
    },
    setPassword: () => {
      bound += 1;
      return { ok: true };
    },
  });
  assert.equal(out.ok, true, out.detail || out.code);
  assert.equal(out.operation, "bound");
  assert.equal(created, 0);
  assert.equal(bound, 1);
  const binding = readCertificationPrincipalBinding(isolated);
  assert.equal(binding.ok, true);
  assert.equal(binding.password, "fresh-bind-secret");
  assert.equal(JSON.stringify(out).includes("fresh-bind-secret"), false);
});

test("missing principal is created once and is idempotent", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vac-cert-create-"));
  let created = 0;
  const deps = {
    runtimeRoot: isolated,
    generatePassword: () => "created-secret",
    lookupPrincipal: () => (
      created === 0
        ? { ok: true, found: false, code: "principal_missing" }
        : { ok: true, found: true, user_id: "u-new" }
    ),
    assignRole: () => ({ ok: true }),
    verifyLogin: () => ({ ok: true }),
    createPrincipal: () => {
      created += 1;
      return { ok: true, user_id: "u-new" };
    },
    setPassword: () => ({ ok: true }),
  };
  const first = applyEnsureCertificationPrincipal(normalized(), deps);
  const second = applyEnsureCertificationPrincipal(normalized(), deps);
  assert.equal(first.ok, true, first.detail);
  assert.equal(first.operation, "created");
  assert.equal(second.ok, true, second.detail);
  assert.equal(second.operation, "unchanged");
  assert.equal(created, 1);
});

test("rotate rebinds the secret store and does not leak the password", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vac-cert-rotate-"));
  writeCertificationPrincipalBinding(isolated, {
    email: STAGING_CERT_PRINCIPAL_EMAIL,
    password: "old-secret",
  });
  const out = applyEnsureCertificationPrincipal(normalized({ mode: "rotate" }), {
    runtimeRoot: isolated,
    generatePassword: () => "rotated-secret",
    lookupPrincipal: () => ({ ok: true, found: true, user_id: "u1" }),
    assignRole: () => ({ ok: true }),
    verifyLogin: ({ password }) => ({ ok: password === "rotated-secret" }),
    setPassword: () => ({ ok: true }),
  });
  assert.equal(out.ok, true, out.detail);
  assert.equal(out.operation, "rotated");
  assert.equal(readCertificationPrincipalBinding(isolated).password, "rotated-secret");
  assert.equal(JSON.stringify(out).includes("rotated-secret"), false);
});

test("staging-only restriction and production rejected at apply", () => {
  const out = applyEnsureCertificationPrincipal({
    ...normalized(),
    environment: "production",
  }, {
    runtimeRoot: ROOT,
    lookupPrincipal: () => ({ ok: true, found: false }),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "environment_not_allowed");
});

test("worker overlay reloads from the secret file without a PID restart", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vac-cert-overlay-"));
  const before = overlayCertificationPrincipalBinding({ CERT_OPERATOR_EMAIL: "" }, isolated);
  assert.equal(Boolean(before.CERT_OPERATOR_PASSWORD), false);
  writeCertificationPrincipalBinding(isolated, {
    email: STAGING_CERT_PRINCIPAL_EMAIL,
    password: "reloaded-secret",
  });
  const after = overlayCertificationPrincipalBinding({}, isolated);
  assert.equal(after.CERT_OPERATOR_PASSWORD, "reloaded-secret");
  const principal = resolveCertificationPrincipal({ env: {}, runtimeRoot: isolated });
  assert.equal(principal.ok, true);
  assert.equal(principal.principal_id, principalPublicId(STAGING_CERT_PRINCIPAL_EMAIL));
  assert.equal(JSON.stringify(principal).includes("reloaded-secret"), false);
});

test("revoke removes the binding", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vac-cert-revoke-"));
  writeCertificationPrincipalBinding(isolated, {
    email: STAGING_CERT_PRINCIPAL_EMAIL,
    password: "gone-secret",
  });
  const out = applyEnsureCertificationPrincipal(normalized({ mode: "revoke" }), {
    runtimeRoot: isolated,
    lookupPrincipal: () => ({ ok: true, found: true, user_id: "u1" }),
    revokePrincipal: () => ({ ok: true }),
  });
  assert.equal(out.ok, true, out.detail);
  assert.equal(out.operation, "revoked");
  assert.equal(readCertificationPrincipalBinding(isolated).ok, false);
});

test("evidence never includes the password filename contents", () => {
  const isolated = mkdtempSync(join(tmpdir(), "vac-cert-evidence-"));
  const out = applyEnsureCertificationPrincipal(normalized(), {
    runtimeRoot: isolated,
    generatePassword: () => "evidence-secret",
    lookupPrincipal: () => ({ ok: true, found: false, code: "principal_missing" }),
    createPrincipal: () => ({ ok: true, user_id: "u9" }),
    assignRole: () => ({ ok: true }),
    verifyLogin: () => ({ ok: true }),
  });
  const blob = JSON.stringify(out);
  assert.equal(blob.includes("evidence-secret"), false);
  assert.equal(blob.includes("CERT_OPERATOR_PASSWORD"), false);
  const stored = readFileSync(
    join(isolated, "vacilando", "trusted-secrets", "staging-certification-principal.env"),
    "utf8",
  );
  assert.match(stored, /evidence-secret/);
});

process.stdout.write(`\n${passed} passed, ${failed} failed\n`);
if (failed) process.exit(1);
