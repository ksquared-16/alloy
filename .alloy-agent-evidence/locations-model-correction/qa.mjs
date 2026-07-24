/**
 * Authenticated QA for Locations model correction (slot 4 / port 3014).
 * Usage: node .alloy-agent-evidence/locations-model-correction/qa.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = __dirname;
const STORAGE =
    process.env.ALLOY_STORAGE_STATE ||
    `${process.env.HOME}/.local/state/alloy-dev/auth/slot4/storage-state.json`;
const BASE = process.env.BASE || "http://127.0.0.1:3014";

mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
    storageState: STORAGE,
    viewport: { width: 1440, height: 960 },
});
const page = await context.newPage();
const report = [];

function log(msg) {
    report.push(msg);
    console.log(msg);
}

try {
    await page.goto(`${BASE}/organization/locations`, { waitUntil: "networkidle", timeout: 60_000 });
    await page.waitForTimeout(1500);
    await page.screenshot({ path: join(OUT, "01-locations-landing.png"), fullPage: false });

    // Select North Campus from collection rail
    const north = page.getByText("North Campus", { exact: true }).first();
    await north.click({ timeout: 15_000 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: join(OUT, "02-north-overview.png"), fullPage: false });

    // Programs tab
    const programsTab = page.getByRole("button", { name: "Programs" }).or(page.getByText("Programs", { exact: true }));
    // Prefer workspace tab control
    const tabPrograms = page.locator('[data-testid="locations-tab-programs"], button:has-text("Programs")').first();
    await tabPrograms.click({ timeout: 10_000 });
    await page.waitForSelector('[data-testid="locations-programs-offered"]', { timeout: 20_000 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: join(OUT, "03-north-programs.png"), fullPage: false });

    const notOffered = await page.locator('[data-testid^="locations-program-offer-"]').filter({ hasText: "Not offered" }).count();
    const availableNow = await page.getByText("Available now").count();
    const checked = await page.locator('[data-testid^="locations-program-offer-check-"]:checked').count();
    log(`Programs checklist: checked=${checked} availableNow=${availableNow} notOfferedRows=${notOffered}`);
    if (checked === 0) {
        log("FAIL: North Campus still shows zero offered Programs");
    } else {
        log("PASS: At least one Program is offered (not all Not Offered)");
    }

    // Scheduling tab
    const tabScheduling = page.locator('button:has-text("Scheduling")').first();
    await tabScheduling.click({ timeout: 10_000 });
    await page.waitForSelector('[data-testid="locations-scheduling"]', { timeout: 20_000 });
    await page.waitForTimeout(600);
    await page.screenshot({ path: join(OUT, "04-scheduling-overview.png"), fullPage: false });
    log("PASS: Scheduling landing visible");

    for (const nav of ["day_types", "schedule_types", "hours", "operating_days", "patterns"]) {
        await page.locator(`[data-testid="locations-scheduling-nav-${nav}"]`).click();
        await page.waitForTimeout(400);
        await page.screenshot({ path: join(OUT, `05-scheduling-${nav}.png`), fullPage: false });
        log(`PASS: Scheduling subnav ${nav}`);
    }

    // Write report
    const { writeFileSync } = await import("node:fs");
    writeFileSync(join(OUT, "qa-report.txt"), report.join("\n") + "\n");
} catch (err) {
    console.error(err);
    await page.screenshot({ path: join(OUT, "qa-error.png"), fullPage: true }).catch(() => {});
    process.exitCode = 1;
} finally {
    await browser.close();
}
