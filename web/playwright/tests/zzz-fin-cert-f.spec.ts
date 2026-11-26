/** FINANCIALS FINAL MOUNTED CERTIFICATION — STAGE F: Overview smoke and the Adjustment body. Read only. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-mounted";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.describe.configure({ mode: "serial" });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const save = (n: string, v: unknown) => { mkdirSync(OUT, { recursive: true }); writeFileSync(`${OUT}/${n}.json`, JSON.stringify(v, null, 2)); };

test("§14 — Overview controls, periodic billing, and the Adjustment body", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(12_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(12_000);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/F1-overview.png` });
    const overview = await page.evaluate(() => {
        const text = document.body.innerText;
        const actionable = Array.from(document.querySelectorAll("button"))
            .filter((b) => { const cs = getComputedStyle(b); const bg = cs.backgroundColor;
                return bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent" && /^rgb\(/.test(bg); })
            .map((b) => ({ t: (b.textContent || "").replace(/\s+/g, " ").trim().slice(0, 32), bg: getComputedStyle(b).backgroundColor }))
            .filter((b) => b.t.length > 0).slice(0, 30);
        return {
            periodicBilling: /periodic billing/i.test(text),
            periodicBillingLine: (text.match(/[^\n]*periodic billing[^\n]*/i) || [])[0] ?? null,
            nativeControls: document.querySelectorAll("[data-workspace-section-tab] ~ * select, input[type=number], input[type=date]").length,
            actionable,
        };
    });
    log(`§14 OVERVIEW ${JSON.stringify(overview, null, 1)}`);
    save("F-overview", overview);

    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(8000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(4000);
    const adjTab = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Adjustment$/ }).first();
    log(`adjustment tab count ${await adjTab.count()}`);
    await adjTab.click({ timeout: 20_000 });
    await page.waitForTimeout(6000);
    const adj = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return {
            text: root?.innerText.replace(/\s+/g, " ").trim().slice(0, 1200) ?? null,
            buttons: Array.from(root?.querySelectorAll("button") ?? []).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 20),
            natives: root?.querySelectorAll("select,input[type=number],input[type=date]").length ?? null,
        };
    });
    log(`§14 ADJUSTMENT ${JSON.stringify(adj, null, 1)}`);
    save("F-adjustment", adj);
    await page.screenshot({ path: `${OUT}/F2-adjustment.png` });
});
