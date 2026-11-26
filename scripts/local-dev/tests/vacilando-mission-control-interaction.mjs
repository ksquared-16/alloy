/**
 * Mission Control primary-shell interaction test.
 * Fails on blocked pointers, wrong shell, legacy fallback, runaway requests.
 *
 * Run (server on :3021):
 *   cd web && node ../scripts/local-dev/tests/vacilando-mission-control-interaction.mjs
 *
 * Soak duration: VACILANDO_SOAK_MS (default 300000 = 5 minutes).
 */
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "../../../web/package.json"));
const { chromium } = require("playwright");

const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3021";
const SOAK_MS = Number(process.env.VACILANDO_SOAK_MS ?? 300_000);
const OUT = join(HERE, "../../../docs/platform/planning/vacilando-os/qa/director-execution-v2");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

async function clickNav(page, route) {
  const link = page.locator(`#nav a[data-route="${route}"]`);
  await link.click({ timeout: 8000 });
  await page.waitForTimeout(300);
  const hash = await page.evaluate(() => location.hash);
  if (!hash.includes(route) && !(route === "missions" && hash.includes("kickoff"))) {
    fail(`Expected hash to include ${route}, got ${hash}`);
  }
  const mc = await page.locator("[data-mc-shell], .mc-wrap").count();
  if (route !== "settings" && mc < 1) fail(`Mission Control shell missing after nav to ${route}`);
  // Hit-test: no full-screen overlay intercepting
  const blocked = await page.evaluate(() => {
    const el = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    if (!el) return "no_element";
    const ov = el.closest?.(".ov");
    if (ov) return "overlay";
    const pe = getComputedStyle(el).pointerEvents;
    if (pe === "none" && !el.closest("#nav")) return "pointer_events_none";
    return null;
  });
  if (blocked) fail(`Pointer blocked after ${route}: ${blocked}`);
  console.log(`ok nav ${route} → ${hash}`);
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.setDefaultTimeout(15000);

const reqCounts = { total: 0, byPath: {} };
page.on("request", (req) => {
  reqCounts.total += 1;
  try {
    const u = new URL(req.url());
    const key = u.pathname;
    reqCounts.byPath[key] = (reqCounts.byPath[key] || 0) + 1;
  } catch { /* */ }
});

const t0 = Date.now();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(600);
const tInteractive = Date.now() - t0;

// 1–2: Mission Control is active shell
let hash = await page.evaluate(() => location.hash);
if (!hash.includes("missions") && !hash.includes("timeline") && !hash.includes("workers")) {
  // may still be resolving enforceMissionControlHome
  await page.waitForTimeout(400);
  hash = await page.evaluate(() => location.hash);
}
if (!hash.includes("missions")) fail(`Default route must be Mission Control missions, got ${hash}`);

const v2 = await page.evaluate(() => ({
  enabled: window.VacilandoV2?.enabled,
  gated: window.VacilandoV2?.gated,
  observer: typeof MutationObserver !== "undefined",
}));
if (!v2.enabled || v2.gated) fail(`VacilandoV2 must be enabled ungated, got ${JSON.stringify(v2)}`);

await page.waitForSelector(".mc-wrap, [data-mc-shell]", { timeout: 10000 });
console.log(`ok default Mission Control hash=${hash} interactive_ms=${tInteractive}`);

// Stale localStorage must not demote
await page.evaluate(() => localStorage.setItem("vacilando_mission_control", "0"));
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
hash = await page.evaluate(() => location.hash);
const stillOn = await page.evaluate(() => window.VacilandoV2?.enabled === true && window.VacilandoV2?.gated === false);
if (!stillOn || !hash.includes("missions")) fail("Stale localStorage must not restore legacy shell");
console.log("ok stale localStorage cannot demote MC");

// 3–12: click through primary nav
await clickNav(page, "missions");
const missionCard = page.locator(".mc-card[data-nav^='missions/']").first();
if (await missionCard.count()) {
  await missionCard.click({ timeout: 8000 });
  await page.waitForTimeout(800);
  hash = await page.evaluate(() => location.hash);
  if (!/#\/missions\//.test(hash)) fail(`Expected mission detail hash, got ${hash}`);
  console.log("ok open mission", hash);
} else {
  console.log("note: no mission cards — continuing with empty list");
}

await clickNav(page, "timeline");
await clickNav(page, "workers");
const workerCard = page.locator(".mc-card[data-nav^='workers/']").first();
if (await workerCard.count()) {
  await workerCard.click({ timeout: 8000 });
  await page.waitForTimeout(500);
  console.log("ok open worker", await page.evaluate(() => location.hash));
}

await clickNav(page, "decisions");
const decCard = page.locator(".mc-card[data-nav^='decisions/']").first();
if (await decCard.count()) {
  await decCard.click({ timeout: 8000 });
  await page.waitForTimeout(500);
  console.log("ok open decision", await page.evaluate(() => location.hash));
}

await clickNav(page, "evidence");
await clickNav(page, "settings");
await clickNav(page, "missions");

// Hard refresh preserves MC
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
hash = await page.evaluate(() => location.hash);
if (!hash.includes("missions")) fail(`Hard refresh lost Mission Control, got ${hash}`);
await page.waitForSelector(".mc-wrap, [data-mc-shell]", { timeout: 10000 });
console.log("ok hard refresh preserves MC");

// Mobile width decision
await page.setViewportSize({ width: 390, height: 844 });
await clickNav(page, "decisions");
await page.setViewportSize({ width: 1280, height: 800 });

// 13: soak with polling
const before = reqCounts.total;
const soakStart = Date.now();
console.log(`soak ${SOAK_MS}ms starting…`);
while (Date.now() - soakStart < SOAK_MS) {
  await page.waitForTimeout(Math.min(15_000, SOAK_MS - (Date.now() - soakStart)));
  // Keep exercising main thread / nav responsiveness mid-soak
  await page.locator("#refresh-btn").click({ timeout: 5000 }).catch(() => {});
}
const after = reqCounts.total;
const delta = after - before;
const statePolls = reqCounts.byPath["/api/state"] || 0;
console.log(`soak done requests_delta=${delta} state_polls=${statePolls}`);
// Runaway: more than ~1 req/s average over soak is suspicious for idle shell
const maxExpected = Math.ceil(SOAK_MS / 1000) * 4 + 50;
if (delta > maxExpected) fail(`Runaway request loop: ${delta} requests during soak (max ${maxExpected})`);

// 14: repeat navigation after soak
await clickNav(page, "workers");
await clickNav(page, "missions");
await clickNav(page, "evidence");
await clickNav(page, "settings");
await clickNav(page, "missions");

// Dual-home check: landing on /#/command without legacy redirects to missions
await page.goto(BASE + "/#/command", { waitUntil: "domcontentloaded" });
await page.waitForFunction(() => location.hash.includes("missions"), null, { timeout: 5000 }).catch(() => {});
hash = await page.evaluate(() => location.hash);
if (!hash.includes("missions")) {
  fail(`Ambiguous dual-home: still on command without legacy flag (${hash})`);
}
console.log("ok command home redirects to Mission Control", hash);

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "mc-interaction-results.json"), JSON.stringify({
  ok: true,
  interactive_ms: tInteractive,
  soak_ms: SOAK_MS,
  requests_during_soak: delta,
  reqCounts,
  at: new Date().toISOString(),
}, null, 2));

await browser.close();
console.log("PASS mission-control interaction");
