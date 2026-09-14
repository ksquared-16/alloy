#!/usr/bin/env node
/**
 * THE CHECK SET MUST BE KNOWABLE BEFORE THE PULL REQUEST ANNOUNCES IT.
 *
 * PR 947 is the case these exist for. A registry contract was changed, the
 * change was green against every test in `scripts/local-dev/tests`, and CI then
 * failed on `web/tests/scripts/governedReconciliationExecutor.test.ts` — a
 * second suite over the same contract, in a different test root, which a grep
 * scoped to the first root cannot see. The repair cost another promotion.
 *
 * Case 4 is that exact query, and it is the one that must never regress: the
 * surface for the registry has to contain the web-tree suite.
 *
 * The rest pin the parts that are easy to get quietly wrong — glob expansion
 * (where chained replaces rewrite each other), the "no path filter" workflow
 * that runs on everything, and the classification that decides whether a red is
 * about the code or about the environment it was run in.
 */
import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  TEST_ROOTS, allTestFiles, classifyTest, discoverImpact, expectedCheckClasses,
  expectedTestSurface, globMatches, isTestFile, referenceTokens,
} from "../lib/vacilando/impact-discovery.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const REGISTRY = "scripts/local-dev/lib/vacilando/reconciliation-registry.mjs";

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); pass += 1; process.stdout.write(`ok  - ${name}\n`); }
  catch (e) { fail += 1; process.stdout.write(`FAIL - ${name} :: ${e.message}\n`); }
}

/* ── the roots ────────────────────────────────────────────────────────────── */

test("1 — every test root this repository actually uses is searched", () => {
  for (const r of ["scripts/local-dev/tests", "web/tests"]) {
    assert.ok(TEST_ROOTS.includes(r), `${r} is a real test root and must be searched`);
  }
  const files = allTestFiles(ROOT);
  assert.ok(files.length > 100, `expected a large inventory, found ${files.length}`);
  const roots = new Set(files.map((f) => f.split("/").slice(0, 2).join("/")));
  assert.ok(roots.size >= 2, "a single-root inventory is the defect this file exists for");
});

test("2 — a test file is recognised across all four naming conventions", () => {
  assert.ok(isTestFile("scripts/local-dev/tests/development-x.test.mjs"));
  assert.ok(isTestFile("web/tests/scripts/governedReconciliationExecutor.test.ts"));
  assert.ok(isTestFile("certification/playwright/financials-screens.cert.spec.ts"));
  assert.ok(isTestFile("web/tests/a.spec.tsx"));
  assert.ok(!isTestFile("scripts/local-dev/lib/vacilando/impact-discovery.mjs"));
});

/* ── THE PR 947 CASE ──────────────────────────────────────────────────────── */

test("3 — a changed module contributes its exported symbols as reference tokens", () => {
  const tokens = referenceTokens(ROOT, REGISTRY);
  assert.ok(tokens.includes("reconciliation-registry"), "the basename must be a token");
  assert.ok(tokens.some((t) => /RECONCILIATION/i.test(t)),
    "exports must be tokens too: the sibling suite names the contract, not the path");
  assert.ok(tokens.every((t) => t.length >= 4), "short tokens match everything and say nothing");
});

test("4 — PR 947: the registry's surface includes the OTHER test root", () => {
  const surface = expectedTestSurface(ROOT, [REGISTRY]).map((s) => s.test);
  assert.ok(surface.includes("web/tests/scripts/governedReconciliationExecutor.test.ts"),
    "this is the suite CI found after the branch was pushed; it must be found before");
  assert.ok(surface.some((s) => s.startsWith("scripts/local-dev/tests/")),
    "and the local-dev suites must still be there");
});

test("5 — every row says WHY it is in scope", () => {
  for (const row of expectedTestSurface(ROOT, [REGISTRY])) {
    assert.ok(row.reasons.length > 0, `${row.test} has no reason`);
    for (const r of row.reasons) {
      assert.equal(r.because, REGISTRY);
      assert.ok(r.via && r.via.length >= 4, "a reason with no token is not a reason");
    }
  }
});

test("6 — a changed test is its own surface", () => {
  const changed = "scripts/local-dev/tests/development-impact-discovery.test.mjs";
  const rows = expectedTestSurface(ROOT, [changed]);
  const self = rows.find((r) => r.test === changed);
  assert.ok(self, "a changed test must appear in its own expected surface");
  assert.equal(self.reasons[0].via, "changed_directly");
});

/* ── classification ───────────────────────────────────────────────────────── */

test("7 — a test is classified by how it must be RUN, not by where it lives", () => {
  assert.equal(classifyTest("/x/deployed-thing.test.mjs", ""), "live");
  assert.equal(classifyTest("/x/a.cert.spec.ts", ""), "live");
  assert.equal(classifyTest("/x/plain.test.mjs", "spawnSync('tmux')"), "host");
  assert.equal(classifyTest("/x/plain.test.mjs", "tmux + mkdtemp()"), "deterministic",
    "an isolated runtime root makes a tmux test deterministic again");
  assert.equal(classifyTest("/x/plain.test.mjs", "assert.ok(1)"), "deterministic");
});

/* ── the checks ───────────────────────────────────────────────────────────── */

test("8 — glob expansion survives patterns that rewrite each other", () => {
  assert.ok(globMatches("web/**", "web/app/page.tsx"));
  assert.ok(!globMatches("web/**", "scripts/x.mjs"));
  assert.ok(globMatches("scripts/local-dev/**", "scripts/local-dev/lib/a.mjs"));
  assert.ok(globMatches("**/*.sql", "certification/fixtures/a.sql"));
  assert.ok(globMatches(".github/workflows/*.yml", ".github/workflows/a.yml"));
  assert.ok(!globMatches(".github/workflows/*.yml", ".github/workflows/sub/a.yml"),
    "a single star must not cross a directory boundary");
});

test("9 — a workflow with no path filter is reported as running on everything", () => {
  const checks = expectedCheckClasses(ROOT, ["scripts/local-dev/lib/vacilando/impact-discovery.mjs"]);
  assert.ok(checks.length > 0, "no workflows found at all");
  const unfiltered = checks.filter((c) => c.why.includes("no path filter"));
  assert.ok(unfiltered.every((c) => c.triggers === true),
    "an unfiltered pull_request workflow always triggers, and forgetting that is how a check set is under-predicted");
  for (const c of checks) {
    assert.ok(typeof c.triggers === "boolean" && c.why, `${c.workflow} must say whether and why`);
  }
});

/* ── the whole answer ─────────────────────────────────────────────────────── */

test("10 — discoverImpact returns both claims plus what it could not cover", () => {
  const out = discoverImpact(ROOT, { paths: [REGISTRY] });
  assert.deepEqual(out.changed_files, [REGISTRY]);
  assert.ok(out.expected_test_surface.length >= 3);
  assert.ok(out.expected_check_classes.length >= 1);
  assert.ok(out.roots_searched.length === TEST_ROOTS.length);
  assert.deepEqual(out.changed_without_test_reference, [],
    "the registry is referenced by tests, so nothing should be reported as uncovered");
});

test("11 — a module nothing references is reported rather than passed over silently", () => {
  /*
   * THE NAME IS BUILT AT RUN TIME ON PURPOSE.
   *
   * The first version of this case spelled the unreferenced filename as a
   * literal — and the discovery then found THIS file, because the literal was
   * sitting in it. The tool was right and the case was self-defeating: a
   * textual search finds text, including the text of the test asserting that
   * nothing finds it. Assembling the name from fragments keeps it out of the
   * source being searched.
   */
  const name = ["unreferenced", Date.now().toString(36), "probe"].join("-");
  const out = discoverImpact(ROOT, { paths: [`certification/fixtures/${name}.sql`] });
  assert.deepEqual(out.changed_without_test_reference, [`certification/fixtures/${name}.sql`]);
  assert.deepEqual(out.expected_test_surface, [], "nothing references it, so nothing should be claimed");
});

test("12 — the discovery never claims to be exhaustive", () => {
  // The value is the floor it puts under a prediction, not a guarantee. If this
  // ever grows into a dependency graph the claim can change; until then the
  // contract is "these WILL run", never "only these can fail".
  const out = discoverImpact(ROOT, { paths: [REGISTRY] });
  assert.ok(!Object.prototype.hasOwnProperty.call(out, "complete"));
  assert.ok(!Object.prototype.hasOwnProperty.call(out, "exhaustive"));
});

process.stdout.write(`\n# pass ${pass}\n# fail ${fail}\n`);
process.exit(fail ? 1 : 0);
