#!/usr/bin/env node
/**
 * Say what a candidate will be judged by, before the pull request says so.
 *
 *   node scripts/local-dev/impact-discovery.mjs --base origin/staging [--head HEAD] [--json]
 *   node scripts/local-dev/impact-discovery.mjs --paths a/b.mjs,c/d.ts
 *
 * Prints EXPECTED_TEST_SURFACE and EXPECTED_CHECK_CLASSES. Run it BEFORE
 * pushing a promotion candidate — the whole point is to find the sibling suite
 * while it is still cheap to fix.
 */
import { discoverImpact } from "./lib/vacilando/impact-discovery.mjs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const argv = process.argv.slice(2);
const arg = (name, fallback = null) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
};

const paths = arg("paths");
const out = discoverImpact(ROOT, {
  baseRef: arg("base", "origin/staging"),
  headRef: arg("head", "HEAD"),
  paths: paths ? paths.split(",").map((s) => s.trim()).filter(Boolean) : null,
});

if (argv.includes("--json")) {
  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(0);
}

const w = (s) => process.stdout.write(`${s}\n`);
w("");
w(`CHANGED FILES (${out.changed_files.length})`);
for (const f of out.changed_files) w(`  ${f}`);

w("");
w(`EXPECTED_TEST_SURFACE (${out.expected_test_surface.length})`);
const order = ["deterministic", "repo_audit", "host", "live"];
for (const kind of order) {
  const rows = out.expected_test_surface.filter((r) => r.kind === kind);
  if (!rows.length) continue;
  w(`  ${kind}:`);
  for (const r of rows) w(`    ${r.test}   (via ${r.reasons[0].via})`);
}
if (!out.expected_test_surface.length) w("  (nothing references the changed files)");

w("");
w("EXPECTED_CHECK_CLASSES");
for (const c of out.expected_check_classes.filter((c) => c.triggers)) w(`  WILL RUN   ${c.name} — ${c.why}`);
for (const c of out.expected_check_classes.filter((c) => !c.triggers)) w(`  skipped    ${c.name} — ${c.why}`);

if (out.changed_without_test_reference.length) {
  w("");
  w("CHANGED WITH NO TEST REFERENCE");
  for (const f of out.changed_without_test_reference) w(`  ${f}`);
}

w("");
w(`roots searched: ${out.roots_searched.join(", ")}`);
w("This is a floor, not a guarantee: it says what WILL run, never that only these can fail.");
w("");
