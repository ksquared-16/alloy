/**
 * §12 — S1 ADDS NO OPERATOR SURFACE, AND BREAKS NONE.
 *
 * S1 persists a new table and a new policy type and deliberately exposes neither: `billing_calendar`
 * stays out of `OPERATOR_AUTHORABLE_FINANCIAL_POLICY_TYPES` and no component reads the period table.
 * The claim worth PROVING on the deployed build is therefore the negative one — that the existing
 * Financials surfaces still mount exactly as they did.
 */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Financials still mounts, and Accounts still lists accounts", async ({ page }) => {
    await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 25_000 });
    await page.waitForTimeout(11_000);
    const cardMounted = await page.locator("[data-financials-card='true']").count();
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    const accounts = await page.locator("[data-financials-account-row]").count();
    /* Nothing in S1 should have introduced a control. */
    const periodControls = await page.locator("[data-financials-billing-period], [data-billing-period-close]").count();
    log(`FINANCIALS MOUNT: card=${cardMounted} accounts=${accounts} s1Controls=${periodControls}`);
    expect(cardMounted, "the Financials card mounted").toBeGreaterThan(0);
    expect(accounts, "Accounts still lists accounts").toBeGreaterThan(0);
    expect(periodControls, "S1 added no operator control").toBe(0);
});
