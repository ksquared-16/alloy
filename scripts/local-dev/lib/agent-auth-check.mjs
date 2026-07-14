#!/usr/bin/env node
/**
 * Verify Playwright storage state against an authenticated route.
 * Prints only: ok | login | unauthorized | failed
 * Never prints cookies, tokens, or storage contents.
 */
import { chromium } from "@playwright/test";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    storage: { type: "string" },
    url: { type: "string" },
  },
});

const storage = values.storage;
const url = values.url;
if (!storage || !url) {
  process.stdout.write("failed");
  process.exit(1);
}

let browser;
try {
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: storage });
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
  const pathname = new URL(page.url()).pathname;
  if (pathname === "/login") {
    process.stdout.write("login");
  } else if (pathname.startsWith("/unauthorized")) {
    process.stdout.write("unauthorized");
  } else {
    process.stdout.write("ok");
  }
} catch {
  process.stdout.write("failed");
  process.exit(1);
} finally {
  await browser?.close();
}
