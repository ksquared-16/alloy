/** The event-dated charge type still renders the canonical date control on this deployment. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/sign-repair";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("Service date on an event-dated type is AlloyDateInput", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6000);
    const r = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return {
            type: (root?.innerText.match(/CHARGE TYPE\w*\s*([^\n▾]+)/) || [])[1]?.trim() ?? null,
            nativeDates: root?.querySelectorAll("input[type=date]").length ?? null,
            alloyDates: root?.querySelectorAll("[data-alloy-date-input='true']").length ?? null,
            serviceDateText: (root?.innerText.match(/SERVICE DATE\w*\s*([^\n]{0,40})/) || [])[1] ?? null,
        };
    });
    log(`DATE CONTROL ${JSON.stringify(r)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/date-control.json`, JSON.stringify(r, null, 2));
    await page.screenshot({ path: `${OUT}/S-add-charge-date.png` });
    expect(r.nativeDates, "no browser date widget").toBe(0);
    expect(r.alloyDates, "the canonical control is there").toBe(1);
});
