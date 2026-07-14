#!/usr/bin/env node
/**
 * Interactive login capture — isolated browser profile per slot.
 * Human completes /login; toolkit saves storage state only.
 * Playwright is loaded from the managed worktree's web/ package context.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { parseArgs } from "node:util";
import { loadPlaywrightFromWeb } from "./playwright-from-web.mjs";

const { values } = parseArgs({
  options: {
    "web-dir": { type: "string" },
    "base-url": { type: "string" },
    "login-route": { type: "string", default: "/login" },
    "check-route": { type: "string", default: "/workspace" },
    "profile-dir": { type: "string" },
    "storage-out": { type: "string" },
    "pid-out": { type: "string" },
    timeout: { type: "string", default: "600000" },
  },
});

const webDir = values["web-dir"];
const baseUrl = values["base-url"]?.replace(/\/$/, "");
const loginRoute = values["login-route"] || "/login";
const checkRoute = values["check-route"] || "/workspace";
const profileDir = values["profile-dir"];
const storageOut = values["storage-out"];
const pidOut = values["pid-out"];
const timeoutMs = Number(values.timeout || 600000);

if (!webDir || !baseUrl || !profileDir || !storageOut) {
  console.error("error: missing required arguments (--web-dir, --base-url, --profile-dir, --storage-out)");
  process.exit(2);
}

let chromium;
try {
  ({ chromium } = loadPlaywrightFromWeb(webDir));
} catch (err) {
  console.error(`error: ${err.message}`);
  process.exit(1);
}

await mkdir(profileDir, { recursive: true });
await mkdir(dirname(storageOut), { recursive: true });

const browser = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1280, height: 800 },
});

if (pidOut) {
  const proc = browser.browser()?.process?.();
  if (proc?.pid) {
    await writeFile(pidOut, String(proc.pid), { mode: 0o600 });
  }
}

const page = browser.pages()[0] || (await browser.newPage());
const loginUrl = `${baseUrl}${loginRoute}`;

try {
  await page.goto(loginUrl, { waitUntil: "domcontentloaded", timeout: 120_000 });
  console.log(`Navigate to ${loginUrl} and sign in manually (Supabase email/password).`);
  console.log("Waiting for successful redirect away from /login ...");

  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pathname = new URL(page.url()).pathname;
    if (pathname !== "/login" && !pathname.startsWith("/unauthorized")) {
      break;
    }
    await page.waitForTimeout(1000);
  }

  const finalPath = new URL(page.url()).pathname;
  if (finalPath === "/login" || finalPath.startsWith("/unauthorized")) {
    console.error("error: login not completed (still on login/unauthorized)");
    await browser.close();
    process.exit(1);
  }

  await page.goto(`${baseUrl}${checkRoute}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  const checkPath = new URL(page.url()).pathname;
  if (checkPath === "/login" || checkPath.startsWith("/unauthorized")) {
    console.error("error: authenticated route check failed");
    await browser.close();
    process.exit(1);
  }

  await browser.storageState({ path: storageOut });
  console.log(`storage-state saved: ${storageOut}`);
  await browser.close();
} catch (err) {
  console.error("error: login capture failed");
  await browser.close().catch(() => {});
  process.exit(1);
}
