/**
 * Is the client waterfall real server cost, or HTTP/1.1 connection-limit queueing?
 *
 * `next start` serves HTTP/1.1, where a browser opens ~6 connections per host. This page issues
 * ~35 requests in two bursts, so later requests can sit STALLED before their bytes are even sent —
 * time that Resource Timing's `duration` includes but the server never spent. Production behind
 * HTTP/2 would not queue the same way, so any optimization argued from `duration` alone risks
 * attacking a local artifact.
 *
 * stalled = requestStart - startTime   (queued/blocked, not server time)
 * server  = responseStart - requestStart  (true time-to-first-byte for that request)
 */
import { chromium } from "playwright";
import { homedir } from "os";
import { join } from "path";
import fs from "fs";

const STORAGE = join(homedir(), ".local/state/alloy-dev/auth/slot3/storage-state.json");
const BASE = "http://127.0.0.1:3013";
const URL_ = `${BASE}/workspace/work-unit/lifecycle_wu_lead?subject_id=b29921ca-b4d2-4cf4-b26c-2b9bd7263d78`;

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 960 } });
const page = await context.newPage();

await page.goto(URL_, { waitUntil: "domcontentloaded", timeout: 180000 });
await page.waitForTimeout(30000);

const rows = await page.evaluate(() =>
  performance.getEntriesByType("resource")
    .filter((r) => r.name.includes("/api/"))
    .map((r) => ({
      path: r.name.replace("http://127.0.0.1:3013/api/admin/", "").slice(0, 62),
      start: Math.round(r.startTime),
      stalled: Math.round(r.requestStart - r.startTime),
      ttfb: Math.round(r.responseStart - r.requestStart),
      download: Math.round(r.responseEnd - r.responseStart),
      dur: Math.round(r.duration),
      proto: r.nextHopProtocol,
      conn: Math.round(r.connectEnd - r.connectStart),
    }))
    .sort((a, b) => a.start - b.start));

console.log(`protocol: ${[...new Set(rows.map((r) => r.proto))].join(",")}   requests: ${rows.length}`);
console.log(`\n${"start".padStart(6)} ${"stalled".padStart(8)} ${"ttfb".padStart(7)} ${"dl".padStart(6)} ${"total".padStart(7)}  path`);
for (const r of rows)
  console.log(`${String(r.start).padStart(6)} ${String(r.stalled).padStart(8)} ${String(r.ttfb).padStart(7)} ${String(r.download).padStart(6)} ${String(r.dur).padStart(7)}  ${r.path}`);

const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(`\nTOTALS across ${rows.length} API requests:`);
console.log(`  stalled (queued, NOT server work): ${sum("stalled")}ms`);
console.log(`  ttfb    (real server work)       : ${sum("ttfb")}ms`);
console.log(`  download                         : ${sum("download")}ms`);
const worst = [...rows].sort((a, b) => b.stalled - a.stalled).slice(0, 8);
console.log(`\nmost-stalled requests:`);
worst.forEach((r) => console.log(`  stalled ${String(r.stalled).padStart(6)}ms of ${String(r.dur).padStart(6)}ms total  ${r.path}`));
fs.writeFileSync("/tmp/pe3/queueing.json", JSON.stringify(rows, null, 2));
await browser.close();
