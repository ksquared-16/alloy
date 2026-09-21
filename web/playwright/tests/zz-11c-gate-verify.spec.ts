/** Did the §17/§18 surfaces actually render? A zero read on a surface that never opened proves nothing. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("do the charges section and charge detail open at all", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    await page.locator("[data-workspace-section-tab='charges']").first().click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);

    R.chargesSection = await page.evaluate(() => ({
        sectionRendered: document.querySelectorAll('[data-testid="financials-charges-section"]').length,
        bulkCadence: document.querySelectorAll('[data-testid="financials-bulk-cadence"]').length,
        bulkAnything: document.querySelectorAll("[data-financials-bulk], [data-testid^='financials-bulk']").length,
        siteSelectorText: (document.querySelector("[data-workspace-site-filter], [data-financials-site]") as HTMLElement | null)?.innerText?.trim() ?? null,
        bodyMentionsBulk: /bulk/i.test(document.body.innerText),
        queueRows: document.querySelectorAll("[data-financials-queue-row]").length,
    }));
    log(`§18 CHARGES SECTION: ${JSON.stringify(R.chargesSection)}`);

    const row = page.locator("[data-financials-queue-row]").first();
    if (await row.count()) { await row.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(11_000); }
    R.chargeDetail = await page.evaluate(() => ({
        detailNodes: document.querySelectorAll("[data-charge-detail]").length,
        arrangementShares: document.querySelectorAll('[data-testid="arrangement-share"]').length,
        fundingType: document.querySelectorAll('[data-testid="financials-funding-type"]').length,
        bodyMentionsExpectedFunding: /expected funding/i.test(document.body.innerText),
    }));
    log(`§17 CHARGE DETAIL: ${JSON.stringify(R.chargeDetail)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/gate-verification.json`, JSON.stringify(R, null, 2));
});
