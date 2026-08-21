#!/usr/bin/env node
/**
 * Gateway V2 — Claude telemetry certification (read-only).
 * Does not send instructions, attach tmux, or mutate the identity worktree.
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
    desktop.on("pageerror", (err) => console.error("desktop pageerror", String(err)));
    await desktop.goto(`${BASE}/#/lanes?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
    await login(desktop);
    await desktop.waitForSelector('#lane-rail [data-gw-lane="alloy-identity"]', { timeout: 15000 });
    const tClick = Date.now();
    await desktop.locator('#lane-rail [data-gw-lane="alloy-identity"]').click();
    await desktop.waitForFunction(() => /Access Identity/i.test(document.querySelector(".gw-lane-h h1")?.textContent || ""), { timeout: 15000 });
    const identityMs = Date.now() - tClick;
    const loading = await desktop.locator("[data-gw-loading]").count();
    await desktop.waitForFunction(() => /Context\s+\d+%/.test(document.querySelector("[data-gw-context]")?.textContent || ""), { timeout: 25000 });
    const telMs = Date.now() - tClick;
    const ctx = await desktop.locator("[data-gw-context]").innerText().catch(() => "");
    const agent = await desktop.locator("[data-gw-agent]").innerText().catch(() => "");
    const usage = await desktop.locator("[data-gw-usage]").innerText().catch(() => "");
    const body = await desktop.locator("body").innerText();
    if (/\$0(\.00)?/.test(usage) && /Session cost/.test(usage) && !/8\./.test(usage)) fail("unknown cost rendered as $0");
    if (!/Context/i.test(ctx + agent)) fail("context not visible");
    if (!/claude-opus|Claude Code/i.test(agent)) fail("agent block missing");
    if (/Slot/.test(body) && /<dt>Slot/.test(await desktop.content())) fail("slot should remain unset");
    await desktop.screenshot({ path: join(OUT, "desktop-telemetry.png") });
    console.log(JSON.stringify({
      phase: "desktop-telemetry",
      click_to_identity_ms: identityMs,
      click_to_telemetry_ms: telMs,
      loading_after_identity: loading,
      context: ctx,
      agent: agent.slice(0, 240),
      usage: usage.slice(0, 240),
    }));
    if (loading) fail("telemetry blocked instant shell");
    if (identityMs > 500) fail(`identity slower than expected: ${identityMs}ms`);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 } });
    mobile.setDefaultTimeout(25000);
    await mobile.goto(`${BASE}/#/lanes`, { waitUntil: "domcontentloaded" });
    await login(mobile);
    await mobile.waitForFunction(() => {
      const vis = (sel) => {
        const el = document.querySelector(sel);
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      };
      return vis('#lane-rail [data-gw-lane="alloy-identity"]') || vis('.gw-lanes [data-gw-lane="alloy-identity"]');
    }, { timeout: 25000 });
    const mobileLane = mobile.locator('.gw-lanes [data-gw-lane="alloy-identity"]');
    if (await mobileLane.count()) await mobileLane.click();
    else await mobile.locator('#lane-rail [data-gw-lane="alloy-identity"]').click();
    await mobile.waitForFunction(() => /Access Identity/i.test(document.querySelector(".gw-lane-h h1")?.textContent || ""), { timeout: 15000 });
    await mobile.waitForFunction(() => {
      const ctx = document.querySelector("[data-gw-context]")?.textContent || "";
      const sum = document.querySelector(".gw-status-sum")?.textContent || "";
      return /Context\s+\d+%/.test(ctx) || /Context\s+\d+%/.test(sum);
    }, { timeout: 20000 });
    const statusOpen = await mobile.locator("[data-gw-status]").evaluate((el) => el.open);
    if (statusOpen) fail("mobile status defaulted open");
    const sum = await mobile.locator(".gw-status-sum").innerText().catch(() => "");
    const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    if (!overflow) fail("mobile horizontal overflow");
    await mobile.screenshot({ path: join(OUT, "mobile-telemetry.png") });
    console.log(JSON.stringify({
      phase: "mobile-telemetry",
      status_open: statusOpen,
      summary: sum,
      overflow_ok: overflow,
    }));
    await mobile.close();
  } finally {
    await browser.close();
  }
}, { reason: "vacilando gateway v2 claude telemetry cert" });

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS gateway telemetry cert →", OUT);
