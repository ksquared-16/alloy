/** Is the governed deployed QA session live? One navigation, no measurement. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(300_000);
test("the session reaches the enrolled-children workspace", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    console.log(`URL=${page.url()} detailsNav=${await page.locator("[data-financials-nav='details']").count()}`); // eslint-disable-line no-console
    expect(page.url()).not.toContain("/login");
});
