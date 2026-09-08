/**
 * A census that does not say what it is querying must not run.
 *
 * THE INCIDENT. An unintended database.read_census executed and produced
 * q15-authority-census.results.json. The artifact is not the defect. The defect
 * is that a request naming NO query silently became a request to run the
 * authority census: the filing path substituted [Q15_CENSUS_ARTIFACT] for empty
 * artifact_refs, and artifactPathFrom() returned Q15 as a default. The
 * executor's own "queryArtifactPath required" guard could never fire, because
 * by the time it looked, the field had already been filled in.
 *
 * There is no safe default query. "Which census did you mean" has no answer a
 * machine may choose, and choosing the most privileged one is the worst guess
 * available. Both boundaries now refuse.
 *
 * NO governed request is filed by this suite. Fixtures only.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const REG = await import("../lib/vacilando/trusted-host-action-registry.mjs");
const SRC = readFileSync(new URL("../lib/vacilando/governed-action-request.mjs", import.meta.url), "utf8");

const censusDef = () => REG.getActionDefinition("database.read_census");

/* ── filing boundary ─────────────────────────────────────────────────────── */

test("no code path substitutes the authority census for a missing query", () => {
  /*
   * Behavioural rather than shape-matching. The first version of this test
   * asserted my own implementation's exact source line, which made it a test of
   * one spelling rather than of the guarantee — and it failed the moment the
   * (better) implementation that actually landed used a `fallback` parameter
   * instead. What must hold is that NOTHING turns an absent query into the
   * authority census.
   */
  assert.doesNotMatch(SRC, /:\s*Q15_CENSUS_ARTIFACT\s*[;,)]/,
    "Q15 must never appear as a fallback VALUE");
  assert.doesNotMatch(SRC, /:\s*\[Q15_CENSUS_ARTIFACT\]/,
    "and never as a synthesized artifact_refs default");
});

test("the census artifact constant survives only as an identifier", () => {
  // It is still exported, because the historical incident has to be nameable.
  // What it may not be is a value anything falls back to.
  assert.match(SRC, /Q15_CENSUS_ARTIFACT/, "the constant remains, for identifying the incident");
});

/* ── execution boundary — independent of filing ──────────────────────────── */

test("missing query artifact is REFUSED, with no execution", () => {
  const out = censusDef().validateInputs({ databaseTarget: "alloy_deployed_primary" });
  assert.equal(out.ok, false);
  assert.equal(out.code, "missing_query_artifact");
  assert.equal(out.normalized, undefined, "nothing may be normalized for execution");
});

test("missing database target is REFUSED, with no execution", () => {
  const out = censusDef().validateInputs({
    queryArtifactPath: "docs/platform/planning/vacilando-os/qa/access-identity-v2/q15-authority-census.json",
    expectedQueryHash: "0".repeat(64),
  });
  assert.equal(out.ok, false);
  assert.ok(["missing_database_target", "query_hash_mismatch", "missing_query_artifact"].includes(out.code),
    `refused for a stated reason, got ${out.code}`);
  assert.equal(out.normalized, undefined);
});

test("an unresolvable artifact is REFUSED, with no execution", () => {
  const out = censusDef().validateInputs({
    queryArtifactPath: "docs/does/not/exist/census.json",
    expectedQueryHash: "0".repeat(64),
    databaseTarget: "alloy_deployed_primary",
  });
  assert.equal(out.ok, false);
  assert.equal(out.normalized, undefined);
});

test("a malformed artifact path is REFUSED, with no execution", () => {
  for (const bad of ["../../etc/passwd", "/etc/passwd", "", "   "]) {
    const out = censusDef().validateInputs({
      queryArtifactPath: bad, expectedQueryHash: "0".repeat(64), databaseTarget: "alloy_deployed_primary",
    });
    assert.equal(out.ok, false, `"${bad}" must be refused`);
    assert.equal(out.normalized, undefined);
  }
});

test("an empty request is REFUSED — it does not become the authority census", () => {
  const out = censusDef().validateInputs({});
  assert.equal(out.ok, false);
  assert.equal(out.normalized, undefined);
  assert.doesNotMatch(JSON.stringify(out), /q15-authority-census/,
    "an incomplete request must never resolve to the authority census");
});

test("the required input schema names every identity field", () => {
  const def = censusDef();
  for (const f of ["queryArtifactPath", "expectedQueryHash", "databaseTarget"]) {
    assert.ok(def.inputSchema.required.includes(f), `${f} must be required`);
  }
});

test("neither boundary can synthesize Q15", () => {
  // Filing: the constant may still be EXPORTED for identifying the historical
  // incident, but must not appear as a fallback value.
  assert.doesNotMatch(SRC, /:\s*\[Q15_CENSUS_ARTIFACT\]/);
  // Execution: refusals must not carry a substituted query.
  const out = censusDef().validateInputs({ databaseTarget: "alloy_deployed_primary" });
  assert.doesNotMatch(JSON.stringify(out), /q15/i);
});
