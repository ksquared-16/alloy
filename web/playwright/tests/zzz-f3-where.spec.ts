import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("what is on this page right now", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(45_000);
    const s = await page.evaluate(() => ({
        url: location.pathname + location.search,
        title: document.title,
        signedOut: /sign in|log in|unauthor/i.test(document.body.innerText.slice(0, 2000)),
        text: document.body.innerText.replace(/\s+/g, " ").slice(0, 400),
        rows: document.querySelectorAll("[data-queue-row], [data-adminv2-queue-row], tr").length,
        cards: [...document.querySelectorAll("[data-universal-card-key]")].map((e) => e.getAttribute("data-universal-card-key")),
    }));
    log(`STATE: ${JSON.stringify(s)}`);
    await page.screenshot({ path: "../certification/financials/w7-repair-1/f3-page-now.png", fullPage: false });
    expect(true).toBe(true);
});
