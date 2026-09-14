#!/usr/bin/env node
/**
 * Run the Tier 2 partition and emit ONE result, rendered two ways.
 *
 * Replaces the inline bash loop whose red ledger reached only
 * GITHUB_STEP_SUMMARY. The counting now happens once, in
 * lib/vacilando/tier2-report.mjs, and both the markdown and the JSON are
 * derived from it - so a summary and an artifact cannot disagree.
 *
 * Each file is spawned DIRECTLY, not through a shell, so the bound's kill lands
 * on the child. An earlier local runner killed the subshell instead and leaked
 * real dispatch processes, one alive for nine minutes.
 *
 * Non-blocking by design: exits 0 whatever the reds say. Known reds exist and
 * are classified; failing this job would only train people to ignore it.
 */
import { spawn } from "node:child_process";
import { appendFileSync, readFileSync, writeFileSync } from "node:fs";
import {
  buildTier2Result, renderTier2Summary, renderTier2StdoutMarker,
} from "./lib/vacilando/tier2-report.mjs";

const [listPath, cwd, outPath] = process.argv.slice(2);
const BOUND_MS = Number(process.env.TIER2_FILE_BOUND_MS || 150_000);
const files = readFileSync(listPath, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
const startedAt = new Date().toISOString();
const observed = [];

for (const path of files) {
  const t0 = Date.now();
  const res = await new Promise((resolve) => {
    const child = spawn("node", [path], {
      cwd,
      env: { ...process.env, VACILANDO_AUTO_DISPATCH: "0" },
    });
    let out = "";
    const take = (d) => { if (out.length < 20_000) out += d; };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* */ } resolve({ code: 124, out }); }, BOUND_MS);
    child.on("exit", (code) => { clearTimeout(timer); resolve({ code: code ?? 1, out }); });
    child.on("error", () => { clearTimeout(timer); resolve({ code: 1, out }); });
  });
  const status = res.code === 0 ? "green" : res.code === 124 ? "timeout" : "red";
  observed.push({
    path, status, duration_ms: Date.now() - t0, exit_code: res.code,
    failure_excerpt: status === "green" ? null : firstUsefulLine(res.out),
  });
  process.stdout.write(`${status.toUpperCase().padEnd(8)}${path}\n`);
}

const result = buildTier2Result({
  testedSha: process.env.TIER2_TESTED_SHA || null,
  testedRef: process.env.TIER2_TESTED_REF || null,
  workflowDefinitionSha: process.env.TIER2_DEFINITION_SHA || null,
  workflowDefinitionRef: process.env.TIER2_DEFINITION_REF || null,
  startedAt,
  finishedAt: new Date().toISOString(),
  excluded: { tier3: process.env.TIER2_EXCLUDED_TIER3, tier4: process.env.TIER2_EXCLUDED_TIER4 },
  files: observed,
});

writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`\n${renderTier2StdoutMarker(result)}\n`);
process.stdout.write(`green=${result.green_count} red=${result.red_count} hang=${result.timeout_count}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${renderTier2Summary(result)}\n`);
}

/**
 * The line a triager would actually want.
 *
 * "The first non-blank line" is not it: a first pass returned
 * `node:internal/modules/run_main:123` for a real assertion failure, because a
 * stack frame is non-blank and comes first. So a failure-shaped line wins, and
 * the first meaningful line is only the fallback.
 */
function firstUsefulLine(text) {
  const lines = String(text || "").split("\n").map((l) => l.trim());
  const interesting = /^(FAIL|not ok|AssertionError|Error:|TypeError|ReferenceError|.*Error \[ERR_)/;
  const noise = /^(ok\b|#\s*(tests|suites|pass|fail|cancelled|skipped|todo|duration)|at\s|node:internal)/;
  const hit = lines.find((l) => l && interesting.test(l));
  if (hit) return hit.slice(0, 400);
  const any = lines.find((l) => l && !noise.test(l));
  return any ? any.slice(0, 400) : null;
}
