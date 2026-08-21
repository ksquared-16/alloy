#!/usr/bin/env node
/**
 * Communications complete-output certification. Read-only: no send.
 * Never prints the Gateway token.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const LOOPBACK = "http://127.0.0.1:3020";
const HTTPS = process.env.VACILANDO_HTTPS_URL || "https://macbook-air-2.tail2aa1af.ts.net";
const OUT = join(HERE, "qa/gateway-v2");
const TOKEN = readFileSync(join(os.homedir(), ".local", "state", "alloy-dev", "gateway", "vacilando", "api-token"), "utf8").trim();
const LANE = "lane_336af3bdc474";

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

async function openCommunications(page) {
  await page.goto(`${LOOPBACK}/#/lanes/${LANE}?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.waitForSelector(`.gw.is-detail[data-lane-id="${LANE}"]`, { timeout: 20000 });
  await page.waitForFunction(() => {
    const pre = document.querySelector("[data-gw-output]");
    const t = pre?.textContent || "";
    return t.trim() && t !== "Refreshing output…";
  }, { timeout: 20000 });
}

await withBrowserCertLease({ reason: "complete-output certification" }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const desktop = await context.newPage();
    desktop.setDefaultTimeout(25000);
    const outputHits = [];
    desktop.on("request", (req) => {
      if (/\/api\/lanes\/[^/]+\/output/.test(req.url())) outputHits.push(req.url());
    });
    await openCommunications(desktop);
    const recentHint = await desktop.locator("[data-gw-output-chrome]").innerText().catch(() => "");
    await desktop.screenshot({ path: join(OUT, "desktop-comms-recent.png"), fullPage: true });
    if (!/visible pane|not currently shown|Latest Claude/i.test(recentHint)) {
      fail(`recent chrome missing honesty: ${recentHint.slice(0, 180)}`);
    }

    await desktop.locator("[data-gw-output-latest]").click();
    await desktop.waitForFunction(() => window.VacilandoGateway?._state?.outputMode === "latest_response", { timeout: 15000 });
    await desktop.waitForFunction(() => /Grant repair/i.test(document.querySelector("[data-gw-output]")?.textContent || ""), { timeout: 15000 });
    await desktop.screenshot({ path: join(OUT, "desktop-comms-latest.png"), fullPage: true });
    const latestModel = await desktop.evaluate(() => window.VacilandoGateway._state.output.text);
    if (!/# Grant repair/.test(latestModel)) fail("latest model missing grant-repair heading");
    if (latestModel.length < 4000) fail(`latest model too short: ${latestModel.length}`);

    const hitsBeforeCopy = outputHits.length;
    await desktop.locator("[data-gw-copy]").click();
    await desktop.waitForFunction(() => /Copied/.test(document.querySelector("[data-gw-copy]")?.textContent || ""), { timeout: 5000 });
    const clip = await desktop.evaluate(async () => navigator.clipboard.readText());
    const hitsAfterCopy = outputHits.length;
    if (clip !== latestModel) fail("clipboard !== loaded latest model");
    if (hitsAfterCopy !== hitsBeforeCopy) fail("Copy issued another output capture");
    writeFileSync(join(OUT, "comms-latest-copy.txt"), clip);

    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    const mobile = await mobileCtx.newPage();
    await openCommunications(mobile);
    await mobile.screenshot({ path: join(OUT, "mobile-comms-recent.png"), fullPage: true });
    await mobile.locator("[data-gw-output-latest]").click();
    await mobile.waitForFunction(() => /Grant repair/i.test(document.querySelector("[data-gw-output]")?.textContent || ""), { timeout: 15000 });
    await mobile.screenshot({ path: join(OUT, "mobile-comms-latest.png"), fullPage: true });
    await mobileCtx.close();

    const httpsCtx = await browser.newContext();
    const httpsPage = await httpsCtx.newPage();
    const cookieProbe = [];
    httpsPage.on("response", (res) => {
      if (res.url().includes("/api/gateway/session") && res.request().method() === "POST") {
        const sc = res.headers()["set-cookie"] || "";
        cookieProbe.push({
          secure: /(?:^|;)\s*secure(?:;|$)/i.test(sc),
          httponly: /httponly/i.test(sc),
          samesite: /samesite=lax/i.test(sc),
        });
      }
    });
    await httpsPage.goto(`${HTTPS}/#/lanes/${LANE}?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(httpsPage);
    await httpsPage.waitForSelector("[data-gw]", { timeout: 20000 });
    await httpsPage.screenshot({ path: join(OUT, "https-serve-comms.png"), fullPage: true });
    if (!cookieProbe.some((c) => c.secure && c.httponly && c.samesite)) {
      fail(`HTTPS session cookie flags missing: ${JSON.stringify(cookieProbe)}`);
    }
    await httpsCtx.close();
    await context.close();

    console.log(JSON.stringify({
      ok: process.exitCode ? false : true,
      latest_chars: latestModel.length,
      clipboard_matches_model: clip === latestModel,
      copy_recapture: hitsAfterCopy !== hitsBeforeCopy,
      recent_hint: recentHint.slice(0, 160),
      https_secure_cookie: cookieProbe[0] || null,
    }, null, 2));
  } finally {
    await browser.close();
  }
});
