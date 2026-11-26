/** Where is the Adjustment door, and what does Escape actually close? Diagnostic. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1680, height: 1050 } });
test.setTimeout(500_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

async function openDetails(page: import("@playwright/test").Page) {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(14_000);
    const d = page.locator("[data-financials-card='true']").getByRole("button", { name: /^Details/ }).first();
    await expect(d).toHaveCount(1);
    await d.click({ timeout: 20_000 });
    await page.waitForTimeout(12_000);
}

test("the Adjustment door", async ({ page }) => {
    await openDetails(page);
    const probe = await page.evaluate(() => ({
        buttonsMentioningAdjust: Array.from(document.querySelectorAll("button,a"))
            .map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim())
            .filter((t) => /adjust/i.test(t)),
        rowActionAdjust: document.querySelectorAll('[data-row-action="adjust"],[command="billing.adjust_account"]').length,
        rowActions: Array.from(document.querySelectorAll("[data-row-action]")).map((e) => e.getAttribute("data-row-action")),
        addButton: Array.from(document.querySelectorAll("button")).filter((b) => /^Add$/.test(b.textContent?.trim() ?? "")).length,
    }));
    log(`ADJUST DOOR: ${JSON.stringify(probe, null, 1)}`);
});

test("what Escape closes, and where focus lands", async ({ page }) => {
    await openDetails(page);
    const gear = page.locator('[data-financials-manage-responsibility="gear"]').first();
    await expect(gear).toHaveCount(1);
    await gear.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(9000);
    const opened = await page.evaluate(() => ({
        panelOpen: document.querySelectorAll('[data-testid="responsibility-scope"]').length,
        detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
        dialogs: document.querySelectorAll("[role=dialog]").length,
    }));
    await page.keyboard.press("Escape");
    await page.waitForTimeout(3500);
    const after = await page.evaluate(() => ({
        panelOpen: document.querySelectorAll('[data-testid="responsibility-scope"]').length,
        detailsOpen: document.querySelectorAll("[data-financials-payment-methods]").length,
        dialogs: document.querySelectorAll("[role=dialog]").length,
        gearStillThere: document.querySelectorAll('[data-financials-manage-responsibility="gear"]').length,
        focus: (() => {
            const a = document.activeElement as HTMLElement | null;
            return a === document.body ? "BODY" : `${a?.tagName}("${a?.getAttribute("aria-label") ?? a?.innerText?.slice(0, 30)}")`;
        })(),
    }));
    log(`OPENED: ${JSON.stringify(opened)}`);
    log(`AFTER ESCAPE: ${JSON.stringify(after)}`);
});
