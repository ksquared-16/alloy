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
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

/*
 * RESOLVED FROM THIS FILE. Tier 2 runs from scripts/local-dev/tests, where
 * "certification/migrations" does not exist - and the first version of this
 * gate SKIPPED its only real case there and reported 14 passed, 0 failed. A
 * gate that reports green by doing nothing is the exact defect family this
 * suite exists to police, so the skip is gone: if the directory cannot be
 * found, that is a failure, not a pass.
 */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const MIGRATIONS = join(ROOT, "certification", "migrations");

/*
 * The known-mixed set now lives in a MANIFEST, not in this file.
 *
 * certification/migrations/census-artifact-provenance.json records, for each
 * artifact, the id it states and the id that actually produced its results. A
 * pin that exists only inside a test warns nobody: the readers at risk here are
 * humans and forensic reconstruction, and they do not run the suite. The
 * manifest is the supersession record they can read; this gate enforces it.
 *
 * The artifacts themselves are untouched. Correcting a stated id in place would
 * be rewriting historical evidence, which is an operator decision.
 */
const MANIFEST = join(MIGRATIONS, "census-artifact-provenance.json");
function manifestEntries() {
  if (!existsSync(MANIFEST)) return [];
  try { return JSON.parse(readFileSync(MANIFEST, "utf8")).entries || []; } catch { return []; }
}
const KNOWN_MIXED = manifestEntries().map((e) => e.artifact);

test("A5 — no NEW committed census artifact may be mixed-generation", () => {
  assert.ok(existsSync(MIGRATIONS),
    `certification/migrations not found at ${MIGRATIONS}; this gate must never pass by skipping`);
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
  assert.ok(existsSync(MIGRATIONS), "resolved migrations directory must exist");
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


test("A5b — the manifest names an authoritative id for every artifact it lists", () => {
  // A supersession record that says "this one is wrong" without saying which id
  // IS right leaves the reader exactly where they started.
  for (const e of manifestEntries()) {
    assert.equal(e.status, "HISTORICAL_MIXED_GENERATION", e.artifact);
    assert.ok(e.authoritative_trusted_host_action_id, `no authoritative id for ${e.artifact}`);
    assert.notEqual(e.authoritative_trusted_host_action_id, e.stated_trusted_host_action_id, e.artifact);
    assert.ok(existsSync(join(MIGRATIONS, e.artifact)), `manifest names a missing artifact: ${e.artifact}`);
  }
});

test("A5c — and the manifest matches what the artifacts actually say", () => {
  // Measured against the files, so the record cannot drift from the evidence.
  for (const e of manifestEntries()) {
    const d = JSON.parse(readFileSync(join(MIGRATIONS, e.artifact), "utf8"));
    const g = censusEvidenceGeneration(d);
    assert.equal(g.coherent, false, `${e.artifact} is coherent now; remove it from the manifest`);
    assert.equal(g.trusted_host_action_id, e.stated_trusted_host_action_id, e.artifact);
    assert.equal(g.execution_trusted_host_action_id, e.authoritative_trusted_host_action_id, e.artifact);
  }
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
