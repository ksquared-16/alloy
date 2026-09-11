/**
 * Every database a governed migration touches must be the one its request named.
 *
 * ── THE INCIDENT THESE LOCK ──
 *
 * The write child chose its database from the requested environment. The READ
 * child took no environment argument at all and unconditionally loaded the
 * deployed credential. So `environment: certification` read its ledger and its
 * postconditions from DEPLOYED while writing to alloy-cert.
 *
 * The consequence was not a failure; it was a false success. A version recorded
 * on deployed and absent from certification was classified `applied` and
 * skipped, and the action reported `idempotent: true, ledger: "applied"` for a
 * migration that never ran on the database it was meant for.
 *
 * A second defect hid the first: the migration result was scanned with a pattern
 * matching the bare token DATABASE_URL, so a clean `trusted_credential_unavailable`
 * -- whose message names that variable -- surfaced as `result_contained_secrets`
 * and the real code was discarded.
 */

import { strict as assert } from "node:assert";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { test } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { applyMigrationBatch } from "../lib/vacilando/trusted-host-migrate.mjs";
import { __defaultInspectLedgerForTests as defaultInspectLedger } from "../lib/vacilando/trusted-host-actions.mjs";
import { containsCredentialMaterial } from "../lib/vacilando/trusted-host-production-apply.mjs";
import { resolveTrustedDatabaseTarget } from "../lib/vacilando/trusted-host-database-target.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const RUN_SQL_SH = join(LIB, "trusted-host-run-sql.sh");
const REPO_ROOT = join(HERE, "..", "..", "..");

const CERT_TARGET_ID = resolveTrustedDatabaseTarget("certification").targetId;
const STAGING_TARGET_ID = resolveTrustedDatabaseTarget("staging").targetId;

/** Run the read child exactly as the trusted host does. Never passes a secret as an argument. */
function runReadChild(environment, { sql = "SELECT 1;", env = {} } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "ledger-routing-"));
  const sqlFile = join(dir, "q.sql");
  const outFile = join(dir, "q.out");
  const errFile = join(dir, "q.err");
  const reportFile = join(dir, "q.target");
  writeFileSync(sqlFile, sql);
  const child = spawnSync("bash", [RUN_SQL_SH, sqlFile, outFile, errFile, environment], {
    env: {
      ...process.env,
      ALLOY_CERT_DATABASE_URL: "",
      DATABASE_URL: "",
      ALLOY_CANONICAL_ROOT: REPO_ROOT,
      ALLOY_REPO: REPO_ROOT,
      VACILANDO_CHECKOUT: REPO_ROOT,
      ALLOY_WORKTREE: REPO_ROOT,
      ALLOY_BLOCK_REMOTE_SUPABASE: "",
      ALLOY_TARGET_REPORT_FILE: reportFile,
      ...env,
    },
    encoding: "utf8",
    timeout: 60_000,
  });
  return {
    status: child.status,
    err: existsSync(errFile) ? readFileSync(errFile, "utf8") : "",
    out: existsSync(outFile) ? readFileSync(outFile, "utf8") : "",
    target: existsSync(reportFile) ? readFileSync(reportFile, "utf8").trim() : null,
  };
}

/*
 * ── THE READ CHILD NOW HAS A TARGET, AND REFUSES WITHOUT ONE ──
 */

test("the read child refuses when no environment is supplied, instead of defaulting to deployed", () => {
  const r = runReadChild("");
  assert.equal(r.status, 45);
  assert.match(r.err, /target_resolution_failed/);
  assert.equal(r.target, null, "nothing may be resolved when the environment is absent");
});

test("the read child refuses an unregistered environment", () => {
  const r = runReadChild("development_certification");
  assert.equal(r.status, 45);
  assert.match(r.err, /target_resolution_failed/);
});

test("the read child refuses a certification request whose credential points at deployed", () => {
  const r = runReadChild("certification", {
    env: { ALLOY_CERT_DATABASE_URL: "postgresql://u:p@aws-0-us-west-2.pooler.supabase.com:6543/postgres" },
  });
  assert.equal(r.status, 44);
  assert.match(r.err, /target_environment_mismatch/);
});

test("the read child refuses staging rather than falling back to the certification credential", () => {
  // The certification credential is present and usable; staging must still
  // refuse, because a deployed read silently served from a throwaway stack is
  // the same class of lie as the original defect.
  const r = runReadChild("staging", {
    env: {
      ALLOY_CERT_DATABASE_URL: `postgresql://postgres:postgres@127.0.0.1:54422/postgres`,
      ALLOY_CONFIG_FILE: join(tmpdir(), "definitely-not-a-config-file-ledger-routing"),
      ALLOY_SERVER_ENV_SOURCE: join(tmpdir(), "definitely-not-an-env-file-ledger-routing"),
    },
  });
  assert.notEqual(r.status, 0, "staging must not succeed on the certification credential");
  assert.equal(r.target, null);
  assert.match(r.err, /trusted_credential_unavailable|target_environment_mismatch/);
});

/*
 * ── THE REQUIRED REGRESSION ──
 *
 * Version X is recorded in the STAGING ledger and absent from the CERTIFICATION
 * ledger. Under the defect the ledger read went to deployed regardless, so a
 * certification request saw X as applied and skipped it. The batch must now ask
 * the ledger about the environment it is actually targeting.
 */

/** Two ledgers that disagree, keyed by the environment the batch asks about. */
function twoLedgerFixture(version) {
  const ledgers = { staging: new Set([version]), certification: new Set() };
  const asked = [];
  return {
    asked,
    inspectLedger: ({ version: v, environment }) => {
      asked.push({ version: v, environment });
      const key = environment === "staging" ? "staging" : "certification";
      const targetId = key === "staging" ? STAGING_TARGET_ID : CERT_TARGET_ID;
      return ledgers[key].has(v) ? { applied: true, verification: "unverifiable", targetId } : { applied: false, targetId };
    },
  };
}

function batchInputs(version, environment) {
  const text = `-- ${version}\nSELECT 1;\n`;
  // The batch re-hashes the migration it reads and refuses a mismatch, so the
  // fixture has to carry the real digest or the test never reaches the ledger.
  const fileSha = createHash("sha256").update(text, "utf8").digest("hex");
  return {
    normalized: {
      environment,
      expectedSha: "0".repeat(40),
      migrations: [{ version, path: `supabase/migrations/${version}_x.sql`, fileSha }],
    },
    readContent: () => ({ ok: true, text }),
  };
}

test("a version present on staging but absent on certification is NOT skipped for a certification request", () => {
  const version = "20260911160000";
  const fixture = twoLedgerFixture(version);
  const applied = [];
  const { normalized, readContent } = batchInputs(version, "certification");

  const out = applyMigrationBatch(normalized, {
    inspectLedger: fixture.inspectLedger,
    applyFile: ({ entry }) => { applied.push(entry.version); return { ok: true, ledger: "applied", targetId: CERT_TARGET_ID }; },
    readContent,
    // The batch must not be able to satisfy the hash check by accident.
    nowMs: Date.now(),
  });

  assert.equal(fixture.asked.length, 1);
  assert.equal(fixture.asked[0].environment, "certification",
    "the batch must tell the ledger which environment it is targeting");
  assert.deepEqual(applied, [version], "the migration must actually be applied to certification");
  assert.equal(out.ok, true);
  assert.equal(out.results[0].idempotent, false);
});

test("the same version IS skipped for a staging request, proving the answer follows the environment", () => {
  const version = "20260911160000";
  const fixture = twoLedgerFixture(version);
  const applied = [];
  const { normalized, readContent } = batchInputs(version, "staging");

  const out = applyMigrationBatch(normalized, {
    inspectLedger: fixture.inspectLedger,
    applyFile: ({ entry }) => { applied.push(entry.version); return { ok: true, ledger: "applied", targetId: STAGING_TARGET_ID }; },
    readContent,
    nowMs: Date.now(),
  });

  assert.equal(fixture.asked.length, 1);
  assert.equal(fixture.asked[0].environment, "staging");
  assert.deepEqual(applied, [], "a version already on staging must not be re-applied there");
  assert.equal(out.ok, true);
  assert.equal(out.results[0].idempotent, true);
});

/*
 * ── THE SEAM THE DEFECT ACTUALLY LIVED IN ──
 *
 * `applyMigrationBatch` always passed `environment` to its ledger runner. The
 * DEFAULT runner dropped it on the floor and spawned a child with no target. So
 * a test that drives the batch with its own stub passes with the defect fully
 * present; the lock has to reach `defaultInspectLedger` itself.
 */

test("the default ledger runner refuses an environment with no registered target", () => {
  // Under the defect this ignored `environment` entirely and read deployed, so
  // it could never answer target_resolution_failed.
  const r = defaultInspectLedger({ version: "20260911160000", environment: "development_certification" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "target_resolution_failed");
  assert.equal(r.applied, false);
});

test("the default ledger runner reads the CERTIFICATION database for a certification request", () => {
  const r = defaultInspectLedger({ version: "99999999999999", environment: "certification" });
  // Whatever the answer about the version, it must have come from alloy-cert.
  assert.equal(r.targetId, CERT_TARGET_ID,
    "the ledger read must report the certification target it actually used");
  assert.equal(r.applied, false, "a version that exists nowhere must not read as applied");
});

test("the default ledger runner refuses when no environment is supplied at all", () => {
  const r = defaultInspectLedger({ version: "20260911160000" });
  assert.equal(r.ok, false);
  assert.equal(r.code, "target_resolution_failed");
});

/*
 * ── THE SAME-TARGET INVARIANT ──
 */

test("a ledger read from another database fails closed BEFORE any mutation", () => {
  const version = "20260911160000";
  const applied = [];
  const { normalized, readContent } = batchInputs(version, "certification");

  const out = applyMigrationBatch(normalized, {
    // The defect, reproduced exactly: the request is certification, the ledger
    // answer came from deployed.
    inspectLedger: () => ({ applied: true, verification: "unverifiable", targetId: STAGING_TARGET_ID }),
    applyFile: ({ entry }) => { applied.push(entry.version); return { ok: true, ledger: "applied", targetId: CERT_TARGET_ID }; },
    readContent,
    nowMs: Date.now(),
  });

  assert.equal(out.ok, false);
  assert.equal(out.code, "target_invariant_violated");
  assert.deepEqual(applied, [], "nothing may be written once the targets disagree");
  assert.match(out.detail, /Ledger, postcondition and migration targets must be identical/);
});

test("a postcondition probe from another database also fails closed", () => {
  const version = "20260911160000";
  const applied = [];
  const { normalized, readContent } = batchInputs(version, "certification");

  const out = applyMigrationBatch(normalized, {
    inspectLedger: () => ({ applied: true, verification: "verified", targetId: CERT_TARGET_ID, probeTargetId: STAGING_TARGET_ID }),
    applyFile: ({ entry }) => { applied.push(entry.version); return { ok: true, ledger: "applied", targetId: CERT_TARGET_ID }; },
    readContent,
    nowMs: Date.now(),
  });

  assert.equal(out.ok, false);
  assert.equal(out.code, "target_invariant_violated");
  assert.match(out.detail, /postcondition probe/);
  assert.deepEqual(applied, []);
});

test("a write that lands on another database is not reported as success", () => {
  const version = "20260911160000";
  const { normalized, readContent } = batchInputs(version, "certification");

  const out = applyMigrationBatch(normalized, {
    inspectLedger: () => ({ applied: false, targetId: CERT_TARGET_ID }),
    applyFile: () => ({ ok: true, ledger: "applied", targetId: STAGING_TARGET_ID }),
    readContent,
    nowMs: Date.now(),
  });

  assert.equal(out.ok, false);
  assert.equal(out.code, "target_invariant_violated");
  assert.match(out.detail, /migration write/);
});

test("an unregistered environment refuses before the first migration is read", () => {
  const version = "20260911160000";
  const read = [];
  const { normalized } = batchInputs(version, "development_certification");

  const out = applyMigrationBatch(normalized, {
    inspectLedger: () => { throw new Error("must not inspect"); },
    applyFile: () => { throw new Error("must not apply"); },
    readContent: () => { read.push(1); return { ok: true, text: "SELECT 1;" }; },
    nowMs: Date.now(),
  });

  assert.equal(out.ok, false);
  assert.equal(out.code, "target_resolution_failed");
  assert.deepEqual(read, [], "nothing is read for an environment with no registered target");
});

/*
 * ── THE FAILURE-MASKING DEFECT ──
 */

test("naming DATABASE_URL is not a leak, so a classified failure survives", () => {
  // The exact message the certification refusal emits.
  const refusal = {
    ok: false,
    results: [{
      ok: false,
      code: "trusted_credential_unavailable",
      detail: "trusted_credential_unavailable: ALLOY_CERT_DATABASE_URL is not set; environment 'certification' requires an explicit connection",
    }],
  };
  assert.equal(containsCredentialMaterial(refusal), false,
    "the runtime must be able to say which variable is missing without being treated as leaking it");
});

test("the output of redaction is not itself mistaken for a secret", () => {
  // redactSecrets rewrites a URL to this, and the old word-based scan matched it.
  assert.equal(containsCredentialMaterial({ detail: "connection failed: postgresql://[redacted]" }), false);
});

test("a real connection string, key or assignment is still refused", () => {
  assert.equal(containsCredentialMaterial({ d: "postgresql://user:pw@db.example.com:5432/postgres" }), true);
  assert.equal(containsCredentialMaterial({ d: "DATABASE_URL=postgresql://user:pw@host/db" }), true);
  assert.equal(containsCredentialMaterial({ d: "ghp_abcdefghijklmnop" }), true);
});
