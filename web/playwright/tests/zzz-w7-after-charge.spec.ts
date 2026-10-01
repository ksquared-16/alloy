/** After the write: what does the account actually show, on a fresh mount? */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("Certfree after the controlled charge", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);

    const row = await page.evaluate(() => {
        const r = [...document.querySelectorAll("[data-financials-account-row]")]
            .find((e) => /certfree/i.test((e as HTMLElement).innerText));
        return r ? { id: r.getAttribute("data-financials-account-row"), text: (r as HTMLElement).innerText.replace(/\s+/g, " ").trim() } : null;
    });
    log(`ACCOUNT ROW: ${JSON.stringify(row)}`);
    await page.locator(`[data-financials-account-row="${row!.id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(12_000);

    const detail = await page.evaluate(() => ({
        ledgerRows: document.querySelectorAll("[data-financials-ledger-row]").length,
        chargeLines: document.querySelectorAll("[data-financials-charge-line]").length,
        rowCharges: [...document.querySelectorAll("[data-financials-row-charge]")].map((e) => e.getAttribute("data-financials-row-charge")),
        arrangements: (document.querySelector("[data-financials-arrangements]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 240) ?? null,
        detailText: (document.querySelector("[data-financials-detail-account]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 700) ?? null,
    }));
    log(`DETAIL: ${JSON.stringify(detail, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/after-charge-account.json`, JSON.stringify({ row, detail }, null, 2));
    await page.screenshot({ path: `${OUT}/C-account-after-charge.png`, fullPage: true });
    expect(true).toBe(true);
});
