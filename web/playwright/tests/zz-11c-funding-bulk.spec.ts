/**
 * §17 / §18 at their REAL hosts.
 *
 * Bulk Charge is rendered by the Charges SECTION, not by a "Bulk" command button. Expected Funding
 * is rendered by CHARGE DETAIL, not by the Accounts funding lens. The previous probe looked where
 * the instruction's wording implied and found neither — the same class of error as hunting the
 * removed "Add adjustment" affordance, so this one starts from who actually renders them.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { alloyOptions, isAlloyControl } from "../helpers/alloyControls";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11c-slice2";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(700_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function openCharges(page: import("@playwright/test").Page) {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
    if (await nav.count()) { await nav.click({ force: true, timeout: 15_000 }); await page.waitForTimeout(13_000); }
    const tab = page.locator("[data-workspace-section-tab='charges']").first();
    await expect(tab, "the Charges section is offered").toHaveCount(1);
    await tab.click({ timeout: 15_000 });
    await page.waitForTimeout(12_000);
}

test("§18 — Bulk Charge cadence, in the Charges section that renders it", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openCharges(page);
    R.cadence = {
        present: await page.locator('[data-testid="financials-bulk-cadence"]').count(),
        nativeSelects: await page.locator("select").count(),
    };
    if ((R.cadence as { present: number }).present) {
        (R.cadence as Record<string, unknown>).canonical = await isAlloyControl(page, "financials-bulk-cadence");
        (R.cadence as Record<string, unknown>).options = (await alloyOptions(page, "financials-bulk-cadence")).map((o) => o.label);
    }
    log(`§18 BULK CADENCE: ${JSON.stringify(R.cadence)}`);
    expect((R.cadence as { nativeSelects: number }).nativeSelects, "zero native selects in the Charges section").toBe(0);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/gate-bulk-charge.json`, JSON.stringify(R, null, 2));
});

test("§17 — Expected Funding, in the charge detail that renders it", async ({ page }) => {
    const R: Record<string, unknown> = {};
    await openCharges(page);
    const row = page.locator("[data-financials-ledger-row],[data-charge-row],[data-financials-queue-row]").first();
    R.chargeRows = await page.locator("[data-financials-ledger-row],[data-charge-row],[data-financials-queue-row]").count();
    if (await row.count()) { await row.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(11_000); }
    R.funding = {
        typeControl: await page.locator('[data-testid="financials-funding-type"]').count(),
        agencyControl: await page.locator('[data-testid="financials-funding-agency"]').count(),
        chargeDetailOpen: await page.locator("[data-charge-detail]").count(),
        nativeSelects: await page.locator("select").count(),
    };
    if ((R.funding as { typeControl: number }).typeControl) {
        (R.funding as Record<string, unknown>).typeCanonical = await isAlloyControl(page, "financials-funding-type");
        (R.funding as Record<string, unknown>).typeOptions = (await alloyOptions(page, "financials-funding-type")).map((o) => o.label).slice(0, 6);
        const agency = await page.locator('[data-testid="financials-funding-agency"]').count();
        if (agency) {
            (R.funding as Record<string, unknown>).agencyCanonical = await isAlloyControl(page, "financials-funding-agency");
            const opts = await alloyOptions(page, "financials-funding-agency");
            (R.funding as Record<string, unknown>).agencyPlaceholderIsNotAValue =
                opts.filter((o) => o.value === "" || o.value === null).length <= 1;
            (R.funding as Record<string, unknown>).agencyOptions = opts.map((o) => o.label).slice(0, 5);
        }
    }
    log(`§17 CHARGE ROWS: ${R.chargeRows}`);
    log(`§17 EXPECTED FUNDING: ${JSON.stringify(R.funding)}`);
    expect((R.funding as { nativeSelects: number }).nativeSelects, "zero native selects on charge detail").toBe(0);
    writeFileSync(`${OUT}/gate-expected-funding.json`, JSON.stringify(R, null, 2));
});
