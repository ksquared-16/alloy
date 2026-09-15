/**
 * THREAD 11A — A HOUSEHOLD WITH NO MONEY IS STILL A FINANCIAL SUBJECT, MOUNTED.
 *
 * Repair Pass 2 could prove the account RESOLVED through the API and could not prove an operator
 * could reach it, because Financials → Accounts did not list it: the rail was the position cohort
 * grouped by household, so a family appeared only once somebody had billed them. This is the proof
 * that pass could not capture — the zero-activity account listed, selected, and rendering the
 * workspace-native detail as a legitimate zero rather than as a broken read.
 *
 * Run against the slot's own dev server with the slot's stored operator session. Nothing here
 * writes: every assertion is a read of what the product renders.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
/* The operator's own path, in the labels the build renders: /workspace → Financials → Accounts. */
const WORKSPACE = "/workspace";
const FINANCIALS_RAIL = '[aria-label^="Financials \u2014"]';

/** The certification fixture's zero-activity household. */
const ALVAREZ = "fd000000-0000-4000-8000-0000000c0001";

test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012" });
/* The workspace shell, the overlay and two server projections. Generous, and bounded. */
test.describe.configure({ timeout: 180_000 });

async function openFinancials(page: Page) {
    await page.goto(WORKSPACE);
    await page.waitForLoadState("domcontentloaded");
    await page.locator(FINANCIALS_RAIL).first().click();
    await expect(page.locator("[data-financials-section]")).toHaveCount(1, { timeout: 45_000 });
}

async function openAccounts(page: Page) {
    await openFinancials(page);
    await page.locator('[data-workspace-section-tab="accounts"]').click();
    await expect(page.locator('[data-testid="financials-accounts-section"]')).toBeVisible({ timeout: 30_000 });
    // The rail composes only when BOTH reads land, so wait for a row rather than for a timeout.
    await expect(page.locator("[data-financials-account-row]").first()).toBeVisible({ timeout: 60_000 });
}

test("the zero-activity household is listed, selectable, and reads as a legitimate zero", async ({ page }) => {
    await openAccounts(page);

    // 1 · LISTED. The whole defect, in one assertion.
    const row = page.locator(`[data-financials-account-row="${ALVAREZ}"]`);
    await expect(row, "an eligible household with no activity belongs on Accounts").toHaveCount(1);
    await expect(row).toHaveAttribute("data-financials-account-state", "no_activity");
    await expect(page.locator(`[data-financials-account-outstanding="${ALVAREZ}"]`)).toHaveText("$0.00");
    await expect(row, "the row says which zero this is").toContainText("No financial activity yet");
    // Never an error, and never a placeholder.
    await expect(page.locator('[data-financials-accounts-error="true"]')).toHaveCount(0);

    // 2 · SELECTABLE, and the detail is the workspace-native one.
    await row.click();
    const detail = page.locator(`[data-financials-workspace-detail="${ALVAREZ}"]`);
    await expect(detail).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-financials-detail-error="true"]'), "a failed read is a different screen")
        .toHaveCount(0);

    // 3 · THE ZEROS, and the period they are true of.
    await expect(detail).toContainText("Outstanding");
    await expect(detail.getByText("$0.00").first()).toBeVisible();
    const period = detail.locator("[data-financials-billing-period]");
    await expect(period).toHaveCount(1);
    expect(await period.getAttribute("data-financials-billing-period"), "the current billing period is named")
        .toMatch(/\d{4}-\d{2}/);

    // 4 · NO FABRICATED STATE. Each absence says what it is, in the product's own words.
    await expect(detail).toContainText("No responsibility has been arranged for this account.");
    await expect(detail).toContainText("Nothing is expected from a third party.");
    await expect(detail).toContainText("No money has been received on this account.");
    await expect(detail).toContainText("Nothing has been charged on this account yet.");
    await expect(detail.locator("[data-financials-payment]"), "no payment is invented").toHaveCount(0);
    await expect(detail.locator("[data-financials-ledger-row]"), "no ledger row is invented").toHaveCount(0);

    // 5 · THE ONE THING YOU CAN DO HERE IS REACHABLE.
    const actions = page.locator('[data-financials-account-actions="true"]');
    await expect(actions).toHaveAttribute("data-financials-account-actions-open", "true");
    const addCharge = page.getByText("Add charge", { exact: false }).first();
    await expect(addCharge).toBeVisible({ timeout: 45_000 });
    await addCharge.scrollIntoViewIfNeeded();
    await page.screenshot({
        path: "../certification/financials/thread11a-zero-activity-add-charge.png",
    });

    /* The repo's certification directory; Playwright runs with `web/` as its working directory. */
    await page.screenshot({
        path: "../certification/financials/thread11a-zero-activity-account-detail.png",
        fullPage: true,
    });
});

test("a cold reload reaches the same account by the same path", async ({ page }) => {
    await openAccounts(page);
    await page.reload();
    await openAccounts(page);
    const row = page.locator(`[data-financials-account-row="${ALVAREZ}"]`);
    await expect(row).toHaveCount(1, { timeout: 60_000 });
    await row.click();
    await expect(page.locator(`[data-financials-workspace-detail="${ALVAREZ}"]`)).toBeVisible({ timeout: 45_000 });
    await expect(page.locator('[data-financials-detail-error="true"]')).toHaveCount(0);
});

test("accounts that carry money are unchanged by the join", async ({ page }) => {
    await openAccounts(page);

    /*
     * The zero-activity rows are ADDITIVE. An account with posted money must still read its own
     * figures, from the same position cohort that produced them before this repair.
     */
    const withMoney = page.locator('[data-financials-account-row][data-financials-account-state="outstanding"]');
    const count = await withMoney.count();
    expect(count, "the certification tenant carries at least one owing account").toBeGreaterThan(0);

    for (let i = 0; i < count; i += 1) {
        const id = await withMoney.nth(i).getAttribute("data-financials-account-row");
        const amount = await page.locator(`[data-financials-account-outstanding="${id}"]`).innerText();
        expect(amount, `${id} still shows a real outstanding figure`).toMatch(/^\$[\d,]+\.\d{2}$/);
        expect(amount, `${id} is not zeroed by the join`).not.toBe("$0.00");
    }

    await page.screenshot({ path: "../certification/financials/thread11a-accounts-rail.png", fullPage: true });
});
