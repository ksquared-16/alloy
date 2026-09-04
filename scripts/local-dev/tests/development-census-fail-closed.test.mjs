/**
 * A CENSUS NEVER GUESSES WHAT IT IS READING.
 *
 * THE INCIDENT THIS ENCODES. A `database.read_census` was filed as a UI test
 * subject with no artifact_refs. `artifactPathFrom` substituted the Q15 census,
 * the request was approved, and it EXECUTED against the deployed primary —
 * writing q15-authority-census.results.json. The substitution was then recorded
 * in the request, so the audit trail showed a query the filer never asked for.
 *
 * A privileged read whose SUBJECT is inferred is not a governed action. Absence
 * of the query, or of the database, must block before anything is touched.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const LIB = join(HERE, "..", "lib", "vacilando");
const { getActionDefinition, ACTION_TYPES } = await import(join(LIB, "trusted-host-action-registry.mjs"));
const def = getActionDefinition(ACTION_TYPES.DATABASE_READ_CENSUS);

const root = mkdtempSync(join(tmpdir(), "census-failclosed-"));
// resolveArtifactRoot walks up looking for docs/platform/planning; without it
// the resolver falls through to the REAL repository and every artifact lookup
// misses. Make the sandbox look like a root so nothing reaches the real tree.
mkdirSync(join(root, "docs", "platform", "planning"), { recursive: true });
mkdirSync(join(root, "q"), { recursive: true });
const GOOD_SQL = "SELECT count(*) AS n FROM public.user_roles;";
writeFileSync(join(root, "q", "good.sql"), GOOD_SQL);
writeFileSync(join(root, "q", "malformed.json"), JSON.stringify({ note: "no query here" }));

const base = { worktreePath: root, worktree_path: root, databaseTarget: "alloy_deployed_primary" };

await test("a census with no query artifact is BLOCKED, never defaulted", () => {
  const out = def.validateInputs({ ...base, queryArtifactPath: null });
  assert.equal(out.ok, false);
  assert.equal(out.code, "missing_query_artifact");
  // And specifically: it must not have quietly become the Q15 census.
  assert.equal(/q15/i.test(JSON.stringify(out)), false,
    "absence must not resolve to the Q15 authority census");
});

await test("a census with no database target is BLOCKED, never defaulted", () => {
  const out = def.validateInputs({
    worktreePath: root, worktree_path: root, queryArtifactPath: "q/good.sql",
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "missing_database_target");
});

await test("a malformed artifact is BLOCKED", () => {
  const missing = def.validateInputs({ ...base, queryArtifactPath: "q/does-not-exist.sql" });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "query_artifact_missing");

  const noSql = def.validateInputs({ ...base, queryArtifactPath: "q/malformed.json" });
  assert.equal(noSql.ok, false);
  assert.equal(noSql.code, "json_missing_sql");
});

await test("a hash that does not match its artifact is BLOCKED", () => {
  const out = def.validateInputs({
    ...base, queryArtifactPath: "q/good.sql", expectedQueryHash: "0".repeat(64),
  });
  assert.equal(out.ok, false);
  assert.equal(out.code, "query_hash_mismatch");
});

await test("an explicit, well-formed census is ACCEPTED", () => {
  const out = def.validateInputs({ ...base, queryArtifactPath: "q/good.sql" });
  assert.equal(out.ok, true, JSON.stringify(out));
  assert.equal(out.normalized.sql, GOOD_SQL);
  assert.equal(out.normalized.databaseTarget, "alloy_deployed_primary");
});

await test("the runtime no longer substitutes a census nobody asked for", () => {
  // artifactPathFrom is module-private, so this asserts the source: the two
  // callers on the EXECUTION path must receive null when there are no refs.
  const src = readFileSync(join(LIB, "governed-action-request.mjs"), "utf8");
  assert.match(src, /function artifactPathFrom\(refs = \[\], \{ fallback = null \} = \{\}\)/,
    "absence defaults to null, not to an artifact");
  assert.equal(/return first \? String\(first\) : Q15_CENSUS_ARTIFACT;/.test(src), false,
    "the Q15 substitution must be gone");
  // Execution paths take the fail-closed form (no fallback argument).
  assert.match(src, /queryArtifactPath: artifactPathFrom\(artifactRefs\),/);
  assert.match(src, /queryArtifactPath: artifactPathFrom\(rec\.artifact_refs\),/);
});
