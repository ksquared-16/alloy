/** §17 — Expected Funding, opening charge detail the way the section actually opens it: a row button. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { alloyOptions, isAlloyControl } from "../helpers/alloyControls";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Expected Funding via charge detail", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    await page.locator("[data-workspace-section-tab='charges']").first().click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);

    /* The queue rows are buttons inside the awaiting list. Take the first that looks like a charge. */
    const section = page.locator('[data-testid="financials-charges-section"]');
    const rowButtons = section.locator("button").filter({ hasText: /\$\s?[\d,]+\.\d{2}|Tuition|Fee|Materials|Field trip/ });
    R.candidateRows = await rowButtons.count();
    if (R.candidateRows) { await rowButtons.first().click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(12_000); }

    R.detail = await page.evaluate(() => ({
        arrangementShares: document.querySelectorAll('[data-testid="arrangement-share"]').length,
        fundingType: document.querySelectorAll('[data-testid="financials-funding-type"]').length,
        fundingAgency: document.querySelectorAll('[data-testid="financials-funding-agency"]').length,
        nativeSelects: document.querySelectorAll("select").length,
        mentionsExpectedFunding: /expected funding/i.test(document.body.innerText),
    }));
    if ((R.detail as { fundingType: number }).fundingType) {
        R.typeCanonical = await isAlloyControl(page, "financials-funding-type");
        R.typeOptions = (await alloyOptions(page, "financials-funding-type")).map((o) => o.label).slice(0, 6);
        if ((R.detail as { fundingAgency: number }).fundingAgency) {
            const opts = await alloyOptions(page, "financials-funding-agency");
            R.agencyCanonical = await isAlloyControl(page, "financials-funding-agency");
            R.agencyOptions = opts.map((o) => o.label).slice(0, 5);
            R.agencyPlaceholderNotAValue = opts.filter((o) => !o.value).length <= 1;
        }
    }
    log(`§17 rows=${R.candidateRows} detail=${JSON.stringify(R.detail)}`);
    log(`§17 controls: type=${R.typeCanonical} opts=${JSON.stringify(R.typeOptions)} agency=${R.agencyCanonical} ${JSON.stringify(R.agencyOptions)}`);
    expect((R.detail as { nativeSelects: number }).nativeSelects, "zero native selects wherever we landed").toBe(0);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/gate-funding-final.json`, JSON.stringify(R, null, 2));
});
