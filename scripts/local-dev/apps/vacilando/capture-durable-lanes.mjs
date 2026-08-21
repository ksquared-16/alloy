#!/usr/bin/env node
/**
 * Durable lane identity + Connect Existing Work UI evidence (desktop + mobile).
 * Does not attach to tmux. Never prints the Gateway token.
 */
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3020";
const OUT = join(HERE, "qa/gateway-v2");
const TOKEN = readFileSync(join(os.homedir(), ".local", "state", "alloy-dev", "gateway", "vacilando", "api-token"), "utf8").trim();

mkdirSync(OUT, { recursive: true });

const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
const { chromium } = pw;

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
  const browser = await chromium.launch({ headless: true });
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.setDefaultTimeout(25000);
    await desktop.goto(`${BASE}/?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(desktop);
    await desktop.waitForFunction(() => location.hash.includes("lanes"), { timeout: 15000 });
    await desktop.waitForSelector("[data-gw]", { timeout: 15000 });
    await desktop.waitForFunction(() => {
      const titles = [...document.querySelectorAll("#lane-rail .mission-rail-title, .gw-lane-title")].map((e) => e.textContent || "");
      return titles.some((t) => /Access & Identity/.test(t)) && titles.some((t) => /Communications/.test(t));
    }, { timeout: 20000 });
    await desktop.screenshot({ path: join(OUT, "desktop-durable-lanes.png") });
    const listText = await desktop.locator("#lane-rail").innerText();
    if (!/Access & Identity/.test(listText) || !/Communications/.test(listText)) fail("desktop rail missing both durable names");
    if (/wt5-runtime|Runtime Performance/i.test(listText)) fail("Runtime appeared in lane list");

    await desktop.locator('#lane-rail [data-gw-lane^="lane_"]').first().click();
    await desktop.waitForSelector(".gw.is-detail", { timeout: 15000 });
    await desktop.waitForFunction(() => /Access & Identity|Communications/.test(document.querySelector(".gw-lane-h h1")?.textContent || ""), { timeout: 10000 });
    await desktop.screenshot({ path: join(OUT, "desktop-durable-detail.png") });
    const rename = await desktop.locator("[data-gw-rename]").count();
    if (!rename) fail("Rename Lane missing on desktop detail");

    await desktop.evaluate(() => { location.hash = "#/lanes/connect"; });
    await desktop.waitForSelector("[data-gw-mode=\"connect\"]", { timeout: 15000 });
    await desktop.screenshot({ path: join(OUT, "desktop-add-lane.png") });
    await desktop.locator("[data-gw-connect-existing]").click();
    await desktop.waitForSelector("[data-gw-candidates], .gw-empty", { timeout: 15000 });
    await desktop.screenshot({ path: join(OUT, "desktop-connect-existing.png") });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    mobile.setDefaultTimeout(25000);
    await mobile.goto(`${BASE}/?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(mobile);
    await mobile.waitForSelector("[data-gw]", { timeout: 15000 });
    await mobile.waitForFunction(() => {
      const t = document.body.innerText || "";
      return /Access & Identity/.test(t) && /Communications/.test(t);
    }, { timeout: 20000 });
    await mobile.screenshot({ path: join(OUT, "mobile-durable-lanes.png") });
    await mobile.locator("[data-gw-add]").click();
    await mobile.waitForSelector("[data-gw-connect-existing]", { timeout: 10000 });
    await mobile.screenshot({ path: join(OUT, "mobile-add-lane.png") });
    await mobile.locator("[data-gw-connect-existing]").click();
    await mobile.waitForSelector("[data-gw-candidates], .gw-empty", { timeout: 15000 });
    await mobile.screenshot({ path: join(OUT, "mobile-connect-existing.png") });

    const already = await mobile.locator("text=Already connected to Access & Identity").count();
    console.log(JSON.stringify({
      ok: true,
      desktop_list: join(OUT, "desktop-durable-lanes.png"),
      mobile_list: join(OUT, "mobile-durable-lanes.png"),
      identity_already_connected_copy: already > 0,
    }));
  } finally {
    await browser.close();
  }
});
