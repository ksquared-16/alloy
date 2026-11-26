/** Which visible control opens Financials Details on the deployed build? Diagnostic only. */
import { test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("find the Details door", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    log(`URL: ${page.url()}`);
    const probe = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-card='true']") as HTMLElement | null;
        return {
            financialsCardPresent: Boolean(card),
            openDetailsAttr: document.querySelectorAll("[data-financials-open-details]").length,
            detailsLinkAttr: document.querySelectorAll("[data-financials-details-link]").length,
            cardButtons: Array.from(card?.querySelectorAll("button,a") ?? [])
                .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
                .filter(Boolean),
            anyDetailsText: Array.from(document.querySelectorAll("button,a"))
                .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
                .filter((t) => /details/i.test(t)),
        };
    });
    log(`PROBE: ${JSON.stringify(probe, null, 1)}`);
});
