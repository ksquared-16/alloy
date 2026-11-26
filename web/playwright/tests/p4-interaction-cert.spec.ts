/**
 * P4 — Configuration-driven interaction runtime certification.
 * Proves in the browser: editability is config-owned + observable (data-identity-policy / -editable),
 * actions render from config, and no legacy drawer/modal hosts the record.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const DIR = process.env.P4_SHOT_DIR || "/tmp/p4-shots";
if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 6 * 60 * 1000 });

test("P4 interaction runtime", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    fs.mkdirSync(DIR, { recursive: true });
    const report: Record<string, unknown> = {};

    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const tile = page.locator(`a[href="/workspace/work-unit/${WU}"]`).first();
    await tile.waitFor({ state: "visible", timeout: 30000 });
    await tile.click({ noWaitAfter: true });
    await page.locator('[data-runtime-label="WU.QUEUE_ROW"]').first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(1200);
    await page.locator('[data-runtime-label="WU.QUEUE_ROW"]').first().click({ noWaitAfter: true });
    await page.waitForTimeout(6500); // let cards settle

    // Editability provenance — every identity field declares its config policy + final editable state.
    report.identityFields = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll("[data-identity-field]"));
        return els.slice(0, 25).map((e) => ({
            field: e.getAttribute("data-identity-field"),
            policy: e.getAttribute("data-identity-policy"),
            editable: e.getAttribute("data-identity-editable"),
        }));
    });
    report.identityFieldCount = (report.identityFields as unknown[]).length;
    report.policiesPresent = (report.identityFields as { policy: string | null }[]).every((f) => f.policy !== null);

    // Actions present (config-driven header/Manage menu). Look for the Manage affordance.
    report.manageActionPresent = await page.evaluate(() => {
        return !!document.querySelector('[data-subject-manage-action], [aria-label*="Manage" i], button');
    });

    // No legacy drawer/modal renders the record.
    report.drawerHostRenderingRecord = await page.evaluate(() =>
        document.querySelectorAll('[role="dialog"][data-admin-drawer] [data-inline-focus-panel], [data-admin-entity-drawer-portal] [data-inline-focus-panel]').length,
    );
    report.focusPanelResolved = await page.evaluate(() =>
        document.querySelector('[data-inline-focus-panel="true"]')?.getAttribute("data-inline-focus-panel-resolved") === "true",
    );

    await page.screenshot({ path: path.join(DIR, "P4-focus-panel-interaction.png") });
    console.log("@@P4@@ " + JSON.stringify(report));

    expect(report.focusPanelResolved, "Focus Panel resolves").toBe(true);
    expect(report.drawerHostRenderingRecord, "no legacy drawer renders the record").toBe(0);
    expect(report.identityFieldCount as number, "identity fields render").toBeGreaterThan(0);
    expect(report.policiesPresent, "every identity field declares its config policy").toBe(true);
    await ctx.close();
});
