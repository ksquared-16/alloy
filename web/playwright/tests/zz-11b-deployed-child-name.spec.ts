/**
 * Which visible control on the Children card actually opens the child's panel — the NAME, or the
 * row action beside it? Kelly's walkthrough must name the one that works.
 */
import { test, expect } from "@playwright/test";
import { writeFileSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/11b-deployed-qa";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(400_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("clicking the child's name", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    expect(page.url()).not.toContain("/login");
    const before = page.url();
    const card = page.locator("[data-universal-card-key='children']");
    await card.getByRole("button", { name: /Certa\s+Certhouse/i }).first().click({ timeout: 20_000 }).catch((e) => log(`click: ${e}`));
    await page.waitForTimeout(14_000);
    const after = await page.evaluate(() => ({
        url: location.pathname + location.search,
        cards: Array.from(document.querySelectorAll("[data-universal-card-key]")).map((e) => e.getAttribute("data-universal-card-key")),
        schedulingPresent: Boolean(document.querySelector("[data-universal-card-key='scheduling']")),
        dialogOpen: Boolean(document.querySelector("[role='dialog'][aria-modal='true']")),
        heading: document.querySelector("h1,h2")?.textContent?.trim() ?? null,
    }));
    log(`BEFORE: ${before}`);
    log(`AFTER NAME CLICK: ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${OUT}/n01-name-click.png`, fullPage: true });
    writeFileSync(`${OUT}/deployed-child-name.json`, JSON.stringify({ before, after }, null, 2));
});
