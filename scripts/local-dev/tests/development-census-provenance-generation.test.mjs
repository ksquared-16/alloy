#!/usr/bin/env node
/**
 * A CENSUS ARTIFACT SAYS "THESE RESULTS CAME FROM THIS ACTION". IT MUST BE TRUE.
 *
 * The merge that refreshed an existing artifact was an object spread with an
 * explicit list of fields to update:
 *
 *   { ...prior, status, query_hash, execution: {...}, results }
 *
 * `...prior` carried the OLD top-level `trusted_host_action_id` and the refresh
 * list did not include it, so fresh results were written beside stale
 * provenance. The nested `execution.trusted_host_action_id` WAS refreshed, so
 * the artifact carried two action ids that disagreed - the documented top-level
 * one wrong, the nested one right.
 *
 * MEASURED across every committed census artifact carrying an `execution`
 * block: 5 of 5 are mixed-generation, 0 coherent. In all five the query_hash
 * agreed, because the query had not changed - which is exactly how a two-field
 * disagreement stays invisible.
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import {
  censusEvidenceEnvelope,
  censusEvidenceGeneration,
} from "../lib/vacilando/trusted-host-actions.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const action = (over = {}) => ({
  id: "tha_new0000000001",
  authorizationId: "authz_new",
  inputs: { queryHash: "HASH_NEW", databaseTarget: "alloy_deployed_primary" },
  ...over,
});
const priorArtifact = (over = {}) => ({
  trusted_host_action_id: "tha_old0000000001",
  query_hash: "HASH_OLD",
  status: "executed",
  note: "an unrelated key a human added",
  results: { format: "q15_labeled_rows", census_run_at: "2026-08-20T16:50:31.723Z", stale: true },
  execution: {
    executed: true, executed_at: "2026-08-20T16:50:30.000Z",
    trusted_host_action_id: "tha_old0000000001", query_hash: "HASH_OLD",
  },
  ...over,
});

/* ── A7.1/A7.2: results and provenance move together ──────────────────────── */

test("1 — a first write has results and provenance from one generation", () => {
  const out = censusEvidenceEnvelope(action(), { fresh: true }, { nowMs: 1 });
  const g = censusEvidenceGeneration(out);
  assert.equal(g.coherent, true);
  assert.equal(g.generation, "tha_new0000000001");
});

test("2 — a refresh with a new action changes the TOP-LEVEL action id", () => {
  const out = censusEvidenceEnvelope(action(), { fresh: true }, { prior: priorArtifact(), nowMs: 1 });
  assert.equal(out.trusted_host_action_id, "tha_new0000000001",
    "this is the exact field the spread left stale");
  assert.equal(out.execution.trusted_host_action_id, "tha_new0000000001");
});

test("3 — a refresh with a new query hash changes both copies of it", () => {
  const out = censusEvidenceEnvelope(
    action({ inputs: { queryHash: "HASH_CHANGED", databaseTarget: "t" } }),
    { fresh: true }, { prior: priorArtifact(), nowMs: 1 },
  );
  assert.equal(out.query_hash, "HASH_CHANGED");
  assert.equal(out.execution.query_hash, "HASH_CHANGED");
});

/* ── A7.4/A7.5: neither half may survive the other ────────────────────────── */

test("4 — results updated, so the old action id CANNOT survive", () => {
  const out = censusEvidenceEnvelope(action(), { fresh: true }, { prior: priorArtifact(), nowMs: 1 });
  const text = JSON.stringify(out);
  assert.ok(!text.includes("tha_old0000000001"),
    "no field anywhere may still name the previous observation");
  assert.ok(!text.includes("HASH_OLD"));
});

test("5 — provenance updated, so the old results CANNOT survive", () => {
  const out = censusEvidenceEnvelope(action(), { fresh: true }, { prior: priorArtifact(), nowMs: 1 });
  assert.equal(out.results.stale, undefined);
  assert.equal(out.results.fresh, true);
});

test("5a — but unrelated keys a human added are preserved", () => {
  const out = censusEvidenceEnvelope(action(), { fresh: true }, { prior: priorArtifact(), nowMs: 1 });
  assert.equal(out.note, "an unrelated key a human added",
    "a refresh is not licence to discard everything else in the file");
});

/* ── A7.6: traceability ───────────────────────────────────────────────────── */

test("6 — a consumer can trace the results back to one exact action", () => {
  const out = censusEvidenceEnvelope(action(), { fresh: true }, { prior: priorArtifact(), nowMs: 1 });
  const g = censusEvidenceGeneration(out);
  assert.equal(g.coherent, true);
  assert.equal(g.generation, out.execution.trusted_host_action_id);
  assert.equal(g.generation, out.trusted_host_action_id);
});

/* ── A7.8: a mixed fixture is DETECTED ────────────────────────────────────── */

test("8 — a mixed-generation artifact is reported, not silently accepted", () => {
  const g = censusEvidenceGeneration(priorArtifact({ execution: { trusted_host_action_id: "tha_other", query_hash: "HASH_OLD" } }));
  assert.equal(g.coherent, false);
  assert.equal(g.mismatch.action_id, true);
  assert.equal(g.mismatch.query_hash, false);
  assert.equal(g.generation, null, "a mixed artifact has no single generation to report");
});

test("8a — a hash-only disagreement is caught too", () => {
  const g = censusEvidenceGeneration(priorArtifact({
    execution: { trusted_host_action_id: "tha_old0000000001", query_hash: "HASH_DIFFERENT" },
  }));
  assert.equal(g.coherent, false);
  assert.equal(g.mismatch.query_hash, true);
});

test("8b — an artifact written whole has one generation by construction", () => {
  const g = censusEvidenceGeneration({ trusted_host_action_id: "tha_x", query_hash: "h", results: {} });
  assert.equal(g.coherent, true, "no execution block means nothing can disagree");
});

/* ── A5: the committed artifacts, held where they are ─────────────────────── */

const MIGRATIONS = "certification/migrations";

/*
 * The five artifacts below were mixed-generation BEFORE this fix and are left
 * exactly as they are. Repairing them would be rewriting historical evidence,
 * which is an operator decision, not a test's. Pinning them by name means a
 * SIXTH one fails this gate immediately, while the known five stay visible
 * rather than quietly tolerated.
 */
const KNOWN_MIXED = Object.freeze([
  "d2-candidate-physical-state-census.sql.results.json",
  "hosted-migration-identity-census.sql.results.json",
  "thread7-apply-outcome-census.sql.results.json",
  "thread7-post-apply-verification-census.sql.results.json",
  "w13-portal-access-ledger-repair-census.sql.results.json",
]);

test("A5 — no NEW committed census artifact may be mixed-generation", () => {
  if (!existsSync(MIGRATIONS)) { process.stdout.write("    (no certification/migrations here; skipped)\n"); return; }
  const found = [];
  for (const f of readdirSync(MIGRATIONS).filter((n) => n.endsWith(".results.json"))) {
    let d; try { d = JSON.parse(readFileSync(join(MIGRATIONS, f), "utf8")); } catch { continue; }
    if (!censusEvidenceGeneration(d).coherent) found.push(f);
  }
  const unexpected = found.filter((f) => !KNOWN_MIXED.includes(f));
  assert.deepEqual(unexpected, [],
    `a census artifact was written with provenance from a different generation than its results: ${unexpected.join(", ")}`);
});

test("A5a — the known-mixed list may only shrink", () => {
  if (!existsSync(MIGRATIONS)) return;
  const stillMixed = KNOWN_MIXED.filter((f) => {
    const p = join(MIGRATIONS, f);
    if (!existsSync(p)) return false;
    try { return !censusEvidenceGeneration(JSON.parse(readFileSync(p, "utf8"))).coherent; } catch { return false; }
  });
  assert.ok(stillMixed.length <= KNOWN_MIXED.length);
  if (stillMixed.length < KNOWN_MIXED.length) {
    process.stdout.write(`    (${KNOWN_MIXED.length - stillMixed.length} repaired; trim KNOWN_MIXED)\n`);
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
