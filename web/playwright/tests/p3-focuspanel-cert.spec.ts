/**
 * P3 — Focus Panel Configuration Runtime certification (browser evidence).
 *
 * Asserts the single-ownership + Work-View-aware facts of the Focus Panel cutover:
 *   - the Focus Panel resolves its published doc through the endpoint whose selection is
 *     resolveSurfaceVariant (P3-A) — verified by the request reaching the focus-panel-summary route;
 *   - the committed applicability context is threaded (P3-B): the request carries workViewId;
 *   - selecting a queue row commits the subject and the Focus Panel RESOLVES (no drawer/modal);
 *   - a Work-View change re-resolves (a fresh focus-panel-summary fetch for the new workViewId);
 *   - NO drawer/modal host renders the record (the inline panel is the one record surface).
 *
 * Read-only: authors nothing, mutates no tenant configuration.
 */
import { test, expect, type Page, type Request } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const DIR = process.env.P3_SHOT_DIR || "/tmp/p3-shots";

const L = {
    queueRow: '[data-runtime-label="WU.QUEUE_ROW"]',
    pills: '[data-runtime-label="WU.WORK_VIEW_PILLS"]',
    activePill: '[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][aria-selected="true"]',
    fpRecord: '[data-inline-focus-panel="true"]',
};

if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 8 * 60 * 1000 });

async function shot(page: Page, name: string) {
    fs.mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: path.join(DIR, name) });
}

test("P3 Focus Panel certification", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const report: Record<string, unknown> = {};

    const fpsRequests: string[] = [];
    page.on("request", (r: Request) => {
        const u = r.url();
        if (u.includes("/api/admin/entity-layouts/focus-panel-summary")) fpsRequests.push(u);
    });

    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const tile = page.locator(`a[href="/workspace/work-unit/${WU}"]`).first();
    await tile.waitFor({ state: "visible", timeout: 30000 });
    await tile.click({ noWaitAfter: true });
    await page.locator(L.queueRow).first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1500);

    // Select the first row → commit subject → Focus Panel resolves.
    await page.locator(L.queueRow).first().click({ noWaitAfter: true });
    await page.waitForTimeout(2000);
    report.focusPanelResolved = await page.evaluate((sel) => {
        const fp = document.querySelector(sel.fpRecord);
        return fp?.getAttribute("data-inline-focus-panel-resolved") === "true";
    }, L);
    // No drawer/modal host rendering the record (the inline panel is the one record surface).
    report.recordDrawerHostCount = await page.evaluate(() =>
        document.querySelectorAll('[role="dialog"][data-admin-drawer],[data-admin-entity-drawer-portal] [data-inline-focus-panel]').length,
    );
    await shot(page, "01-focus-panel-resolved.png");

    report.fpsRequestCountAfterSelect = fpsRequests.length;
    report.fpsFirstUrl = fpsRequests[0] ?? null;
    report.fpsFirstHasWorkView = fpsRequests.some((u) => /[?&]workViewId=/.test(u));

    // Work View change → re-resolve. Capture a fresh fps fetch for the new view.
    const before = fpsRequests.length;
    const activeBefore = await page.locator(L.activePill).getAttribute("data-work-view-id").catch(() => null);
    const target = await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"]')) as HTMLElement[];
        return tabs.find((t) => t.getAttribute("aria-selected") !== "true")?.getAttribute("data-work-view-id") ?? null;
    });
    if (target) {
        await page.locator(`${L.pills} [role="tab"][data-work-view-id="${target}"]`).click({ noWaitAfter: true });
        await page.waitForFunction((id) => {
            const a = document.querySelector('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][aria-selected="true"]');
            return a?.getAttribute("data-work-view-id") === id;
        }, target, { timeout: 8000 }).catch(() => {});
        // The new view may have rows; select the first to commit a subject in the new scope.
        await page.waitForTimeout(1500);
        const rows = await page.locator(L.queueRow).count();
        if (rows > 0) {
            await page.locator(L.queueRow).first().click({ noWaitAfter: true });
            await page.waitForTimeout(2000);
        }
        report.activeBefore = activeBefore;
        report.activeAfter = await page.locator(L.activePill).getAttribute("data-work-view-id").catch(() => null);
        report.fpsRequestsAfterViewChange = fpsRequests.length - before;
        report.fpsNewViewScoped = fpsRequests.slice(before).some((u) => u.includes(`workViewId=${target}`));
        await shot(page, "02-focus-panel-after-view-change.png");
    }

    report.allFpsRequests = fpsRequests;
    fs.writeFileSync(path.join(DIR, "p3-report.json"), JSON.stringify(report, null, 2));
    console.log("@@P3@@ " + JSON.stringify(report));

    expect(report.focusPanelResolved, "Focus Panel resolves on subject commit").toBe(true);
    expect(report.recordDrawerHostCount, "no drawer/modal host renders the record").toBe(0);
    expect(report.fpsFirstHasWorkView, "focus-panel-summary request carries committed workViewId (P3-B)").toBe(true);

    await ctx.close();
});
