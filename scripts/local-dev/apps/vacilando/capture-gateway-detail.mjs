#!/usr/bin/env node
/**
 * Gateway V2 — list/detail identity certification.
 * Fresh authenticated contexts. Never prints the Gateway token.
 */
import { readFileSync } from "node:fs";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { withBrowserCertLease } from "../../lib/browser-cert-lease.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..", "..", "..");
const OUT = join(HERE, "qa/gateway-v2");
const TOKEN = readFileSync(join(os.homedir(), ".local", "state", "alloy-dev", "gateway", "vacilando", "api-token"), "utf8").trim();
const pw = await import(pathToFileURL(join(ROOT, "web/node_modules/playwright/index.mjs")).href);
const { chromium } = pw;

function fail(msg) {
  console.error("FAIL:", msg);
  process.exitCode = 1;
}

async function login(page) {
  await page.waitForSelector("#gw-login:not([hidden])", { timeout: 15000 });
  await page.locator("#gw-token").click();
  await page.keyboard.insertText(TOKEN);
  await page.locator("[data-gw-login-submit]").click();
  await page.waitForFunction(() => document.getElementById("gw-login")?.hidden === true, { timeout: 15000 });
}

async function expectIdentityDetail(page, slug) {
  await page.waitForFunction(() => {
    const unavailable = /Lane unavailable/i.test(document.body.innerText || "");
    const h = document.querySelector(".gw-lane-h h1");
    return Boolean(!unavailable && h && /Access Identity/i.test(h.textContent || ""));
  }, { timeout: 25000 });
  await page.waitForFunction(() => {
    const pre = document.querySelector("[data-gw-output]");
    return Boolean(pre && (pre.textContent || "").trim().length > 20);
  }, { timeout: 25000 });
  if (!page.url().includes("#/lanes/alloy-identity")) fail(`${slug}: hash was ${page.url()}`);
  const body = await page.locator("body").innerText();
  if (/Lane unavailable/i.test(body)) fail(`${slug}: detail still says Lane unavailable`);
}

async function certify(browser, origin, slug) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(20000);

  await page.goto(`${origin}/#/lanes?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await login(page);
  await page.waitForSelector('#lane-rail [data-gw-lane="alloy-identity"]', { timeout: 20000 });
  await page.locator('#lane-rail [data-gw-lane="alloy-identity"]').click();
  await expectIdentityDetail(page, `${slug}-click`);
  await page.screenshot({ path: join(OUT, `${slug}-detail.png`) });

  await page.reload({ waitUntil: "domcontentloaded" });
  await expectIdentityDetail(page, `${slug}-refresh`);

  await context.close();

  const deep = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const deepPage = await deep.newPage();
  deepPage.setDefaultTimeout(20000);
  await deepPage.goto(`${origin}/#/lanes/alloy-identity?_=${Date.now()}`, { waitUntil: "domcontentloaded" });
  await login(deepPage);
  await expectIdentityDetail(deepPage, `${slug}-deeplink`);
  await deepPage.screenshot({ path: join(OUT, `${slug}-deeplink.png`) });
  await deep.close();
  console.log(`PASS ${slug}`);
}

await withBrowserCertLease(async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    await certify(browser, process.env.VACILANDO_URL || "http://127.0.0.1:3020", "detail-loopback");
    await certify(browser, process.env.VACILANDO_TAILSCALE_URL || "http://macbook-air-2.tail2aa1af.ts.net:3020", "detail-tailscale-host");
  } finally {
    await browser.close();
  }
}, { reason: "vacilando gateway list/detail identity cert" });

if (process.exitCode) process.exit(process.exitCode);
console.log("PASS gateway detail identity cert →", OUT);
