import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "/Users/Kelly/Alloy/docs/sprints/06_2026/analytics-operational-intelligence-platform/qa-slice2";
mkdirSync(OUT, { recursive: true });

const URL = "http://localhost:3000/dev/analytics-surface-mocks";

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1320, height: 1000 }, deviceScaleFactor: 2 });

// First load compiles the route; give it time.
await page.goto(URL, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForSelector('[data-analytics-preview-surface="executive-summary"]', { timeout: 120000 });
await page.waitForTimeout(800);

await page.screenshot({ path: `${OUT}/00-full-page.png`, fullPage: true });

const shots = [
    ["executive-summary", "01-executive-summary.png"],
    ["diagnostic-conversion", "02-diagnostic-affected-work.png"],
    ["command-center", "03-command-center.png"],
    ["optimization-center", "04-optimization-center.png"],
    ["financial-report", "05-financial-report.png"],
    ["chart-gallery", "06-chart-gallery.png"],
];

for (const [id, file] of shots) {
    const el = page.locator(`[data-analytics-preview-surface="${id}"]`).first();
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(250);
    await el.screenshot({ path: `${OUT}/${file}` });
}

// Interactive proof: click a Downtown "Not converted" stacked segment → drill banner + affected work.
const diag = page.locator('[data-analytics-preview-surface="diagnostic-conversion"]').first();
await diag.scrollIntoViewIfNeeded();
const drillable = diag.locator('[data-chart-mark="drillable"]');
const count = await drillable.count();
// Last "Not converted" segments are the critical ones; click one for Downtown/Riverside.
if (count > 0) {
    await drillable.nth(Math.min(5, count - 1)).click({ force: true });
    await page.waitForTimeout(400);
    await diag.screenshot({ path: `${OUT}/07-diagnostic-after-drill.png` });
}

// Mobile view of the command center.
await page.setViewportSize({ width: 414, height: 900 });
await page.waitForTimeout(300);
const cc = page.locator('[data-analytics-preview-surface="command-center"]').first();
await cc.scrollIntoViewIfNeeded();
await cc.screenshot({ path: `${OUT}/08-command-center-mobile.png` });

await browser.close();
console.log("done");
