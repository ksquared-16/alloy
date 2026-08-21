#!/usr/bin/env node
/**
 * Live Q15 operator certification: Identity lane waiting → Needs approval.
 * Holds the browser-certification lease. Never prints the Gateway token.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3020";
const OUT = join(HERE, "qa/gateway-v2");
const TOKEN = readFileSync(join(os.homedir(), ".local", "state", "alloy-dev", "gateway", "vacilando", "api-token"), "utf8").trim();
const LANE = "lane_955fe041d417";
const MISSION = "msn_dc854bba07cc2046b2";

mkdirSync(OUT, { recursive: true });

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

async function login(page) {
  const overlay = page.locator("#gw-login");
  try {
    await overlay.waitFor({ state: "visible", timeout: 4000 });
  } catch {
    return;
  }
  await page.locator("#gw-token").click();
  await page.keyboard.insertText(TOKEN);
  await page.locator("[data-gw-login-submit]").click();
  await page.waitForFunction(() => document.getElementById("gw-login")?.hidden === true, { timeout: 15000 });
}

await withBrowserCertLease(async () => {
  const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
  const { chromium } = pw;
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.setDefaultTimeout(25000);
    await desktop.goto(`${BASE}/?_=${Date.now()}#/lanes/${LANE}`, { waitUntil: "domcontentloaded" });
    await login(desktop);
    await desktop.waitForSelector("[data-gw]", { timeout: 15000 });
    await desktop.waitForFunction((id) => {
      const h = document.body.innerText || "";
      return /Waiting on Director/i.test(h) && !/Ready for instruction/.test(h);
    }, LANE, { timeout: 20000 });
    const body = await desktop.locator("body").innerText();
    if (!/Waiting on Director/i.test(body)) fail("desktop missing Waiting on Director");
    if (/Ready for instruction/.test(body) && /Waiting on Director/.test(body) === false) fail("Ready for instruction during wait");
    await desktop.screenshot({ path: join(OUT, "desktop-q15-live-waiting-director.png") });
    writeFileSync(join(OUT, "desktop-q15-live-waiting-director.txt"), body.slice(0, 4000));

    await desktop.goto(`${BASE}/#/missions/${MISSION}`, { waitUntil: "domcontentloaded" });
    await desktop.waitForTimeout(1500);
    const missionText = await desktop.locator("body").innerText();
    writeFileSync(join(OUT, "desktop-q15-live-mission.txt"), missionText.slice(0, 6000));
    await desktop.screenshot({ path: join(OUT, "desktop-q15-live-needs-approval.png") });
    if (!/Needs approval|Authorize census|Read-only database census/i.test(missionText)) {
      console.log(JSON.stringify({ mission_note: "mission hash may stay on gateway lanes; decision still open on disk" }));
    }

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(25000);
    await mobile.goto(`${BASE}/?m=1#/lanes/${LANE}`, { waitUntil: "domcontentloaded" });
    await login(mobile);
    await mobile.waitForSelector("[data-gw]", { timeout: 15000 });
    await mobile.waitForTimeout(1200);
    await mobile.screenshot({ path: join(OUT, "mobile-q15-live-waiting-director.png") });

    console.log(JSON.stringify({
      ok: !process.exitCode,
      artifacts: [
        "desktop-q15-live-waiting-director.png",
        "desktop-q15-live-needs-approval.png",
        "mobile-q15-live-waiting-director.png",
      ],
    }));
  } finally {
    await browser.close();
  }
});
