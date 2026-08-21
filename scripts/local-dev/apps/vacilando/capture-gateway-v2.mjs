#!/usr/bin/env node
/**
 * Gateway V2 — Lane Runtime UX certification (desktop + iPhone viewport).
 * Holds the browser-certification lease. Does not attach to tmux.
 * Never prints the Gateway token.
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
const MARKER = "VACILANDO_GATEWAY_V2_RUNTIME_UX";
const INSTRUCTION = `Gateway V2 runtime UX certification only. Do not modify files, run commands, or change the worktree. Reply with exactly: ${MARKER}`;

mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
    await desktop.waitForSelector('#lane-rail [data-gw-lane="alloy-identity"]', { timeout: 15000 });
    await desktop.screenshot({ path: join(OUT, "desktop-lanes.png") });

    const tClick = Date.now();
    await desktop.locator('#lane-rail [data-gw-lane="alloy-identity"]').click();
    await desktop.waitForSelector('.gw.is-detail[data-lane-id="alloy-identity"]', { timeout: 15000 });
    const tShell = Date.now() - tClick;
    await desktop.waitForFunction(() => {
      const h = document.querySelector(".gw-lane-h h1");
      return Boolean(h && /Access Identity/i.test(h.textContent || ""));
    }, { timeout: 15000 });
    const tIdentity = Date.now() - tClick;
    const loadingAfterIdentity = await desktop.locator("[data-gw-loading]").count();
    await desktop.waitForFunction(() => {
      const pre = document.querySelector("[data-gw-output]");
      const t = (pre?.textContent || "").trim();
      return t.length > 20 && t !== "Refreshing output…";
    }, { timeout: 25000 });
    const tOutput = Date.now() - tClick;
    console.log(JSON.stringify({
      phase: "desktop-entry",
      click_to_shell_ms: tShell,
      click_to_identity_ms: tIdentity,
      click_to_output_ms: tOutput,
      loading_after_identity: loadingAfterIdentity,
    }));
    if (loadingAfterIdentity) fail("known lane still showed loading shell after identity");
    await desktop.screenshot({ path: join(OUT, "desktop-identity.png") });
    const overflowDesk = await desktop.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (!overflowDesk) fail("desktop horizontal overflow");

    const status = desktop.locator("[data-gw-status]");
    const openBefore = await status.evaluate((el) => el.open);
    await status.locator("summary").click();
    const openAfter = await status.evaluate((el) => el.open);
    if (openBefore === openAfter) fail("Development Status did not toggle");
    await status.locator("summary").click();

    const outputBefore = await desktop.locator("[data-gw-output]").innerText();
    const tSend = Date.now();
    await desktop.fill("#gw-instruction", INSTRUCTION);
    await desktop.click("[data-gw-send]");
    await desktop.waitForFunction(() => {
      const n = document.querySelector("[data-gw-notice]");
      return n && /Delivered|refused|failed|progress|just sent/i.test(n.textContent || "");
    }, { timeout: 20000 });
    const tAck = Date.now() - tSend;
    const notice = await desktop.locator("[data-gw-notice]").innerText();
    console.log(JSON.stringify({ phase: "desktop-send", send_to_ack_ms: tAck, notice }));
    const last = await desktop.locator("[data-gw-last]").innerText();
    if (!/Your last instruction/i.test(last) || !last.includes("Reply with exactly")) {
      fail("last instruction not visible after delivery");
    }
    if (/Delivered/i.test(notice) && (await desktop.locator("#gw-instruction").inputValue())) {
      fail("composer did not clear after successful delivery");
    }
    await desktop.screenshot({ path: join(OUT, "desktop-after-send.png") });

    let saw = false;
    let tChange = null;
    for (let i = 0; i < 24; i++) {
      await sleep(2500);
      const text = await desktop.locator("[data-gw-output]").innerText();
      const presence = await desktop.locator("[data-gw-presence]").innerText();
      if (text !== outputBefore && (text.includes(MARKER) || /activity after your instruction/i.test(presence))) {
        saw = true;
        tChange = Date.now() - tSend;
        break;
      }
    }
    await desktop.screenshot({ path: join(OUT, "desktop-response.png") });
    console.log(JSON.stringify({ phase: "desktop-activity", send_to_output_change_ms: tChange, saw }));
    if (!saw && /Delivered/i.test(notice)) fail("did not observe output/activity change after send");

    await desktop.goto(`${BASE}/#/lanes`, { waitUntil: "domcontentloaded" });
    await desktop.waitForSelector('#lane-rail [data-gw-lane="alloy-identity"]', { timeout: 15000 });
    const rail = await desktop.locator('#lane-rail [data-gw-lane="alloy-identity"]').innerText();
    console.log(JSON.stringify({ phase: "desktop-list", rail: rail.slice(0, 180) }));

    await desktop.reload({ waitUntil: "domcontentloaded" });
    await desktop.goto(`${BASE}/#/lanes/alloy-identity`, { waitUntil: "domcontentloaded" });
    await desktop.waitForSelector("[data-gw-last]", { timeout: 20000 });
    const lastAfterReload = await desktop.locator("[data-gw-last]").innerText();
    if (!lastAfterReload.includes("Reply with exactly")) fail("refresh lost last instruction");

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(25000);
    await mobile.goto(`${BASE}/#/lanes`, { waitUntil: "domcontentloaded" });
    await login(mobile);
    await mobile.waitForSelector("[data-gw]", { timeout: 15000 });
    await mobile.waitForSelector('.gw-lanes [data-gw-lane="alloy-identity"]', { timeout: 15000 });
    await mobile.screenshot({ path: join(OUT, "mobile-lanes.png") });
    const tMob = Date.now();
    await mobile.locator('.gw-lanes [data-gw-lane="alloy-identity"]').click();
    await mobile.waitForSelector('.gw.is-detail[data-lane-id="alloy-identity"]', { timeout: 15000 });
    const tMobShell = Date.now() - tMob;
    await mobile.waitForFunction(() => /Access Identity/i.test(document.querySelector(".gw-lane-h h1")?.textContent || ""), { timeout: 15000 });
    const tMobIdentity = Date.now() - tMob;
    await mobile.waitForSelector("#gw-instruction", { timeout: 15000 });
    await mobile.waitForSelector("[data-gw-last], [data-gw-output]", { timeout: 15000 });
    const statusOpen = await mobile.locator("[data-gw-status]").evaluate((el) => el.open);
    if (statusOpen) fail("mobile Development Status defaulted open");
    const composerBox = await mobile.locator("#gw-instruction").boundingBox();
    if (!composerBox || composerBox.y > 844) fail("mobile composer not in iPhone viewport");
    const overflowMob = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (!overflowMob) fail("mobile horizontal overflow");
    await mobile.screenshot({ path: join(OUT, "mobile-identity.png") });
    console.log(JSON.stringify({
      phase: "mobile-entry",
      click_to_shell_ms: tMobShell,
      click_to_identity_ms: tMobIdentity,
      overflow_ok: overflowMob,
    }));
    await mobile.close();
  } finally {
    await browser.close();
  }
}, { reason: "vacilando gateway v2 lane runtime ux cert" });

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS gateway v2 runtime ux cert →", OUT);
