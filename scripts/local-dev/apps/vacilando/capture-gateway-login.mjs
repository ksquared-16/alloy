#!/usr/bin/env node
/**
 * Gateway V2 Slice 5 — MacBook browser login certification.
 * Fresh unauthenticated contexts. Never prints the Gateway token.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const OUT = join(HERE, "qa/gateway-v2");
const TOKEN_FILE = join(os.homedir(), ".local", "state", "alloy-dev", "gateway", "vacilando", "api-token");
const TOKEN = readFileSync(TOKEN_FILE, "utf8").trim();
if (!TOKEN) {
  console.error("FAIL: gateway token file missing or empty");
  process.exit(1);
}

mkdirSync(OUT, { recursive: true });

const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
const { chromium } = pw;

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

function leak(haystack, label) {
  if (haystack && String(haystack).includes(TOKEN)) fail(`token leaked via ${label}`);
}

async function visibleIdentity(page) {
  const rail = page.locator('#lane-rail [data-gw-lane="alloy-identity"]');
  const lanes = page.locator('.gw-lanes [data-gw-lane="alloy-identity"]');
  await page.waitForFunction(() => {
    const vis = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    };
    return vis('#lane-rail [data-gw-lane="alloy-identity"]') || vis('.gw-lanes [data-gw-lane="alloy-identity"]');
  }, { timeout: 30000 });
  if (await rail.isVisible()) return rail;
  return lanes;
}

function tailscaleIPv4() {
  try {
    return execFileSync("tailscale", ["ip", "-4"], { encoding: "utf8", timeout: 2500 }).trim();
  } catch {
    return null;
  }
}

async function certifyOrigin(browser, origin, slug) {
  const notes = [];
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ignoreHTTPSErrors: false,
  });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  const consoleLines = [];
  page.on("console", (msg) => {
    const text = msg.text();
    leak(text, `${slug} console`);
    if (msg.type() === "error" && !/401 \(Unauthorized\)/.test(text)) consoleLines.push(text);
  });
  page.on("pageerror", (err) => {
    leak(err?.message, `${slug} pageerror`);
    consoleLines.push(String(err?.message || err));
  });
  page.on("request", (req) => {
    leak(req.url(), `${slug} request url`);
  });
  page.on("response", async (res) => {
    leak(res.url(), `${slug} response url`);
    if (res.url().includes("/api/gateway/session")) {
      try {
        const j = await res.json();
        leak(JSON.stringify(j), `${slug} session json`);
        if ("token" in (j || {})) fail(`${slug}: session payload included token field`);
      } catch { /* non-json */ }
    }
  });

  await page.goto(`${origin}/#/lanes?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  leak(page.url(), `${slug} location`);
  await page.waitForSelector("#gw-login:not([hidden])", { timeout: 15000 });
  await page.waitForSelector("#gw-token", { timeout: 8000 });

  const submit = page.locator("[data-gw-login-submit]");
  if (!(await submit.isEnabled())) fail(`${slug}: Continue disabled before paste`);

  await page.locator("#gw-token").click();
  await page.keyboard.insertText("not-a-valid-gateway-token");
  if (!(await submit.isEnabled())) fail(`${slug}: Continue disabled after invalid paste`);
  await submit.click();
  await page.waitForSelector("[data-gw-login-err]:not([hidden])", { timeout: 10000 });
  const invalidErr = (await page.locator("[data-gw-login-err]").innerText()).trim();
  if (!/refused|not accepted|try again/i.test(invalidErr)) fail(`${slug}: unclear invalid-token feedback`);
  const stillThere = await page.locator("#gw-token").inputValue();
  if (stillThere !== "not-a-valid-gateway-token") fail(`${slug}: invalid token input was cleared`);
  if (!(await page.locator("#gw-token").isEnabled())) fail(`${slug}: token input not usable after invalid submit`);
  await page.screenshot({ path: join(OUT, `${slug}-invalid.png`) });
  notes.push("invalid_token_feedback");

  await page.locator("#gw-token").fill("");
  await page.locator("#gw-token").click();
  await page.keyboard.insertText(TOKEN);
  if (!(await submit.isEnabled())) fail(`${slug}: Continue disabled after valid paste`);
  const loginReq = page.waitForResponse((r) => r.url().includes("/api/gateway/session") && r.request().method() === "POST", { timeout: 15000 });
  await submit.click();
  const posted = await loginReq;
  if (posted.status() !== 200) fail(`${slug}: session POST status ${posted.status()}`);

  await page.waitForFunction(() => document.getElementById("gw-login")?.hidden === true, { timeout: 15000 });
  await page.waitForSelector("[data-gw]", { timeout: 15000 });
  await visibleIdentity(page);
  leak(page.url(), `${slug} post-login location`);
  await page.screenshot({ path: join(OUT, `${slug}-lanes.png`) });
  notes.push("authenticated_lanes");

  const cookies = await context.cookies(origin);
  const gw = cookies.find((c) => c.name === "vacilando_gw");
  if (!gw) fail(`${slug}: browser did not store vacilando_gw`);
  if (!gw.httpOnly) fail(`${slug}: cookie not HttpOnly in browser`);
  if (origin.startsWith("http://") && gw.secure) fail(`${slug}: browser stored Secure cookie on HTTP`);
  const visibleCookies = await page.evaluate(() => document.cookie);
  if (visibleCookies.includes("vacilando_gw")) fail(`${slug}: session cookie visible to JS`);
  leak(visibleCookies, `${slug} document.cookie`);

  const session = await page.evaluate(async () => {
    const r = await fetch("/api/gateway/session", { cache: "no-store", credentials: "same-origin" });
    return r.json();
  });
  if (!session.authenticated) fail(`${slug}: GET session not authenticated after login`);
  if ("token" in session) fail(`${slug}: GET session included token`);
  leak(JSON.stringify(session), `${slug} get session`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.getElementById("gw-login")?.hidden === true, { timeout: 15000 });
  const identity = await visibleIdentity(page);
  await identity.click();
  await page.waitForFunction(() => {
    const h = document.querySelector(".gw-lane-h h1");
    return Boolean(h && /Access Identity/i.test(h.textContent || ""));
  }, { timeout: 25000 });
  await page.screenshot({ path: join(OUT, `${slug}-identity.png`) });
  notes.push("refresh_persisted");

  await page.evaluate(async () => {
    await fetch("/api/gateway/session", { method: "DELETE", credentials: "same-origin" });
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("#gw-login:not([hidden])", { timeout: 15000 });
  notes.push("logout_clears");

  await page.locator("#gw-token").click();
  await page.keyboard.insertText(TOKEN);
  const reauthReq = page.waitForResponse((r) => r.url().includes("/api/gateway/session") && r.request().method() === "POST", { timeout: 15000 });
  await page.keyboard.press("Enter");
  const reauth = await reauthReq;
  if (reauth.status() !== 200) fail(`${slug}: Enter re-auth POST status ${reauth.status()}`);
  await page.waitForFunction(() => document.getElementById("gw-login")?.hidden === true, { timeout: 15000 });
  await visibleIdentity(page);
  notes.push("reauthenticate");

  if (consoleLines.length) fail(`${slug}: console errors: ${consoleLines.slice(0, 3).join(" | ")}`);
  await context.close();
  console.log(`PASS ${slug}`, notes.join(","));
}

const loopback = process.env.VACILANDO_URL || "http://127.0.0.1:3020";
const hostname = process.env.VACILANDO_TAILSCALE_URL || "http://macbook-air-2.tail2aa1af.ts.net:3020";
const ip = tailscaleIPv4();
const ipOrigin = ip ? `http://${ip}:3020` : null;

await withBrowserCertLease(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await certifyOrigin(browser, loopback, "login-loopback");
    await certifyOrigin(browser, hostname, "login-tailscale-host");
    if (ipOrigin && ipOrigin !== hostname) {
      await certifyOrigin(browser, ipOrigin, "login-tailscale-ip");
    }
  } finally {
    await browser.close();
  }
}, { reason: "vacilando gateway macbook login cert" });

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS gateway login browser cert →", OUT);
