/** §18 — the cadence control sits behind "Generate a period's tuition". Open it and read it. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { alloyOptions, isAlloyControl } from "../helpers/alloyControls";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Bulk Charge cadence", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    await page.locator("[data-workspace-section-tab='charges']").first().click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);

    const opener = page.getByText(/Generate a period's tuition/i).first();
    const present = await opener.count();
    if (present) { await opener.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(8000); }
    const R = {
        openerPresent: present,
        cadence: await page.locator('[data-testid="financials-bulk-cadence"]').count(),
        canonical: (await page.locator('[data-testid="financials-bulk-cadence"]').count())
            ? await isAlloyControl(page, "financials-bulk-cadence") : null,
        options: (await page.locator('[data-testid="financials-bulk-cadence"]').count())
            ? (await alloyOptions(page, "financials-bulk-cadence")).map((o) => o.label) : [],
        nativeSelects: await page.locator("select").count(),
    };
    log(`§18 BULK: ${JSON.stringify(R)}`);
    expect(R.nativeSelects, "zero native selects on the Bulk Charge surface").toBe(0);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/gate-bulk-final.json`, JSON.stringify(R, null, 2));
});
