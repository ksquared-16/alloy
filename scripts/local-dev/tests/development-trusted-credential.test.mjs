#!/usr/bin/env node
/**
 * S4 — the trusted credential binding.
 *
 * THE PROPERTY UNDER TEST. Exactly one function can read a secret value, and it
 * exists to hand that value to a child process environment. Everything else
 * deals in the reference. A module where any caller can ask for the value is a
 * module that will eventually log one.
 *
 * NOTHING IN THIS SUITE PRINTS A SECRET. The fixtures write a synthetic value
 * into a temporary store and then assert, repeatedly, that it does not come
 * back out of anything except the one resolver — and that the resolver refuses
 * unless the caller declares itself the trusted executor.
 */
import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const ROOT = mkdtempSync(join(tmpdir(), "vac-cred-"));
const C = await import("../lib/vacilando/trusted-credential.mjs");
const E = await import("../lib/vacilando/executor-authority.mjs");

let pass = 0;
let fail = 0;
async function test(name, fn) {
  try { await fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const DEV = "trusted_secret:development_certification_database";
const SYNTHETIC = "postgresql://postgres:synthetic@127.0.0.1:59999/postgres";

function registerDev(over = {}) {
  return C.registerCredential({
    reference: DEV, environment: "development_certification", kind: "postgres_url",
    hostClass: "local_loopback", readValue: () => SYNTHETIC, root: ROOT, ...over,
  });
}

// ── Reference discipline ─────────────────────────────────────────────────────

await test("1 — a reference is a NAME, and a malformed one is refused", () => {
  assert.equal(C.referenceIsWellFormed(DEV), true);
  for (const bad of ["development_certification_database", "trusted_secret:", "trusted_secret:UPPER",
    "trusted_secret:x", "postgresql://u:p@h/db", "trusted_secret:has-dash"]) {
    assert.equal(C.referenceIsWellFormed(bad), false, bad);
  }
});

await test("2 — the store lives outside every worktree a lane can see", () => {
  const w = C.storeIsOutsideWorktrees(ROOT);
  assert.equal(w.ok, true);
  assert.deepEqual(w.offenders, []);
  // And the check really would catch it.
  const inside = C.storeIsOutsideWorktrees(join(ROOT, "wt"), { worktreeRoots: [ROOT] });
  assert.equal(inside.ok, false);
});

// ── Registration ─────────────────────────────────────────────────────────────

await test("3 — registration writes 0600 and returns the reference, never the value", () => {
  const out = registerDev();
  assert.equal(out.ok, true, out.error);
  assert.equal(out.reference, DEV);
  assert.equal(out.environment, "development_certification");
  assert.equal(out.value_mode, 0o600);
  // The return carries no secret at all.
  assert.equal(JSON.stringify(out).includes("synthetic"), false);
  assert.equal(/postgres(ql)?:\/\//.test(JSON.stringify(out)), false);
  const p = C.credentialPaths(DEV, ROOT);
  assert.equal(statSync(p.value).mode & 0o777, 0o600);
  assert.equal(statSync(p.meta).mode & 0o777, 0o600);
});

await test("4 — the metadata file never contains a secret", () => {
  registerDev();
  const raw = readFileSync(C.credentialPaths(DEV, ROOT).meta, "utf8");
  assert.equal(raw.includes("synthetic"), false);
  assert.equal(/postgres(ql)?:\/\//.test(raw), false);
  const meta = C.readCredentialMetadata(DEV, { root: ROOT });
  assert.equal(meta.metadata_contains_secret, false);
  assert.equal(meta.environment, "development_certification");
  // And the guard is real: a metadata object carrying a URL is refused.
  const bad = C.registerCredential({
    reference: "trusted_secret:bad_meta", environment: "postgresql://u:p@h/db",
    readValue: () => SYNTHETIC, root: ROOT,
  });
  assert.equal(bad.ok, false);
  assert.equal(bad.error, "metadata_would_contain_secret");
});

await test("5 — a value provider is required; no value can arrive as a plain argument", () => {
  const out = C.registerCredential({ reference: DEV, environment: "development_certification", root: ROOT });
  assert.equal(out.ok, false);
  assert.equal(out.error, "no_value_provider");
});

// ── The one reader ───────────────────────────────────────────────────────────

await test("6 — metadata NEVER returns the value, whatever the caller asks for", () => {
  registerDev();
  const meta = C.readCredentialMetadata(DEV, { root: ROOT });
  assert.equal(meta.ok, true);
  assert.equal(meta.value_present, true, "it says a value exists");
  assert.equal(JSON.stringify(meta).includes("synthetic"), false, "and does not contain it");
});

await test("7 — the resolver refuses unless the caller DECLARES itself the trusted executor", () => {
  registerDev();
  const denied = C.resolveForExecutorChild(DEV, { environment: "development_certification", root: ROOT });
  assert.equal(denied.ok, false);
  assert.equal(denied.refusal, "caller_is_not_trusted_executor");
  assert.equal(JSON.stringify(denied).includes("synthetic"), false);
  // It is unreachable by OMISSION, which is the whole isolation argument.
  const explicit = C.resolveForExecutorChild(DEV, {
    environment: "development_certification", root: ROOT, callerIsTrustedExecutor: true,
  });
  assert.equal(explicit.ok, true);
  assert.equal(explicit.env.DATABASE_URL, SYNTHETIC);
  // What it says to record is the reference alone.
  assert.deepEqual(explicit.durable_record, { credential_reference: DEV, environment: "development_certification" });
});

await test("8 — a certification credential CANNOT satisfy development_certification", () => {
  C.registerCredential({
    reference: "trusted_secret:certification_database", environment: "certification",
    readValue: () => SYNTHETIC, root: ROOT,
  });
  const v = C.resolveForExecutorChild("trusted_secret:certification_database", {
    environment: "development_certification", root: ROOT, callerIsTrustedExecutor: true,
  });
  assert.equal(v.ok, false);
  assert.equal(v.refusal, "environment_binding_mismatch");
  assert.equal(v.bound_to, "certification");
  assert.equal(v.requested, "development_certification");
  assert.match(v.detail, /cannot satisfy development_certification/);
});

await test("9 — an absent binding blocks execution and says which reference is missing", () => {
  const v = C.credentialBindingStatus("trusted_secret:not_provisioned_anywhere", {
    environment: "development_certification", root: ROOT,
  });
  assert.equal(v.ok, false);
  assert.equal(v.refusal, "binding_absent");
});

await test("10 — a value file with loose permissions is refused", () => {
  registerDev();
  const p = C.credentialPaths(DEV, ROOT);
  chmodSync(p.value, 0o644);
  const v = C.credentialBindingStatus(DEV, { environment: "development_certification", root: ROOT });
  assert.equal(v.ok, false);
  assert.equal(v.refusal, "credential_permissions_too_open");
  chmodSync(p.value, 0o600);
});

// ── Child environment ────────────────────────────────────────────────────────

await test("11 — the child cannot inherit an ambient database credential", () => {
  registerDev();
  const resolved = C.resolveForExecutorChild(DEV, {
    environment: "development_certification", root: ROOT, callerIsTrustedExecutor: true,
  });
  const inherited = {
    PATH: "/usr/bin",
    DATABASE_URL: "postgresql://ambient:secret@hosted.example/db",
    PGPASSWORD: "ambient", SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOi.ambient.key",
  };
  const child = C.executorChildEnv(inherited, resolved);
  assert.equal(child.PATH, "/usr/bin", "unrelated variables survive");
  assert.equal(child.SUPABASE_SERVICE_ROLE_KEY, undefined);
  // The ambient URL is gone; the environment-bound one is what remains.
  assert.equal(child.DATABASE_URL, SYNTHETIC);
  assert.equal(child.DATABASE_URL.includes("hosted.example"), false);
  // libpq variables are DERIVED from the resolved credential, never inherited.
  // psql does not read DATABASE_URL, so without these the executor silently
  // connects to a local socket instead — observed live, as `database "Kelly"
  // does not exist`. Passing the URL as `-d <url>` would work and would also
  // put the credential in the process listing, which is the leak this module
  // exists to prevent.
  assert.notEqual(child.PGPASSWORD, "ambient", "the ambient password never survives");
  assert.equal(child.PGPASSWORD, "synthetic");
  assert.equal(child.PGHOST, "127.0.0.1");
  assert.equal(child.PGPORT, "59999");
  assert.equal(child.PGUSER, "postgres");
  assert.equal(child.PGDATABASE, "postgres");
});

await test("11b — scrubbing happens even when resolution FAILED, so nothing leaks through", () => {
  const child = C.executorChildEnv(
    { DATABASE_URL: "postgresql://ambient:secret@hosted.example/db", PGPASSWORD: "x", PGHOST: "hosted.example" },
    { ok: false, refusal: "binding_absent" },
  );
  assert.equal(child.DATABASE_URL, undefined, "a failed resolve must not leave the ambient credential in place");
  assert.equal(child.PGPASSWORD, undefined);
  assert.equal(child.PGHOST, undefined, "nor an ambient libpq host");
});

// ── Redaction ────────────────────────────────────────────────────────────────

await test("12 — database URLs are redacted from anything on the way out", () => {
  const text = `psql: error: connection to ${SYNTHETIC} failed\nalso postgres://u:p@h:5/db`;
  const out = C.redactDatabaseUrls(text);
  assert.equal(out.includes("synthetic"), false);
  assert.match(out, /postgresql:\/\/\[redacted\]/);
  assert.match(out, /postgres:\/\/\[redacted\]/);
});

// ── Integration with the S3 authority model ──────────────────────────────────

await test("13 — the environment registry names exactly this reference", () => {
  assert.equal(E.ENVIRONMENT_REGISTRY.development_certification.credential_ref, DEV);
  assert.equal(E.ENVIRONMENT_REGISTRY.development_certification.distinct_binding, true);
  // Registered aliases still normalize BEFORE identity, and never onto certification.
  assert.equal(E.normalizeEnvironmentId("dev_certification"), "development_certification");
  assert.notEqual(E.normalizeEnvironmentId("development_certification"), "certification");
});

await test("14 — S3 authority stays refused while the registry marks it unprovisioned", () => {
  // The registry's `provisioned` flag is the declared platform state; a
  // credential existing on ONE host does not make the environment provisioned
  // everywhere, and the flag is what a fixture can certify.
  const v = E.assertEnvironmentAuthority({
    environment: "development_certification", capability: "trusted_host.database.migrate",
  });
  assert.equal(v.ok, false);
  assert.equal(v.refusal, "environment_unprovisioned");
  // With the binding declared available, the authority resolves — and requires
  // the distinct binding the registry claims.
  const ok = E.assertEnvironmentAuthority({
    environment: "development_certification", capability: "trusted_host.database.migrate",
    credentialAvailable: true,
  });
  assert.equal(ok.ok, true);
  assert.equal(ok.distinct_binding, true);
  assert.equal(ok.credential_ref, DEV);
});

// ── Negative controls ────────────────────────────────────────────────────────

await test("NEGATIVE — no exported function returns a bare secret string", () => {
  const src = readFileSync(new URL("../lib/vacilando/trusted-credential.mjs", import.meta.url), "utf8");
  // Two file reads exist in the whole module: the metadata (which cannot hold a
  // secret) and the value (reachable only through the guarded resolver).
  const readers = [...src.matchAll(/readFileSync\(/g)];
  assert.equal(readers.length, 2, "exactly two reads: metadata and value");
  const valueReads = [...src.matchAll(/readFileSync\(value/g)];
  assert.equal(valueReads.length, 1, "the value path is read in exactly one place");
  const resolver = src.slice(src.indexOf("export function resolveForExecutorChild"));
  assert.match(resolver.slice(0, 1400), /readFileSync\(value/, "and that place is the guarded resolver");
  // Only ONE exported function mentions the value path.
  const exported = [...src.matchAll(/^export function (\w+)/gm)].map((m) => m[1]);
  assert.ok(exported.includes("resolveForExecutorChild"));
  const body = src.slice(src.indexOf("export function resolveForExecutorChild"));
  assert.match(body.slice(0, 1200), /callerIsTrustedExecutor !== true/);
});

await test("NEGATIVE — the CLI has no subcommand that prints a value", () => {
  const cli = readFileSync(new URL("../vac-trusted-credential.mjs", import.meta.url), "utf8");
  assert.equal(cli.includes("resolveForExecutorChild"), false, "the CLI cannot even reach the reader");
  assert.match(cli, /redactDatabaseUrls/);
  // status reads METADATA, which cannot contain a value.
  assert.match(cli, /readCredentialMetadata/);
});

await test("NEGATIVE — a feature lane path cannot reach the store", () => {
  // The two properties that make a lane's ordinary file read useless: the store
  // is not under any worktree, and it is 0600 under 0700.
  const w = C.storeIsOutsideWorktrees(ROOT);
  assert.equal(w.ok, true);
  registerDev();
  assert.equal(statSync(C.credentialPaths(DEV, ROOT).value).mode & 0o077, 0, "no group or other access");
  assert.equal(C.CREDENTIAL_ISOLATION.provider_inheritance, false);
});

await test("NEGATIVE — the local-stack derivation can only ever produce a loopback target", () => {
  const cli = readFileSync(new URL("../vac-trusted-credential.mjs", import.meta.url), "utf8");
  const derive = cli.slice(cli.indexOf("--from-local-stack"), cli.indexOf("die(\"provide --stdin"));
  assert.match(derive, /127\.0\.0\.1/);
  assert.equal(/https?:\/\//.test(derive), false);
  assert.match(derive, /supabase_db_/, "it reads a published port from a local container, not a config string");
});

// ── The probe false-positive, caught live by a negative control ──────────────

await test("PROBE — a psql command tag is NEVER counted as a result row", () => {
  // The exact live failure. The first version bound its subject with a
  // PREPARE/EXECUTE pair; psql echoed the command tag `PREPARE` to stdout and
  // the parser counted it as a row, so EVERY probe returned present=true —
  // including `table_that_certainly_does_not_exist_xyz`. Caught by a negative
  // control, not by the code. This is the same false positive that once told a
  // Director a missing table had landed.
  assert.deepEqual(C.parseMarkedRows("PREPARE\n"), [], "the tag is not a row");
  assert.deepEqual(C.parseMarkedRows(""), [], "empty output is zero rows");
  for (const noise of ["PREPARE\n", "NOTICE:  relation does not exist\n", "(0 rows)\n", "\n\n", "SET\nPREPARE\n"]) {
    assert.equal(C.parseMarkedRows(noise).length, 0, JSON.stringify(noise));
  }
});

await test("PROBE — only rows the query itself produced are counted, and their columns survive", () => {
  const out = "PREPARE\nVACROW|public|person_health_facts\nVACROW|other|person_health_facts\n(2 rows)\n";
  const rows = C.parseMarkedRows(out);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0].columns, ["public", "person_health_facts"]);
  // The marker is stripped from what the caller sees.
  assert.equal(rows[0].columns.includes("VACROW"), false);
});

await test("PROBE — zero marked rows is a NEGATIVE, and it reaches the router as one", async () => {
  const E2 = await import("../lib/vacilando/executor-authority.mjs");
  const absent = E2.realReadVerdict({ probe: "relation_exists", ran: true, rows: C.parseMarkedRows("PREPARE\n") });
  assert.equal(absent.present, false, "not unknown — the read ran and the row was not there");
  assert.equal(absent.rows_read, 0);
  const present = E2.realReadVerdict({ probe: "relation_exists", ran: true, rows: C.parseMarkedRows("VACROW|public|t\n") });
  assert.equal(present.present, true);
  assert.equal(present.method, "real_read");
});

await test("PROBE — the executor binds the subject through psql interpolation, never string concatenation", () => {
  const cli = readFileSync(new URL("../vac-trusted-db.mjs", import.meta.url), "utf8");
  const queries = cli.slice(cli.indexOf("const READ_QUERIES"), cli.indexOf("const resolved"));
  // The subject appears as :'subj', never spliced into the SQL text.
  assert.match(queries, /:'subj'/);
  assert.equal(/\+\s*subject/.test(queries), false, "the subject is never concatenated into a query");
  assert.match(queries, /ROW_MARKER/, "every query carries the marker column");
  assert.equal((queries.match(/ROW_MARKER/g) || []).length, 3, "all three probes carry it");
  // And the interpolation only works over stdin, which the executor documents.
  assert.match(cli, /psql performs :'subj' interpolation/);
  assert.equal(cli.includes('"-c", READ_QUERIES'), false, "-c does not interpolate and must not be used");
});

process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
