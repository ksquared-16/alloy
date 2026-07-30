/**
 * Vacilando interactivity — Mission Control is the primary shell.
 * Run: cd web && node ../scripts/local-dev/tests/vacilando-interactivity.mjs
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(HERE, "../../../web/package.json"));
const { chromium } = require("playwright");

const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3021";
const OUT = join(HERE, "../../../docs/platform/planning/vacilando-os/qa/director-execution-v2");

function fail(msg) {
  console.error("FAIL:", msg);
  process.exit(1);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(12000);

const t0 = Date.now();
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
const tPaint = Date.now() - t0;

try {
  await page.click("#refresh-btn", { timeout: 8000 });
} catch (e) {
  fail(`Refresh button not clickable: ${e.message}`);
}
console.log(`time_to_dom=${tPaint}ms time_to_click_refresh=${Date.now() - t0}ms`);

const defaultHash = await page.evaluate(() => location.hash || "");
if (!defaultHash.includes("missions")) fail(`Default must be Mission Control; got ${defaultHash}`);
const enabled = await page.evaluate(() => window.VacilandoV2?.enabled === true && window.VacilandoV2?.gated === false);
if (!enabled) fail("VacilandoV2 must be enabled as primary");
console.log(`ok default hash=${defaultHash}`);

const routes = ["missions", "timeline", "workers", "decisions", "evidence", "settings"];
for (const route of routes) {
  const link = page.locator(`#nav a[data-route="${route}"]`);
  try {
    await link.click({ timeout: 5000 });
  } catch (e) {
    fail(`Nav ${route} not clickable: ${e.message}`);
  }
  await page.waitForTimeout(350);
  const hash = await page.evaluate(() => location.hash);
  if (!hash.includes(route)) fail(`Expected hash to include ${route}, got ${hash}`);
  console.log(`ok nav ${route} → ${hash}`);
}

mkdirSync(OUT, { recursive: true });
await page.goto(BASE + "/#/missions", { waitUntil: "domcontentloaded" });
await page.waitForSelector(".mc-wrap, [data-mc-shell]", { timeout: 10000 });
await page.screenshot({ path: join(OUT, "mc-interactive-missions.png"), timeout: 8000 });

await browser.close();
console.log("PASS vacilando interactivity (Mission Control primary)");
