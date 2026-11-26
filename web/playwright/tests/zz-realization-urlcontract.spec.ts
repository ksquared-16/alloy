import { test, expect, type Page } from "@playwright/test";

/** URL-contract probe: does a PATH-based recordId select that record, or is it ignored (default subject)? */
const KURZMAN = "df771481-841f-4329-b7bb-c0a03d9fb621"; // NOT the default (Wenc)

async function settle(page: Page, ms = 20000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
        if ((await page.locator("[data-focus-panel-grid-cell]").count()) > 0) {
            if ((await page.locator('[data-focus-panel-cell-reserved="true"],[data-focus-panel-cell-preparing]').count()) === 0) return;
        }
        await page.waitForTimeout(150);
    }
}
async function committed(page: Page) {
    return page.evaluate(() => ({
        h2: (document.querySelector("h2")?.textContent ?? "").trim(),
        activeId: document.querySelector('[data-queue-row-active="true"]')?.getAttribute("data-entity-id") ?? null,
        path: location.pathname,
        search: location.search,
    }));
}

test("PATH-based recordId is honored or ignored?", async ({ page }) => {
    await page.goto(`/workspace/work-unit/new-leads/${KURZMAN}`, { waitUntil: "commit" });
    await settle(page);
    await page.waitForTimeout(1500);
    const path = await committed(page);
    console.log(`URLCONTRACT_PATH ${JSON.stringify({ ...path, wantIfHonored: KURZMAN })}`);

    await page.goto(`/workspace/work-unit/new-leads?subject_id=${KURZMAN}`, { waitUntil: "commit" });
    await settle(page);
    await page.waitForTimeout(1500);
    const query = await committed(page);
    console.log(`URLCONTRACT_QUERY ${JSON.stringify({ ...query, wantIfHonored: KURZMAN })}`);
    expect(true).toBe(true);
});
