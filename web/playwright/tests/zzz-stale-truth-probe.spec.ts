/** Does account A's financial truth survive under account B? Observation only. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("A truth under B", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error(`workspace never mounted at ${page.url()}`);
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 1, undefined, { timeout: 180_000 });
    await page.waitForTimeout(4_000);

    const snapshot = () => page.evaluate(() => {
        const card = document.querySelector("[data-financials-account-card]");
        const sel = document.querySelector("[data-financials-account-row][data-financials-account-selected='true']");
        const money = (card?.textContent ?? "").match(/\$[\d,]+\.\d\d/g) ?? [];
        return {
            selectedId: sel?.getAttribute("data-financials-account-row") ?? null,
            selectedName: (sel as HTMLElement | null)?.innerText?.split("\n")[0] ?? null,
            ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
            money: money.slice(0, 6),
            detailPresent: !!document.querySelector("[data-financials-detail='true']"),
            /* Does anything in the DOM say WHOSE floor this is? */
            floorIdentity: document.querySelector("[data-financials-detail='true']")?.getAttribute("data-financials-detail-account") ?? "(none)",
        };
    });

    const rows = page.locator("[data-financials-account-row]");
    await rows.nth(0).click({ timeout: 30_000 });
    await page.waitForTimeout(6_000);
    const A = await snapshot();
    log(`A SELECTED: ${JSON.stringify(A)}`);

    /* Now pick a DIFFERENT account and look immediately. */
    await rows.nth(2).click({ timeout: 30_000 });
    for (const delay of [150, 400, 800, 1500, 3000, 6000]) {
        await page.waitForTimeout(delay === 150 ? 150 : delay - 0);
        const S = await snapshot();
        const stale = S.selectedId !== A.selectedId && S.ledgerRows === A.ledgerRows && A.ledgerRows > 0;
        const staleMoney = S.selectedId !== A.selectedId && S.money.length > 0 && JSON.stringify(S.money) === JSON.stringify(A.money);
        log(`  +${delay}ms selected=${S.selectedName} rows=${S.ledgerRows} money=${JSON.stringify(S.money)} floorIdentity=${S.floorIdentity} ${stale ? "<<< A LEDGER UNDER B" : ""}${staleMoney ? " <<< A MONEY UNDER B" : ""}`);
    }
    expect(true).toBe(true);
});
