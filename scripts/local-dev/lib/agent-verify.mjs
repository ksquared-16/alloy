#!/usr/bin/env node
/**
 * Focused agent verification — one worker, assigned localhost, storage state.
 * Captures console errors, failed requests, optional screenshot on failure.
 * Playwright is loaded from the managed worktree's web/ package context.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { loadPlaywrightFromWeb } from "./playwright-from-web.mjs";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "web-dir": { type: "string" },
    "base-url": { type: "string" },
    storage: { type: "string" },
    evidence: { type: "string" },
    screenshot: { type: "string", default: "on-failure" },
  },
});

const webDir = values["web-dir"];
const baseUrl = values["base-url"]?.replace(/\/$/, "");
const storage = values.storage;
const evidenceDir = values.evidence;
const target = positionals[0];
const targetArg = positionals[1];

if (!webDir || !baseUrl || !storage || !evidenceDir || !target) {
  console.error("error: missing required arguments (--web-dir, --base-url, --storage, --evidence, target)");
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = loadPlaywrightFromWeb(webDir));
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

await mkdir(evidenceDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const summaryPath = join(evidenceDir, `verify-${stamp}.json`);
const consoleErrors = [];
const failedRequests = [];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: storage });
const page = await context.newPage();

page.on("console", (msg) => {
  if (msg.type() === "error") {
    consoleErrors.push(msg.text());
  }
});
page.on("requestfailed", (req) => {
  failedRequests.push({ url: req.url(), failure: req.failure()?.errorText || "unknown" });
});

let route = "/workspace";
let ok = true;
let observed = "";

try {
  if (target === "authenticated-home") {
    route = "/workspace";
  } else if (target === "route" && targetArg) {
    route = targetArg.startsWith("/") ? targetArg : `/${targetArg}`;
  } else if (target === "focused-spec") {
    console.error("error: focused-spec must be run via alloy-validate (serialized lock)");
    process.exit(3);
  } else {
    console.error("error: unknown target");
    process.exit(2);
  }

  const url = `${baseUrl}${route}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  observed = page.url();
  const pathname = new URL(observed).pathname;
  if (pathname === "/login" || pathname.startsWith("/unauthorized")) {
    ok = false;
  }
} catch (err) {
  ok = false;
  observed = String(err?.message || "navigation failed");
}

let screenshotPath = "";
if (!ok || values.screenshot === "always") {
  screenshotPath = join(evidenceDir, `screenshot-${stamp}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
}

const summary = {
  target,
  route,
  baseUrl,
  ok,
  observed,
  consoleErrors,
  failedRequests,
  screenshot: screenshotPath || null,
  automated: true,
  timestamp: new Date().toISOString(),
};

await writeFile(summaryPath, JSON.stringify(summary, null, 2), { mode: 0o600 });
await browser.close();

console.log(`summary: ${summaryPath}`);
if (screenshotPath) console.log(`screenshot: ${screenshotPath}`);
console.log(`result: ${ok ? "PASS" : "FAIL"}`);
process.exit(ok ? 0 : 1);
