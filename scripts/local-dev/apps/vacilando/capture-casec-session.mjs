#!/usr/bin/env node
/**
 * CASE C Start Session — desktop + mobile evidence.
 * Never prints the Gateway token. Does not attach to Identity tmux.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const BASE = process.env.VACILANDO_URL || "http://127.0.0.1:3020";
const OUT = join(HERE, "qa/gateway-v2");
const TOKEN = readFileSync(join(os.homedir(), ".local", "state", "alloy-dev", "gateway", "vacilando", "api-token"), "utf8").trim();
const LANE = "lane_336af3bdc474";

mkdirSync(OUT, { recursive: true });
const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
const { chromium } = pw;

async function login(page) {
  const overlay = page.locator("#gw-login");
  try { await overlay.waitFor({ state: "visible", timeout: 4000 }); }
  catch { return; }
  await page.locator("#gw-token").click();
  await page.keyboard.insertText(TOKEN);
  await page.locator("[data-gw-login-submit]").click();
  await page.waitForFunction(() => document.getElementById("gw-login")?.hidden === true, { timeout: 15000 });
}

function tmuxSessions() {
  try { return execFileSync("tmux", ["ls", "-F", "#{session_name}"], { encoding: "utf8" }).trim().split("\n"); }
  catch { return []; }
}

await withBrowserCertLease(async () => {
  const browser = await chromium.launch({ headless: true });
  const notes = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.setDefaultTimeout(25000);
    await desktop.goto(`${BASE}/#/lanes/${LANE}?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(desktop);
    await desktop.waitForSelector("[data-gw]", { timeout: 15000 });
    await desktop.waitForFunction(() => /Communications/.test(document.body.innerText || ""), { timeout: 20000 });
    notes.push("desktop_after_ok");
    const starting = await desktop.locator("[data-gw-session-start]").count();
    notes.push(`start_buttons=${starting}`);
    await desktop.waitForTimeout(1500);
    await desktop.screenshot({ path: join(OUT, "desktop-casec-after.png") });
    const body = (await desktop.locator("body").innerText()).replace(/\s+/g, " ").slice(0, 800);
    notes.push(`after_text=${body}`);
    notes.push(`tmux=${tmuxSessions().join(",")}`);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await mobile.goto(`${BASE}/#/lanes/${LANE}?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(mobile);
    await mobile.waitForSelector("[data-gw]", { timeout: 15000 });
    await mobile.waitForTimeout(1500);
    await mobile.screenshot({ path: join(OUT, "mobile-casec-session.png") });
    notes.push("mobile_ok");
  } finally {
    await browser.close();
  }
  writeFileSync(join(OUT, "casec-session.txt"), notes.join("\n") + "\n");
  console.log("captured", notes.length, "notes");
});
