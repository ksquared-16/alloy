#!/usr/bin/env node
/**
 * THE GOVERNED RUNNER MUST FIND THE CLIENT THIS HOST ACTUALLY HAS.
 *
 * The first hosted execution of the registered fixture failed in thirteen
 * milliseconds with:
 *
 *     organization_probe_failed: spawnSync psql ENOENT
 *
 * Nothing was wrong with the fixture, the organization, the credential or the
 * governance. Homebrew's libpq is KEG-ONLY: it installs a working psql and
 * deliberately does not link it into /opt/homebrew/bin, so `command -v psql`
 * finds nothing on a host where psql works. `trusted-host-run-sql.sh` had
 * already met this, fixed it, and written a paragraph warning that the symptom
 * names something other than the cause -- and the seed runner, one layer up,
 * spawned a bare "psql" anyway.
 *
 * So these cases pin two things: the resolution order, and the fact that the
 * runner does not go back to trusting PATH.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  KEG_ONLY_CANDIDATES, POSTGRES_CLIENT_MISSING_DETAIL, resolvePostgresClient,
} from "../../../web/scripts/lib/resolvePostgresClient.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RUNNER = readFileSync(`${ROOT}/web/scripts/seedFinancialsDemoTenant.mjs`, "utf8");

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}
/** A host arranged exactly as the test says, and no other way. */
const host = (...present) => (p) => present.includes(p);

test("1 — an explicit PSQL_BIN wins over everything", () => {
  const got = resolvePostgresClient({
    env: { PSQL_BIN: "/declared/psql", PATH: "/bin" },
    exists: host("/declared/psql", "/bin/psql", KEG_ONLY_CANDIDATES[0]),
  });
  assert.deepEqual(got, { path: "/declared/psql", source: "declared" });
});

test("2 — a declared path that does not exist does not win", () => {
  const got = resolvePostgresClient({
    env: { PSQL_BIN: "/declared/psql", PATH: "/bin" },
    exists: host("/bin/psql"),
  });
  assert.equal(got.source, "path");
});

test("3 — PATH is searched before the keg-only locations", () => {
  const got = resolvePostgresClient({
    env: { PATH: "/usr/bin:/bin" },
    exists: host("/bin/psql", KEG_ONLY_CANDIDATES[0]),
  });
  assert.deepEqual(got, { path: "/bin/psql", source: "path" });
});

test("4 — THE DEFECT: nothing on PATH, libpq keg-only, still resolves", () => {
  const got = resolvePostgresClient({
    env: { PATH: "/usr/bin:/bin:/opt/homebrew/bin" },
    exists: host("/opt/homebrew/opt/libpq/bin/psql"),
  });
  assert.deepEqual(got, { path: "/opt/homebrew/opt/libpq/bin/psql", source: "keg_only" });
});

test("5 — the keg-only order matches the trusted-host SQL child's", () => {
  assert.deepEqual([...KEG_ONLY_CANDIDATES], [
    "/opt/homebrew/opt/libpq/bin/psql",
    "/usr/local/opt/libpq/bin/psql",
    "/opt/homebrew/bin/psql",
    "/usr/local/bin/psql",
    "/Applications/Postgres.app/Contents/Versions/latest/bin/psql",
  ]);
});

test("6 — a host with no client at all resolves to nothing, not to a guess", () => {
  assert.equal(resolvePostgresClient({ env: { PATH: "/usr/bin" }, exists: () => false }), null);
  assert.match(POSTGRES_CLIENT_MISSING_DETAIL, /brew install libpq/);
  assert.match(POSTGRES_CLIENT_MISSING_DETAIL, /PSQL_BIN/);
});

test("7 — an empty PATH is not a crash", () => {
  assert.equal(resolvePostgresClient({ env: {}, exists: () => false }), null);
});

test("8 — the runner spawns the resolved client, never a bare psql", () => {
  assert.doesNotMatch(RUNNER, /execFileSync\(\s*["']psql["']/,
    "spawning a bare psql is the defect this file exists for");
  assert.match(RUNNER, /execFileSync\(client\.path/);
  assert.match(RUNNER, /resolvePostgresClient\(\)/);
});

test("9 — a missing client is named, not absorbed into the probe", () => {
  // The original message said organization_probe_failed, which sent the reader
  // to the organization and the credential -- neither of which was wrong.
  assert.match(RUNNER, /postgres_client_missing/);
  assert.match(RUNNER, /e\?\.code === "ENOENT"/);
});

test("10 — how the client was found is audited; where the database is, is not", () => {
  assert.match(RUNNER, /postgres_client_source: client\.source/);
  assert.doesNotMatch(RUNNER, /postgres_client_path/);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
