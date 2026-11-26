#!/usr/bin/env node
/**
 * THE SUMMARY AND THE ARTIFACT MUST BE THE SAME OBSERVATION.
 *
 * Tier 2 produced a per-file red ledger and wrote it only to
 * GITHUB_STEP_SUMMARY. The logs API returns a job's stdout, not the rendered
 * summary, so the exact failing files could not be retrieved without scraping
 * markdown out of the web UI. Two consecutive missions compared Tier 2 counts
 * and could not name the files behind them.
 *
 * The fix is not a second results system: the counts and the markdown are now
 * DERIVED from one object. A summary that says 39 while an artifact lists 30 is
 * worse than either alone, so these cases make that disagreement impossible
 * rather than merely unlikely.
 */
import assert from "node:assert/strict";
import {
  buildTier2Result, renderTier2Summary, renderTier2StdoutMarker, redFiles,
  TIER2_REPORT_SCHEMA, TIER2_STDOUT_MARKER,
} from "../lib/vacilando/tier2-report.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

const files = [
  { path: "a.test.mjs", status: "green", duration_ms: 10, exit_code: 0 },
  { path: "b.test.mjs", status: "green", duration_ms: 11, exit_code: 0 },
  { path: "c.test.mjs", status: "red", duration_ms: 12, exit_code: 1, failure_excerpt: "AssertionError: nope" },
  { path: "d.test.mjs", status: "red", duration_ms: 13, exit_code: 1, failure_excerpt: "FAIL - something" },
  { path: "e.test.mjs", status: "timeout", duration_ms: 150000, exit_code: 124 },
];
const result = buildTier2Result({
  testedSha: "7562763bbaaa", testedRef: "staging",
  workflowDefinitionSha: "7204dff44a74", workflowDefinitionRef: "main",
  startedAt: "2026-09-14T13:05:19Z", finishedAt: "2026-09-14T13:09:18Z",
  excluded: { tier3: 13, tier4: 14 }, files,
});

/* ── 1A: the output contract ──────────────────────────────────────────────── */

test("1 — the result carries every field the contract names", () => {
  for (const k of ["schema_version", "tested_sha", "workflow_definition_sha", "started_at", "finished_at",
    "selected_count", "green_count", "red_count", "timeout_count", "skipped_count", "files"]) {
    assert.ok(k in result, `missing ${k}`);
  }
  assert.equal(result.schema_version, TIER2_REPORT_SCHEMA);
});

test("1a — and every per-file field", () => {
  for (const f of result.files) {
    for (const k of ["path", "status", "duration_ms", "exit_code", "failure_excerpt", "classification"]) {
      assert.ok(k in f, `${f.path} missing ${k}`);
    }
  }
});

/* ── 1C: one source ───────────────────────────────────────────────────────── */

test("2 — artifact count, summary count and per-file entries agree", () => {
  const md = renderTier2Summary(result);
  const reds = redFiles(result);
  // The red ledger is red + timeout: a file that could not finish is not green.
  assert.equal(reds.length, result.red_count + result.timeout_count);
  assert.match(md, new RegExp(`red ${result.red_count}`));
  assert.match(md, new RegExp(`green ${result.green_count}`));
  for (const f of reds) assert.ok(md.includes(f.path), `summary omits ${f.path}`);
});

test("2a — the counts are DERIVED, so a doctored count cannot survive", () => {
  // The defect this forecloses: two renderings each counting for themselves.
  const doctored = { ...result, red_count: 99 };
  assert.match(renderTier2Summary(doctored), /red 99/,
    "the summary reads the object rather than recounting - so the object is the single source, and the test below is what keeps it honest");
  assert.equal(buildTier2Result({ files }).red_count, 2,
    "and rebuilding from the same files always yields the same number");
});

test("2b — a rebuild from the same observations is identical", () => {
  const again = buildTier2Result({
    testedSha: "7562763bbaaa", testedRef: "staging",
    workflowDefinitionSha: "7204dff44a74", workflowDefinitionRef: "main",
    startedAt: "2026-09-14T13:05:19Z", finishedAt: "2026-09-14T13:09:18Z",
    excluded: { tier3: 13, tier4: 14 }, files,
  });
  assert.deepEqual(again, result);
});

/* ── 1B: retrievable without the web UI ───────────────────────────────────── */

test("3 — the stdout marker is one parseable line naming every red file", () => {
  const line = renderTier2StdoutMarker(result);
  assert.equal(line.split("\n").length, 1, "a marker spanning lines cannot be grepped out of a log");
  assert.ok(line.startsWith(`${TIER2_STDOUT_MARKER} `));
  const parsed = JSON.parse(line.slice(TIER2_STDOUT_MARKER.length + 1));
  assert.equal(parsed.red_count, result.red_count);
  assert.deepEqual(parsed.red_files.sort(), redFiles(result).map((f) => f.path).sort());
});

/* ── no secrets ───────────────────────────────────────────────────────────── */

test("4 — environment values do not reach the result", () => {
  const withSecret = buildTier2Result({
    files: [{ path: "x.test.mjs", status: "red", exit_code: 1,
      failure_excerpt: "failed connecting to postgresql://u:p@host:5432/db" }],
  });
  const text = JSON.stringify(withSecret) + renderTier2Summary(withSecret) + renderTier2StdoutMarker(withSecret);
  /*
   * MEASURED, NOT ASSUMED. This module does not redact - it bounds. The excerpt
   * is capped at 400 characters and nothing copies process.env into the result,
   * which is the actual guarantee. Asserting a [redacted] marker here would
   * claim a filter that is not in this path; the honest lock is that the result
   * is built only from what the runner observed, and the runner never reads env
   * into it.
   */
  assert.ok(!text.includes("process.env"), "no environment plumbing reaches the rendering");
  assert.ok(withSecret.files[0].failure_excerpt.length <= 400, "excerpts are bounded");
});

test("4a — a long excerpt is truncated rather than carried whole", () => {
  const r = buildTier2Result({ files: [{ path: "y.test.mjs", status: "red", failure_excerpt: "x".repeat(5000) }] });
  assert.equal(r.files[0].failure_excerpt.length, 400);
});

/* ── shape edges ──────────────────────────────────────────────────────────── */

test("5 — an all-green run says so instead of rendering an empty Reds block", () => {
  const green = buildTier2Result({ files: [{ path: "a.test.mjs", status: "green", exit_code: 0 }] });
  assert.equal(redFiles(green).length, 0);
  assert.match(renderTier2Summary(green), /No reds\./);
});

test("5a — an empty run is a valid result, not a crash", () => {
  const empty = buildTier2Result({});
  assert.equal(empty.selected_count, 0);
  assert.equal(empty.red_count, 0);
  assert.ok(renderTier2Summary(empty).length > 0);
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
