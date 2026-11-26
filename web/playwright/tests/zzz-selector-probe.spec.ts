/** Does the sampling harness's DOM contract hold on the deployed build? Probe only. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the selectors the sample depends on", async ({ page }) => {
    for (let attempt = 1; attempt <= 2; attempt++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (attempt === 2) throw new Error(`workspace nav never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForTimeout(20_000);

    const counts = await page.evaluate(() => {
        const q = (s: string) => document.querySelectorAll(s).length;
        return {
            accountsSection: q("[data-financials-section='accounts'], [data-financials-accounts]"),
            accountRow: q("[data-financials-account-row]"),
            accountOption: q("[data-financials-account-option]"),
            detail: q("[data-financials-detail='true']"),
            ledgerRow: q("[data-financials-ledger-row]"),
            overviewTab: q("[data-workspace-section-tab='overview']"),
        };
    });
    log(`SELECTOR COUNTS: ${JSON.stringify(counts, null, 2)}`);
    const firstRowText = await page.evaluate(() => {
        const r = document.querySelector<HTMLElement>("[data-financials-account-row], [data-financials-account-option]");
        return r ? { text: (r.innerText ?? "").trim().slice(0, 60), disabled: r.hasAttribute("disabled"), ariaDisabled: r.getAttribute("aria-disabled") } : null;
    });
    log(`FIRST ROW: ${JSON.stringify(firstRowText)}`);
    expect(counts.accountRow + counts.accountOption, "the sample needs a row selector that matches").toBeGreaterThan(0);
});
