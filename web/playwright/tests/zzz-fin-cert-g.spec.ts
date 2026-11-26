import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("§14 — the Adjustment body", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(10_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(5000);
    const tabs = await page.evaluate(() => Array.from(document.querySelectorAll("[data-financials-overlay='add_charge'] button"))
        .map((b, i) => ({ i, t: (b.textContent || "").replace(/\s+/g, " ").trim(), mode: b.getAttribute("data-financials-entry-mode-tab") })));
    log(`TABS ${JSON.stringify(tabs)}`);
    const adj = page.locator("[data-financials-overlay='add_charge'] button").filter({ hasText: /^Adjustment$/ }).first();
    if (await adj.count()) {
        await adj.click({ timeout: 20_000 });
        await page.waitForTimeout(6000);
    }
    const r = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return { mode: root?.getAttribute("data-financials-entry-mode") ?? null,
            text: root?.innerText.replace(/\s+/g, " ").trim().slice(0, 1200) ?? null,
            natives: root?.querySelectorAll("select,input[type=number],input[type=date]").length ?? null };
    });
    log(`ADJUSTMENT ${JSON.stringify(r, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/F-adjustment.json`, JSON.stringify({ tabs, ...r }, null, 2));
    await page.screenshot({ path: `${OUT}/F2-adjustment.png` });
});
