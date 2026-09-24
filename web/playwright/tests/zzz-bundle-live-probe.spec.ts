/** Is the deployed card answering, or is the function missing? One opening, no measurement. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("the deployed Details card answers", async ({ page }) => {
    let timing = "";
    page.on("response", (r) => {
        if (/financials\/card/.test(r.url())) timing = r.headers()["server-timing"] ?? "(none)";
    });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await expect(page.locator("[data-financials-nav='details']").first()).toHaveCount(1, { timeout: 150_000 });
    await page.locator("[data-financials-nav='details']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 150_000 });
    await page.waitForTimeout(12_000);
    const state = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-detail='true']") as HTMLElement;
        const txt = root.innerText.replace(/\s+/g, " ");
        return { rows: root.querySelectorAll("[data-financials-ledger-row]").length, head: txt.slice(0, 220) };
    });
    log(`LEDGER ROWS: ${state.rows}`);
    log(`SURFACE: ${state.head}`);
    log(`SERVER-TIMING: ${timing}`);
});
