/**
 * Trusted-host product-review capture. Reads routes and an already-established
 * storage state. Never prints credentials.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const url = String(process.env.CERT_APP_URL || process.env.CERT_APP_URL || "").trim();
const authState = String(process.env.CERT_AUTH_STATE || "").trim();
const reviewDir = String(process.env.CERT_REVIEW_DIR || "").trim();
const outFile = String(process.env.CERT_REVIEW_OUT || "").trim();
let routes = [];
try {
  routes = JSON.parse(String(process.env.CERT_REVIEW_ROUTES || "[]"));
} catch {
  routes = [];
}

function failAll(status, detail) {
  const captured = (Array.isArray(routes) ? routes : []).map((route) => ({
    id: route.id,
    title: route.title,
    path: route.path,
    artifact: null,
    status,
    detail,
  }));
  if (outFile) {
    mkdirSync(join(outFile, ".."), { recursive: true });
    writeFileSync(outFile, `${JSON.stringify(captured)}\n`);
  }
  process.exit(1);
}

if (!url || !reviewDir || !outFile) failAll("capture_failed", "missing_review_inputs");
if (!authState) failAll("auth_missing", "certification auth state was not captured");

const playwrightEntry = join(String(process.env.NODE_PATH || ""), "playwright", "index.js");
if (!existsSync(playwrightEntry)) failAll("capture_failed", "playwright_module_unavailable");
const playwrightMod = await import(pathToFileURL(playwrightEntry).href);
const chromium = playwrightMod.chromium || playwrightMod.default?.chromium;
if (!chromium) failAll("capture_failed", "playwright_chromium_unavailable");
mkdirSync(reviewDir, { recursive: true });
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  baseURL: url,
  storageState: authState,
});
const page = await context.newPage();
const captured = [];
for (const route of routes) {
  const dest = join(reviewDir, `${route.id}.png`);
  try {
    await page.goto(route.path, { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(750);
    await page.screenshot({ path: dest, fullPage: true });
    captured.push({
      id: route.id,
      title: route.title,
      path: route.path,
      artifact: dest,
      status: "captured",
    });
  } catch (err) {
    captured.push({
      id: route.id,
      title: route.title,
      path: route.path,
      artifact: null,
      status: "capture_failed",
      detail: String(err && err.message || err).slice(0, 200),
    });
  }
}
await browser.close();
writeFileSync(outFile, `${JSON.stringify(captured)}\n`);
process.exit(captured.some((row) => row.status !== "captured") ? 1 : 0);
