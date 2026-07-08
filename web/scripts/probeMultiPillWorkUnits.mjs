import path from "path";
import { fileURLToPath } from "url";
import { config as loadEnv } from "dotenv";
import { chromium } from "playwright";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
loadEnv({ path: path.join(__dirname, "../.env.local") });

const BASE = process.env.PROBE_BASE_URL ?? "http://127.0.0.1:3001";
const SLUGS = [
    "enrollment-pipeline",
    "new-leads",
    "lifecycle-lead",
    "leads",
    "tours",
    "inquiries",
    "active-pipeline",
    "waitlist",
    "lifecycle-tour",
    "lifecycle-qualification",
    "lifecycle-waitlist",
];

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ baseURL: BASE, viewport: { width: 1440, height: 960 } });
const page = await context.newPage();
const { ensureAdminPlaywrightSession } = await import("../playwright/helpers/adminSessionAuth.ts");
await ensureAdminPlaywrightSession(page);

const found = [];
for (const slug of SLUGS) {
    await page.goto(`/workspace/work-unit/${slug}`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
    if (page.url().includes("/login")) continue;
    await page.waitForTimeout(2500);
    const info = await page.evaluate(() => {
        const pills = Array.from(
            document.querySelectorAll('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][data-work-view-id]'),
        );
        const rows = document.querySelectorAll(
            '[data-runtime-label="WU.QUEUE_ROW"], [data-queue-row-interactive="true"]',
        );
        return {
            url: location.pathname,
            pillCount: pills.length,
            pills: pills.map((p) => ({
                id: p.getAttribute("data-work-view-id"),
                label: (p.textContent || "").trim(),
                selected: p.getAttribute("aria-selected"),
            })),
            rowCount: rows.length,
            surface: Boolean(document.querySelector('[data-runtime-label="WU.SURFACE"]')),
        };
    });
    console.log(JSON.stringify(info));
    if (info.pillCount >= 2 && info.rowCount > 0) found.push(info);
}

console.log("FOUND", JSON.stringify(found, null, 2));
await browser.close();
