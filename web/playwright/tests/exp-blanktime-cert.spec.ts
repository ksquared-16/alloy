/**
 * Blank-time removal cert: hovering a work-unit tile prefetches the exact provisioning answer, so the
 * subsequent click commits the operational surface near-instantly (vs the cold ~4s). Measures time from
 * click (pointerdown) to the operational terminal in the DOM, warm-hover vs cold.
 */
import { test } from "@playwright/test";
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3013";
const STORAGE = process.env.PLAYWRIGHT_STORAGE_STATE;
const WU = process.env.WU_SLUG_A || "new-leads";
if (STORAGE) test.use({ storageState: STORAGE });
test.describe.configure({ timeout: 6 * 60 * 1000 });

const TILE = `a[href="/workspace/work-unit/${WU}"]`;
const QUEUE_ROW = '[data-runtime-label="WU.QUEUE_ROW"]';

async function timeCommit(page: import("@playwright/test").Page): Promise<number> {
    const t0 = await page.evaluate(() => performance.now());
    await page.locator(TILE).first().click({ noWaitAfter: true });
    await page.locator(QUEUE_ROW).first().waitFor({ state: "visible", timeout: 60000 });
    const t1 = await page.evaluate(() => performance.now());
    return Math.round(t1 - t0);
}

test("blank-time: hover-prefetch vs cold", async ({ browser }) => {
    const ctx = await browser.newContext({ storageState: STORAGE, viewport: { width: 1440, height: 900 } });
    const results: { cold: number[]; warm: number[] } = { cold: [], warm: [] };

    for (let i = 0; i < 3; i++) {
        // COLD: fresh page, click immediately (no hover dwell).
        const cold = await ctx.newPage();
        await cold.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
        await cold.locator(TILE).first().waitFor({ state: "visible", timeout: 30000 });
        results.cold.push(await timeCommit(cold));
        await cold.close();

        // WARM: fresh page, hover the tile, let the prefetch resolve (~5s), then click.
        const warm = await ctx.newPage();
        await warm.goto(`${BASE}/workspace`, { waitUntil: "domcontentloaded" });
        await warm.locator(TILE).first().waitFor({ state: "visible", timeout: 30000 });
        await warm.locator(TILE).first().hover(); // fires onPointerEnter → prefetch
        await warm.waitForTimeout(6000); // allow the heavy provisioning prefetch to complete
        results.warm.push(await timeCommit(warm));
        await warm.close();
    }

    const med = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    console.log("@@BLANK@@ " + JSON.stringify({ cold: results.cold, warm: results.warm, coldMed: med(results.cold), warmMed: med(results.warm) }));
    await ctx.close();
});
