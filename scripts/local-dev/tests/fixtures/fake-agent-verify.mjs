#!/usr/bin/env node
// Test fixture — focused verify without Playwright.
import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    evidence: { type: "string" },
    "base-url": { type: "string" },
    storage: { type: "string" },
    screenshot: { type: "string" },
    reject: { type: "string" },
  },
  strict: false,
});

if (values.reject === "1") {
  console.error("error: rejected host");
  process.exit(2);
}

const evidence = values.evidence;
const target = positionals[0];
const arg = positionals[1];
if (!evidence) process.exit(2);

await mkdir(evidence, { recursive: true });
const stamp = "fixture";
const summaryPath = join(evidence, `verify-${stamp}.json`);
await writeFile(
  summaryPath,
  JSON.stringify({ target, arg, ok: true, workers: 1 }, null, 2),
  { mode: 0o600 }
);
console.log(`summary: ${summaryPath}`);
console.log("result: PASS");
