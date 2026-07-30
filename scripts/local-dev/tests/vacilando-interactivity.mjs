/**
 * P0 interactivity check — clicks through legacy Vacilando nav.
 * Fails if pointer/navigation is blocked or routes do not change.
 *
 * Run (server must be on :3021):
 *   cd web && node ../scripts/local-dev/tests/vacilando-interactivity.mjs
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
await page.goto(BASE + "/#/command", { waitUntil: "domcontentloaded" });
const tPaint = Date.now() - t0;

// Must become interactive: click Refresh without timeout
try {
  await page.click("#refresh-btn", { timeout: 8000 });
} catch (e) {
  fail(`Refresh button not clickable: ${e.message}`);
}
const tInteractive = Date.now() - t0;
console.log(`time_to_dom=${tPaint}ms time_to_click_refresh=${tInteractive}ms`);

const routes = [
  ["director", "Director"],
  ["command", "Command Center"],
  ["history", "Work History"],
  ["policies", "Policies"],
  ["trust", "Runtime Trust"],
  ["settings", "Settings"],
];

for (const [route, crumb] of routes) {
  const link = page.locator(`#nav a[data-route="${route}"]`);
  try {
    await link.click({ timeout: 5000 });
  } catch (e) {
    fail(`Nav ${route} not clickable: ${e.message}`);
  }
  await page.waitForTimeout(400);
  const hash = await page.evaluate(() => location.hash);
  if (!hash.includes(route)) fail(`Expected hash to include ${route}, got ${hash}`);
  const crumbText = await page.locator("#crumb").innerText();
  if (!crumbText.toLowerCase().includes(crumb.split(" ")[0].toLowerCase()) && crumbText !== crumb) {
    // soft check — crumb map may shorten
    console.log(`note: crumb after ${route} = ${crumbText}`);
  }
  console.log(`ok nav ${route} → ${hash}`);
}

// Worker selection if any worker card exists
const worker = page.locator("[data-sel], [data-slot], .wc, .sprint").first();
if (await worker.count()) {
  try {
    await worker.click({ timeout: 5000 });
    console.log("ok worker selection click");
  } catch (e) {
    console.log("note: worker click skipped:", e.message);
  }
}

// Confirm Mission Control is NOT forcing #/missions
await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
const defaultHash = await page.evaluate(() => location.hash || "");
if (defaultHash.includes("missions") && !defaultHash.includes("command") && !defaultHash.includes("director")) {
  fail(`Default route should not force Mission Control; got ${defaultHash}`);
}
console.log(`ok default hash=${defaultHash || "(empty→command)"}`);

// Confirm gated MC does not rewrite nav by default
const missionsPrimary = await page.locator("#nav a[data-route=missions]").count();
if (missionsPrimary > 0) {
  // gated script may add opt-in link only when enabled — should be 0 when gated
  const enabled = await page.evaluate(() => localStorage.getItem("vacilando_mission_control"));
  if (!enabled) fail("Missions nav present while Mission Control gate is off");
}

mkdirSync(OUT, { recursive: true });
await page.goto(BASE + "/#/command", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1000);
const shot = join(OUT, "p0-interactive-command-center.png");
await page.screenshot({ path: shot, timeout: 8000 });
console.log("screenshot", shot);

await browser.close();
console.log("PASS vacilando interactivity");
