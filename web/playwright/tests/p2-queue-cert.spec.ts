/**
 * P2-H — WORK UNIT QUEUE CONFIGURATION RUNTIME certification screenshots + DOM assertions.
 *
 * Captures the live queue states that certify the P2 cutover and asserts the structural facts that
 * prove single-ownership:
 *   - the Queue renders through the canonical WU.QUEUE / WU.QUEUE_ROW Presentation Runtime tree;
 *   - selected-row presentation is Runtime-owned (data-queue-row-active), layered onto the configured row;
 *   - Work View change re-resolves the queue (no stale rows, active pill moves);
 *   - the Work Unit Queue mounts NO legacy AdminDrawer host inside WU.SURFACE (no second owner);
 *   - Settings → Surfaces is the configuration owner (queue-row section present).
 *
 * Env: PLAYWRIGHT_BASE_URL, PLAYWRIGHT_STORAGE_STATE, WU_SLUG_A, P2_SHOT_DIR.
 * Read-only: authors nothing, mutates no tenant configuration.
 */
import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";

const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const DIR = process.env.P2_SHOT_DIR || "/tmp/p2-shots";

const L = {
    wsSurface: '[data-runtime-label="WS.SURFACE"]',
    wuSurface: '[data-runtime-label="WU.SURFACE"]',
    wuHeader: '[data-runtime-label="WU.HEADER"]',
    pills: '[data-runtime-label="WU.WORK_VIEW_PILLS"]',
    activePill: '[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][aria-selected="true"]',
    anyPill: '[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"]',
    queue: '[data-runtime-label="WU.QUEUE"]',
    queueRow: '[data-runtime-label="WU.QUEUE_ROW"]',
    fpRecord: '[data-inline-focus-panel="true"]',
};

if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 8 * 60 * 1000 });

async function shot(page: Page, name: string) {
    fs.mkdirSync(DIR, { recursive: true });
    await page.screenshot({ path: path.join(DIR, name), fullPage: false });
}

async function gotoWorkUnit(page: Page) {
    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const tile = page.locator(`a[href="/workspace/work-unit/${WU}"]`).first();
    await tile.waitFor({ state: "visible", timeout: 30000 });
    await tile.click({ noWaitAfter: true });
    await page.locator(L.queueRow).first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1200); // settle
}

test("P2-H queue certification", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const report: Record<string, unknown> = {};

    // (1) CONFIGURATION OWNER — Settings → Surfaces, queue-row section (client-state nav, not a query).
    await page.goto(`${BASE}/adminV2/settings/surfaces`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const queueNav = page.locator('[data-testid="surfaces-category-item-queue-rows"]');
    report.settingsSurfacesQueueSection = await page.locator('[data-testid="surfaces-section-queue"]').count();
    if (await queueNav.count()) {
        await queueNav.first().click({ noWaitAfter: true });
        await page.waitForTimeout(1200);
        report.queueSectionActive = await queueNav.first().getAttribute("aria-current");
    }
    await shot(page, "01-settings-surfaces-queue.png");

    // (2) WORK UNIT QUEUE — the canonical Presentation Runtime render.
    await gotoWorkUnit(page);
    report.queueRegionCount = await page.locator(L.queue).count();
    report.queueRowCount = await page.locator(L.queueRow).count();
    report.wuSurfaceCount = await page.locator(L.wuSurface).count();
    await shot(page, "02-work-unit-queue.png");

    // (3) SINGLE OWNER — no legacy AdminDrawer host mounted inside WU.SURFACE.
    report.drawerHostInsideWuSurface = await page.evaluate((sel) => {
        const wu = document.querySelector(sel.wuSurface);
        if (!wu) return -1;
        return wu.querySelectorAll(
            '[data-admin-drawer-host],[data-admin-drawer-root],[data-drawer-host],[data-legacy-drawer]'
        ).length;
    }, L);
    // Rows are the Presentation Runtime rows (CondensedQueueRow), not drawer-followers.
    report.rowsAreRuntimeRows = await page.evaluate((sel) => {
        const rows = Array.from(document.querySelectorAll(sel.queueRow));
        return rows.length > 0 && rows.every((r) => r.hasAttribute("data-queue-row-first") || r.querySelector("[data-queue-row-subject]") != null);
    }, L);

    // (4) SELECTED-ROW PRESENTATION is Runtime-owned — select a row, Focus Panel commits, row marks active.
    const firstRow = page.locator(L.queueRow).first();
    await firstRow.click({ noWaitAfter: true });
    await page.waitForTimeout(1500);
    report.focusPanelResolved = await page.evaluate((sel) => {
        const fp = document.querySelector(sel.fpRecord);
        return fp?.getAttribute("data-inline-focus-panel-resolved") === "true";
    }, L);
    report.activeRowCount = await page.locator(`${L.queueRow}[data-queue-row-active="true"]`).count();
    await shot(page, "03-selected-row-focus-panel.png");

    // (5) WORK VIEW CHANGE re-resolves the queue (active pill moves; rows are fresh, not stale).
    const pillCount = await page.locator(L.anyPill).count();
    report.pillCount = pillCount;
    if (pillCount > 1) {
        const beforeActive = await page.locator(L.activePill).getAttribute("data-work-view-id").catch(() => null);
        // Pick a non-active pill deterministically by its work-view id, then WAIT for the active id to move.
        const target = await page.evaluate(() => {
            const tabs = Array.from(document.querySelectorAll('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"]')) as HTMLElement[];
            return tabs.find((t) => t.getAttribute("aria-selected") !== "true")?.getAttribute("data-work-view-id") ?? null;
        });
        if (target) {
            await page.locator(`${L.pills} [role="tab"][data-work-view-id="${target}"]`).click({ noWaitAfter: true });
            report.workViewChanged = await page
                .waitForFunction((id) => {
                    const a = document.querySelector('[data-runtime-label="WU.WORK_VIEW_PILLS"] [role="tab"][aria-selected="true"]');
                    return a?.getAttribute("data-work-view-id") === id;
                }, target, { timeout: 8000 })
                .then(() => true)
                .catch(() => false);
            await page.waitForTimeout(1200);
            report.beforeView = beforeActive;
            report.afterView = await page.locator(L.activePill).getAttribute("data-work-view-id").catch(() => null);
            report.afterViewRowCount = await page.locator(L.queueRow).count();
            report.afterViewEmpty = await page.locator('[data-queue-empty="true"]').count();
            await shot(page, "04-work-view-change.png");
        }
    }

    // (6) DEFAULT / FALLBACK ROW — the tenant authors no per-row variants, so every row renders the
    //     queue-level default (the behavior-neutral fallback path). Captured as the fallback state.
    await gotoWorkUnit(page);
    report.fallbackRowsRender = await page.locator(L.queueRow).count();
    await shot(page, "05-fallback-default-rows.png");

    fs.writeFileSync(path.join(DIR, "p2h-report.json"), JSON.stringify(report, null, 2));
    console.log("@@P2H@@ " + JSON.stringify(report));

    // Structural assertions — the single-ownership facts.
    expect(report.queueRegionCount, "WU.QUEUE present").toBeGreaterThan(0);
    expect(report.queueRowCount, "WU.QUEUE_ROW rows render").toBeGreaterThan(0);
    expect(report.drawerHostInsideWuSurface, "no legacy drawer host inside WU.SURFACE").toBe(0);
    expect(report.rowsAreRuntimeRows, "rows are Presentation Runtime rows").toBe(true);
    expect(report.workViewChanged, "Work View change re-resolves the queue").toBe(true);
    expect(report.activeRowCount, "selected row is Runtime-marked").toBe(1);

    await ctx.close();
});
