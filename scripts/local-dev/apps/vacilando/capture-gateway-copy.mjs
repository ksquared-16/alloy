#!/usr/bin/env node
/**
 * Gateway V2 — Copy certification (read-only). Does not send instructions.
 * Never prints the Gateway token.
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

async function certifyCopy(page, label) {
  const outputHits = [];
  page.on("request", (req) => {
    if (/\/api\/lanes\/[^/]+\/output/.test(req.url())) outputHits.push(req.url());
  });
  await page.goto(`${BASE}/#/lanes?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.waitForFunction(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return vis('#lane-rail [data-gw-lane="alloy-identity"]') || vis('.gw-lanes [data-gw-lane="alloy-identity"]');
  }, { timeout: 25000 });
  const rail = page.locator('#lane-rail [data-gw-lane="alloy-identity"]');
  const list = page.locator('.gw-lanes [data-gw-lane="alloy-identity"]');
  if (await list.isVisible()) await list.click();
  else await rail.click();
  await page.waitForFunction(() => /Access Identity/i.test(document.querySelector(".gw-lane-h h1")?.textContent || ""), { timeout: 15000 });
  await page.waitForFunction(() => {
    const pre = document.querySelector("[data-gw-output]");
    const btn = document.querySelector("[data-gw-copy]");
    if (!pre || !btn || btn.disabled) return false;
    const t = pre.textContent || "";
    return t.trim() && t !== "Refreshing output…";
  }, { timeout: 20000 });
  const displayed = await page.locator("[data-gw-output]").innerText();
  const model = await page.evaluate(() => window.VacilandoGateway?._state?.output?.text || "");
  const beforeHits = outputHits.length;
  await page.locator("[data-gw-copy]").click();
  await page.waitForFunction(() => /Copied|Copy failed/.test(document.querySelector("[data-gw-copy]")?.textContent || ""), { timeout: 5000 });
  const labelNow = await page.locator("[data-gw-copy]").innerText();
  const clip = await page.evaluate(async () => navigator.clipboard.readText());
  const afterHits = outputHits.length;
  if (labelNow !== "Copied") fail(`${label}: copy feedback was ${labelNow}`);
  if (clip !== displayed && clip !== model) fail(`${label}: clipboard did not match displayed output`);
  if (clip.includes("Your last instruction") || clip.includes("Access Identity V2") && clip.length < 80) {
    fail(`${label}: clipboard looks like metadata`);
  }
  if (afterHits !== beforeHits) fail(`${label}: Copy triggered another output fetch (${beforeHits} → ${afterHits})`);
  await page.screenshot({ path: join(OUT, `${label}.png`) });
  writeFileSync(join(OUT, `${label}.txt`), clip);
  console.log(JSON.stringify({
    phase: label,
    copied_chars: clip.length,
    matches_display: clip === displayed,
    matches_model: clip === model,
    extra_output_fetches: afterHits - beforeHits,
    feedback: labelNow,
  }));
}

await withBrowserCertLease(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const desktopCtx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      permissions: ["clipboard-read", "clipboard-write"],
    });
    const desktop = await desktopCtx.newPage();
    desktop.setDefaultTimeout(25000);
    await certifyCopy(desktop, "desktop-copy");
    await desktopCtx.close();

    const mobileCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      permissions: ["clipboard-read", "clipboard-write"],
      hasTouch: true,
      isMobile: true,
    });
    const mobile = await mobileCtx.newPage();
    mobile.setDefaultTimeout(25000);
    await certifyCopy(mobile, "mobile-copy");
    const box = await mobile.locator("[data-gw-copy]").boundingBox();
    if (!box || box.height < 40) fail(`mobile copy tap target too small: ${box?.height}`);
    await mobileCtx.close();
  } finally {
    await browser.close();
  }
}, { reason: "vacilando gateway v2 copy cert" });

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS gateway copy cert →", OUT);
