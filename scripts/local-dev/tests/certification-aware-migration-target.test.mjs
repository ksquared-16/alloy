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
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
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
import { PRODUCTION_APPLY_TARGETS } from "../lib/vacilando/trusted-host-production-migrate.mjs";
import { LEDGER_REPAIR_TARGETS } from "../lib/vacilando/trusted-host-ledger-repair.mjs";

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

/*
 * The child now takes the RESOLVED TARGET CLASS, not an environment name. The
 * alias vocabulary lives in the resolver and nowhere else — it used to live
 * here too, and the copy here was the one that went stale.
 */
function runChild(targetClass, certUrl) {
  try {
    execFileSync("bash", [CHILD, "/dev/null", "/tmp/thm-out.tmp", "/tmp/thm-err.tmp", targetClass], {
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
  const r = runChild(TARGET_CLASS.CERTIFICATION, DEPLOYED);
  assert.notEqual(r.status, 0, "must not proceed to psql");
  assert.match(r.stderr, /target_environment_mismatch/);
});

test("the apply child refuses a class it cannot connect, and refuses an empty one", () => {
  // Fail closed at the last boundary too. The resolver refuses unknown NAMES
  // before a process is spawned; this is the backstop for anything that reaches
  // the child anyway — including a caller that forgets the argument entirely,
  // which is how every ledger repair would have died silently.
  for (const bogus of ["bogus_class", ""]) {
    const r = runChild(bogus, CERT);
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /target_resolution_failed/);
  }
});

test("the apply child refuses certification with no explicit certification credential", () => {
  const r = runChild(TARGET_CLASS.CERTIFICATION, "");
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
    execFileSync("bash", [CHILD, "/dev/null", "/tmp/thm-cfg-out.tmp", "/tmp/thm-cfg-err.tmp", TARGET_CLASS.CERTIFICATION], {
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

// ── The deployed primary, and the contract that broke ───────────────────────

test("the registered deployed primary resolves to its own deployed class", () => {
  const r = resolveTrustedDatabaseTarget("alloy_deployed_primary");
  assert.equal(r.ok, true);
  assert.equal(r.targetClass, TARGET_CLASS.DEPLOYED_PRIMARY);
  assert.equal(r.connectionSourceKind, "trusted_server_env");
  assert.equal(r.expectedHostIsLocal, false);
  // Safe to write into an audit row: a name, never a connection string.
  assert.ok(!/:\/\/|@|password/i.test(r.targetId));
});

test("every target governance accepts is a target this resolver knows", () => {
  /*
   * THE REGRESSION, STATED AS A RULE.
   *
   * `database.apply_promoted_migration` validated `alloy_deployed_primary`
   * against PRODUCTION_APPLY_TARGETS, passed it down as the environment, and
   * the resolver had never heard of it. Three production applies died at this
   * seam having contacted no database at all. A name that clears governance and
   * dies in the resolver is not a safety control; it is a broken contract.
   *
   * Deliberately a test rather than an import: these lists answer different
   * questions — which action may touch a database, versus which database a name
   * means — and importing one into the other would be a cycle.
   */
  for (const target of [...PRODUCTION_APPLY_TARGETS, ...LEDGER_REPAIR_TARGETS]) {
    const r = resolveTrustedDatabaseTarget(target);
    assert.equal(r.ok, true, `${target} is accepted by a governed action but unknown to the resolver`);
  }
});

test("a deployed target still refuses to land on the throwaway stack", () => {
  const r = assertTargetMatchesEnvironment("alloy_deployed_primary", CERT);
  assert.equal(r.ok, false);
  assert.equal(r.code, "target_environment_mismatch");
  assert.match(r.detail, /alloy_deployed_primary/);
});

test("the deployed primary accepts a deployed connection", () => {
  assert.equal(assertTargetMatchesEnvironment("alloy_deployed_primary", DEPLOYED).ok, true);
});

test("an unregistered name refuses, and refuses by name", () => {
  const r = resolveTrustedDatabaseTarget("alloy_deployed_secondary");
  assert.equal(r.ok, false);
  assert.equal(r.code, "target_resolution_failed");
  assert.match(r.detail, /alloy_deployed_secondary/);
});

test("no unresolved name is ever handed a connection source", () => {
  // The fix must not become "unknown target, use whatever we have".
  for (const name of ["", "  ", "production", "prod", "bogus", "alloy_deployed_secondary"]) {
    const r = resolveTrustedDatabaseTarget(name);
    assert.equal(r.ok, false, `${JSON.stringify(name)} must not resolve`);
    assert.equal(r.connectionSourceKind, undefined);
  }
});

test("the deployed primary reaches the database — the exact handoff that was broken", () => {
  /*
   * THE REGRESSION TEST THAT MATTERS.
   *
   * Three governed production applies died here with exit 45, having assigned
   * no DATABASE_URL, opened no connection and dispatched no SQL. Proving the
   * resolver knows the name is not enough: the name has to survive the handoff
   * into the child and come out the other side as a connection attempt.
   *
   * So this drives the real child with the real deployed class, and points the
   * trusted env source at a throwaway file whose URL goes nowhere. Getting
   * "connection refused" is the pass: it means target resolution succeeded,
   * DATABASE_URL was assigned, the host/port guard allowed it, and psql ran.
   * Nothing real is touched — the canonical root is a temp directory, so the
   * host's own .env.local cannot be picked up by accident.
   */
  const dir = mkdtempSync(join(tmpdir(), "alloy-deployed-seam-"));
  const envFile = join(dir, "env");
  const fakeRoot = join(dir, "root");
  mkdirSync(fakeRoot, { recursive: true });
  writeFileSync(envFile, "DATABASE_URL=postgresql://u:p@127.0.0.1:1/postgres\n");

  let status = 0;
  let stderr = "";
  const errFile = join(dir, "err");
  try {
    execFileSync("bash", [CHILD, "/dev/null", join(dir, "out"), errFile, TARGET_CLASS.DEPLOYED_PRIMARY], {
      env: {
        ...process.env,
        ALLOY_CANONICAL_ROOT: fakeRoot,
        ALLOY_REPO: fakeRoot,
        VACILANDO_CHECKOUT: REPO,
        ALLOY_WORKTREE: REPO,
        ALLOY_SERVER_ENV_SOURCE: envFile,
      },
      stdio: "ignore",
    });
  } catch (error) {
    status = error.status ?? -1;
  }
  try { stderr = readFileSync(errFile, "utf8"); } catch { /* */ }

  assert.doesNotMatch(stderr, /target_resolution_failed/, "the deployed primary must get past target resolution");
  assert.doesNotMatch(stderr, /target_environment_mismatch/);
  assert.notEqual(status, 45);
  // It got all the way to the client, which only happens once DATABASE_URL exists.
  assert.match(stderr, /psql: error: connection to server/);
  // And the failure it reports names a host and a port, never a credential.
  assert.doesNotMatch(stderr, /u:p@|password/i);
});
