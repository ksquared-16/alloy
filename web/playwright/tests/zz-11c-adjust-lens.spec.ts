/** §10 — is the Adjustment door anywhere on Details, under any lens or on a row? Diagnostic. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("hunt the adjustment door", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await expect(d).toHaveCount(1);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);

    const lenses = await page.locator("[data-financials-lens]").evaluateAll((n) =>
        n.map((e) => e.getAttribute("data-financials-lens")));
    log(`LENSES: ${JSON.stringify(lenses)}`);

    for (const lens of lenses) {
        const l = page.locator(`[data-financials-lens="${lens}"]`).first();
        if (await l.count()) { await l.click({ timeout: 15_000 }).catch(() => {}); await page.waitForTimeout(6000); }
        const probe = await page.evaluate(() => ({
            rows: document.querySelectorAll("[data-financials-ledger-row],[data-charge-row]").length,
            rowActions: document.querySelectorAll("[data-row-action]").length,
            adjustControls: Array.from(document.querySelectorAll("button,a"))
                .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
                .filter((t) => /adjust|credit/i.test(t) && t.length < 40),
        }));
        log(`LENS ${lens}: ${JSON.stringify(probe)}`);
    }

    /* Row actions may only appear on hover — check the first row explicitly. */
    const firstRow = page.locator("[data-financials-ledger-row],[data-charge-row]").first();
    if (await firstRow.count()) {
        await firstRow.hover().catch(() => {});
        await page.waitForTimeout(2500);
        const onHover = await page.evaluate(() => ({
            rowActions: Array.from(document.querySelectorAll("[data-row-action]")).map((e) => e.getAttribute("data-row-action")),
        }));
        log(`ON HOVER: ${JSON.stringify(onHover)}`);
        await firstRow.click({ timeout: 15_000 }).catch(() => {});
        await page.waitForTimeout(7000);
        const onClick = await page.evaluate(() => ({
            rowActions: Array.from(document.querySelectorAll("[data-row-action]")).map((e) => e.getAttribute("data-row-action")),
            adjustText: Array.from(document.querySelectorAll("button,a"))
                .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
                .filter((t) => /adjust/i.test(t) && t.length < 40),
        }));
        log(`ON ROW CLICK: ${JSON.stringify(onClick)}`);
    }
});
