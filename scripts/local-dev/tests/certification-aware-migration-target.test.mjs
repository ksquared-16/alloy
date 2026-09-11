/**
 * A governed migration must touch the database its request named.
 *
 * The incident these lock: a request carrying `environment: certification`
 * cleared validation, and the apply child then ran psql against whatever
 * DATABASE_URL the trusted host held — on that host, a deployed pooler.
 * `environment` had never selected a database; it only ever gated git
 * eligibility. Nothing compared the request to the connection.
 */

import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  CERTIFICATION_DB_PORT,
  TARGET_CLASS,
  assertTargetMatchesEnvironment,
  describeConnection,
  resolveTrustedDatabaseTarget,
} from "../lib/vacilando/trusted-host-database-target.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, "..", "..", "..");
const CHILD = join(HERE, "..", "lib", "vacilando", "trusted-host-apply-migration.sh");

const DEPLOYED = "postgresql://user:secret@aws-0-us-west-2.pooler.supabase.com:6543/postgres";
const CERT = `postgresql://postgres:postgres@127.0.0.1:${CERTIFICATION_DB_PORT}/postgres`;

// ── Target routing ──────────────────────────────────────────────────────────

test("certification and its alias resolve to one canonical local target", () => {
  const a = resolveTrustedDatabaseTarget("certification");
  const b = resolveTrustedDatabaseTarget("cert");
  assert.equal(a.ok, true);
  assert.equal(a.targetClass, TARGET_CLASS.CERTIFICATION);
  assert.equal(b.targetClass, a.targetClass, "alias must normalize to the same target");
  assert.equal(b.targetId, a.targetId);
  assert.equal(a.expectedPort, CERTIFICATION_DB_PORT);
});

test("staging resolves to the deployed target", () => {
  const t = resolveTrustedDatabaseTarget("staging");
  assert.equal(t.ok, true);
  assert.equal(t.targetClass, TARGET_CLASS.STAGING);
  assert.equal(t.expectedHostIsLocal, false);
});

test("an unknown environment refuses rather than defaulting", () => {
  for (const env of ["development_certification", "prod", "", null, "CERTIFICATION_X"]) {
    const t = resolveTrustedDatabaseTarget(env);
    assert.equal(t.ok, false, `${String(env)} must not resolve`);
    assert.equal(t.code, "target_resolution_failed");
  }
});

test("target identity is human-readable and carries no secret", () => {
  const t = resolveTrustedDatabaseTarget("certification");
  assert.match(t.targetId, /alloy-cert@127\.0\.0\.1:54422/);
  assert.ok(!/password|secret|:\/\/[^@]*@/.test(t.targetId));
});

// ── Cross-target safety ─────────────────────────────────────────────────────

test("certification refuses a deployed connection — the incident", () => {
  const v = assertTargetMatchesEnvironment("certification", DEPLOYED);
  assert.equal(v.ok, false);
  assert.equal(v.code, "target_environment_mismatch");
  assert.match(v.detail, /not local/);
});

test("certification refuses a local connection on the wrong port", () => {
  // The API gateway is 54421; psql against it is not the certification database.
  const v = assertTargetMatchesEnvironment("certification", "postgresql://u:p@127.0.0.1:54421/postgres");
  assert.equal(v.ok, false);
  assert.equal(v.code, "target_environment_mismatch");
});

test("certification accepts the certification database", () => {
  const v = assertTargetMatchesEnvironment("certification", CERT);
  assert.equal(v.ok, true);
  assert.equal(v.port, CERTIFICATION_DB_PORT);
});

test("staging refuses the throwaway certification stack", () => {
  // The quieter half of the same bug: a staging migration that silently lands
  // on a disposable database reports success and changes nothing that matters.
  const v = assertTargetMatchesEnvironment("staging", CERT);
  assert.equal(v.ok, false);
  assert.equal(v.code, "target_environment_mismatch");
});

test("staging accepts a deployed connection", () => {
  assert.equal(assertTargetMatchesEnvironment("staging", DEPLOYED).ok, true);
});

test("an unusable connection string refuses rather than being parsed optimistically", () => {
  assert.equal(describeConnection("").ok, false);
  assert.equal(describeConnection("not-a-url").ok, false);
  assert.equal(assertTargetMatchesEnvironment("certification", "").code, "target_assertion_failed");
});

// ── The child enforces it too, so the guard is not only advisory ────────────

function runChild(environment, certUrl) {
  try {
    execFileSync("bash", [CHILD, "/dev/null", "/tmp/thm-out.tmp", "/tmp/thm-err.tmp", environment], {
      env: {
        ...process.env,
        ALLOY_CANONICAL_ROOT: REPO,
        ALLOY_REPO: REPO,
        VACILANDO_CHECKOUT: REPO,
        ALLOY_WORKTREE: REPO,
        // Point the config loader at a file that does not exist, so the test
        // judges the CHILD rather than whatever this host happens to have
        // configured. Without this, "no credential" silently becomes "the
        // operator's real certification credential" and the refusal path stops
        // being exercised on a correctly configured machine.
        ALLOY_CONFIG_FILE: "/nonexistent/alloy-dev-config-for-tests",
        ALLOY_CERT_DATABASE_URL: certUrl ?? "",
      },
      stdio: "ignore",
    });
    return { status: 0, stderr: "" };
  } catch (error) {
    let stderr = "";
    try { stderr = readFileSync("/tmp/thm-err.tmp", "utf8"); } catch { /* */ }
    return { status: error.status ?? -1, stderr };
  }
}

test("the apply child refuses a certification request pointed at deployed infrastructure", () => {
  const r = runChild("certification", DEPLOYED);
  assert.notEqual(r.status, 0, "must not proceed to psql");
  assert.match(r.stderr, /target_environment_mismatch/);
});

test("the apply child refuses an unknown environment", () => {
  const r = runChild("bogus", CERT);
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /target_resolution_failed/);
});

test("the apply child refuses certification with no explicit certification credential", () => {
  const r = runChild("certification", "");
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /trusted_credential_unavailable/);
});

test("the child loads the certification credential from the host config, not just the environment", () => {
  // The gap this locks: sourcing common.sh DEFINES alloy_load_config without
  // RUNNING it, so a correctly configured host still refused — the value sat in
  // the config file and never reached the shell. Publishing configuration that
  // has no effect is worse than having none, because it reads as done.
  const dir = mkdtempSync(join(tmpdir(), "alloy-cert-cfg-"));
  const cfg = join(dir, "config");
  writeFileSync(cfg, `ALLOY_CERT_DATABASE_URL="${CERT}"\n`);

  let status = 0;
  let stderr = "";
  try {
    execFileSync("bash", [CHILD, "/dev/null", "/tmp/thm-cfg-out.tmp", "/tmp/thm-cfg-err.tmp", "certification"], {
      env: {
        ...process.env,
        ALLOY_CANONICAL_ROOT: REPO,
        ALLOY_REPO: REPO,
        VACILANDO_CHECKOUT: REPO,
        ALLOY_WORKTREE: REPO,
        ALLOY_CONFIG_FILE: cfg,
        // Deliberately absent from the environment: the config must supply it.
        ALLOY_CERT_DATABASE_URL: "",
      },
      stdio: "ignore",
    });
  } catch (error) {
    status = error.status ?? -1;
    try { stderr = readFileSync("/tmp/thm-cfg-err.tmp", "utf8"); } catch { /* */ }
  }

  assert.doesNotMatch(stderr, /trusted_credential_unavailable/,
    "the configured credential must be found rather than reported missing");
  assert.notEqual(status, 42, "must not refuse as unconfigured when the host config supplies the target");
});
