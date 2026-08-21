#!/usr/bin/env node
/**
 * Gateway V2 — pinned composer layout certification (desktop + iPhone viewport).
 * Does not send instructions. Does not attach to tmux. Never prints the token.
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

async function measureComposer(page, label) {
  return page.evaluate((where) => {
    const app = document.querySelector(".app");
    const gw = document.querySelector(".gw.is-detail");
    const main = document.querySelector(".gw-main");
    const thread = document.querySelector("[data-gw-thread]");
    const composer = document.querySelector("[data-gw-composer]");
    const output = document.querySelector("[data-gw-output]");
    const ta = document.getElementById("gw-instruction");
    if (!gw || !thread || !composer || !output || !ta) {
      return { where, ok: false, error: "missing_shell" };
    }
    const vh = window.visualViewport?.height || window.innerHeight;
    const tr = thread.getBoundingClientRect();
    const cr = composer.getBoundingClientRect();
    const or = output.getBoundingClientRect();
    const tar = ta.getBoundingClientRect();
    const styles = getComputedStyle(thread);
    const composerPos = getComputedStyle(composer).position;
    const overflowX = document.documentElement.scrollWidth <= window.innerWidth + 1;
    const threadScrolls = styles.overflowY === "auto" || styles.overflowY === "scroll" || thread.scrollHeight > thread.clientHeight + 4;
    const composerInView = cr.bottom <= vh + 2 && cr.top >= 0;
    const noOverlap = or.bottom <= cr.top + 2 || output.scrollHeight <= thread.clientHeight;
    return {
      where,
      ok: true,
      viewport: { w: window.innerWidth, h: window.innerHeight, vvh: vh },
      thread: { top: Math.round(tr.top), bottom: Math.round(tr.bottom), height: Math.round(tr.height), overflowY: styles.overflowY, scrollHeight: thread.scrollHeight, clientHeight: thread.clientHeight },
      composer: { top: Math.round(cr.top), bottom: Math.round(cr.bottom), height: Math.round(cr.height), position: composerPos },
      textarea: { top: Math.round(tar.top), height: Math.round(tar.height), fontSize: getComputedStyle(ta).fontSize },
      outputBottom: Math.round(or.bottom),
      composerInView,
      composerBelowThread: cr.top + 1 >= tr.bottom - 8 || cr.top >= tr.top,
      threadOwnsScroll: threadScrolls,
      noHorizontalOverflow: overflowX,
      composerNotFixed: composerPos !== "fixed",
      appHasDetail: Boolean(app?.querySelector(".gw.is-detail")),
    };
  }, label);
}

await withBrowserCertLease(async () => {
  const browser = await chromium.launch({ headless: true });
  const evidence = [];
  try {
    const desktop = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    desktop.setDefaultTimeout(25000);
    await desktop.goto(`${BASE}/?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(desktop);
    await desktop.waitForSelector("#lane-rail [data-gw-lane]", { timeout: 15000 });
    const firstLane = desktop.locator("#lane-rail [data-gw-lane]").first();
    await firstLane.click();
    await desktop.waitForSelector(".gw.is-detail [data-gw-thread]", { timeout: 15000 });
    await desktop.waitForSelector("#gw-instruction", { timeout: 15000 });
    const long = Array.from({ length: 60 }, (_, i) => `output line ${i + 1} — certification`).join("\n");
    await desktop.evaluate((text) => {
      const pre = document.querySelector("[data-gw-output]");
      if (pre) pre.textContent = text;
    }, long);
    const before = await measureComposer(desktop, "desktop-wide");
    evidence.push(before);
    if (!before.ok) fail(`desktop shell missing: ${before.error}`);
    if (!before.composerInView) fail("desktop composer not in viewport");
    if (!before.composerNotFixed) fail("desktop composer used position:fixed against the browser");
    if (!before.noHorizontalOverflow) fail("desktop horizontal overflow");
    const thread = desktop.locator("[data-gw-thread]");
    await thread.evaluate((el) => { el.scrollTop = 0; });
    const topScroll = await thread.evaluate((el) => el.scrollTop);
    await thread.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const botScroll = await thread.evaluate((el) => el.scrollTop);
    if (!(botScroll > topScroll)) fail("desktop thread did not own vertical scroll");
    const composerStill = await desktop.locator("[data-gw-composer]").boundingBox();
    if (!composerStill || composerStill.y + 8 > 900) fail("desktop composer left the viewport after thread scroll");
    await desktop.fill("#gw-instruction", "line one\nline two\nline three\nline four\nline five");
    await desktop.locator("#gw-instruction").dispatchEvent("input");
    const multi = await measureComposer(desktop, "desktop-multiline");
    evidence.push(multi);
    if (multi.textarea.height < 72) fail("desktop multiline composer did not grow");
    await desktop.screenshot({ path: join(OUT, "desktop-composer-pinned.png") });

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(25000);
    await mobile.goto(`${BASE}/#/lanes`, { waitUntil: "domcontentloaded" });
    await login(mobile);
    await mobile.waitForSelector(".gw-lanes [data-gw-lane]", { timeout: 15000 });
    await mobile.locator(".gw-lanes [data-gw-lane]").first().click();
    await mobile.waitForSelector(".gw.is-detail [data-gw-thread]", { timeout: 15000 });
    await mobile.waitForSelector("#gw-instruction", { timeout: 15000 });
    const statusOpen = await mobile.locator("[data-gw-status]").evaluate((el) => el.open);
    if (statusOpen) fail("mobile Development Status defaulted open");
    await mobile.evaluate((text) => {
      const pre = document.querySelector("[data-gw-output]");
      if (pre) pre.textContent = text;
    }, long);
    const mob = await measureComposer(mobile, "iphone");
    evidence.push(mob);
    if (!mob.ok) fail(`mobile shell missing: ${mob.error}`);
    if (!mob.composerInView) fail("iPhone composer not in viewport");
    if (Number.parseFloat(mob.textarea.fontSize) < 16) fail("iPhone composer font-size below 16px");
    if (!mob.noHorizontalOverflow) fail("iPhone horizontal overflow");
    if (!mob.composerNotFixed) fail("iPhone composer used position:fixed against the browser");
    const mobThread = mobile.locator("[data-gw-thread]");
    await mobThread.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    const mobComposer = await mobile.locator("[data-gw-composer]").boundingBox();
    if (!mobComposer || mobComposer.y < 0 || mobComposer.y > 844) fail("iPhone composer not pinned after thread scroll");
    await mobile.screenshot({ path: join(OUT, "mobile-composer-pinned.png") });

    writeFileSync(join(OUT, "composer-layout.json"), `${JSON.stringify({ evidence, thread_scrolled: { desktop: { topScroll, botScroll } } }, null, 2)}\n`);
    console.log(JSON.stringify({ ok: !process.exitCode, evidence }, null, 2));
  } finally {
    await browser.close();
  }
}, { reason: "gateway composer layout certification" });
