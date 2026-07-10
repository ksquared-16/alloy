import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "../.env.local") });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    baseURL: "http://127.0.0.1:3001",
    viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
await ensureAdminPlaywrightSession(page);
await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForSelector('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"]', { timeout: 60_000 });
await page.waitForTimeout(2500);

const pills = page.locator('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][data-work-view-id]');
const n = await pills.count();
const hostSlug = "new-leads";
const results = [];

for (let i = 0; i < n; i++) {
    await page.goto("/workspace/work-unit/new-leads", { waitUntil: "domcontentloaded", timeout: 120_000 });
    await page.waitForTimeout(2000);
    const pill = pills.nth(i);
    const id = await pill.getAttribute("data-work-view-id");
    const label = (await pill.innerText()).trim();
    const selected = await pill.getAttribute("aria-selected");
    if (selected === "true") {
        results.push({ id, label, selected: true, sameHost: true, url: new URL(page.url()).pathname });
        continue;
    }
    await pill.click();
    await page.waitForTimeout(1800);
    const url = new URL(page.url()).pathname;
    const sameHost = url.includes(`/work-unit/${hostSlug}`);
    results.push({ id, label, selected: false, sameHost, url });
}

console.log(JSON.stringify(results, null, 2));
await browser.close();
