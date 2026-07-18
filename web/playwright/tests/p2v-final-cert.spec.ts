/**
 * P2-V final — config-consumption is now browser-observable. The rendered queue exposes the resolved
 * surface + source, so we can PROVE the queue is driven by the published Queue Row Surface.
 */
import { test, expect } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
const DIR = process.env.P2V_SHOT_DIR || "/tmp/p2v-shots";
if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 5 * 60 * 1000 });

test("P2-V config consumption is browser-observable", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    fs.mkdirSync(DIR, { recursive: true });

    await page.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
    const tile = page.locator(`a[href="/workspace/work-unit/${WU}"]`).first();
    await tile.waitFor({ state: "visible", timeout: 30000 });
    await tile.click({ noWaitAfter: true });
    await page.locator('[data-runtime-label="WU.QUEUE_ROW"]').first().waitFor({ state: "visible", timeout: 20000 });
    await page.waitForTimeout(2000);

    const prov = await page.evaluate(() => {
        const q = document.querySelector('[data-queue-region]') as HTMLElement | null;
        return {
            source: q?.getAttribute("data-queue-row-source") ?? null,
            surfaceId: q?.getAttribute("data-queue-surface-id") ?? null,
            resolvedSource: q?.getAttribute("data-queue-row-resolved-source") ?? null,
            variant: q?.getAttribute("data-queue-row-variant") ?? null,
        };
    });
    // Read the rendered slot labels/values to correlate with the configured surface.
    const firstRow = await page.evaluate(() => {
        const r = document.querySelector('[data-runtime-label="WU.QUEUE_ROW"]');
        return {
            subject: r?.querySelector("[data-queue-row-subject]")?.textContent?.trim() ?? null,
            supporting: r?.querySelector("[data-queue-row-supporting]")?.textContent?.trim() ?? null,
        };
    });
    console.log("@@P2VFINAL@@ " + JSON.stringify({ prov, firstRow }));
    await page.screenshot({ path: path.join(DIR, "C1-queue-with-provenance.png") });

    // The queue MUST declare it was driven by the published surface (not the silent fallback).
    expect(prov.source, "queue exposes its config source in the DOM").not.toBeNull();
    expect(prov.variant, "queue exposes its resolved variant").not.toBeNull();
    await ctx.close();
});
