/** FINAL REMOUNT — the Add Charge preview with an applicable discount. Nothing is confirmed. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/final-remount";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test("§13 — gross, policy and rate, discount money, net, truthful consequence", async ({ page }) => {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url(), "the governed QA session is live").not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6000);

    const pick = async (triggerText: RegExp, optionText: RegExp, label: string) => {
        const t = page.locator("[data-financials-overlay='add_charge'] button").filter({ hasText: triggerText }).first();
        if (!(await t.count())) { log(`${label}: trigger absent`); return; }
        await t.click({ timeout: 20_000 });
        await page.waitForTimeout(2500);
        const opts = await page.evaluate(() => Array.from(document.querySelectorAll("[role='option']")).map((o) => (o as HTMLElement).innerText.replace(/\s+/g, " ").trim()));
        log(`${label} options: ${JSON.stringify(opts)}`);
        const o = page.locator("[role='option']").filter({ hasText: optionText }).first();
        if (await o.count()) { await o.click({ timeout: 20_000 }); await page.waitForTimeout(7000); }
        else { await page.keyboard.press("Escape"); log(`${label}: option not found`); }
    };
    await pick(/^Household/, /Certa Certhouse/, "APPLIES TO");
    await pick(/^Field trip/, /Monthly tuition/, "CHARGE TYPE");

    const r = await page.evaluate(() => {
        const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        if (!root) return { present: false } as Record<string, unknown>;
        const text = root.innerText.replace(/\s+/g, " ").trim();
        const pv = root.querySelector("[data-addcharge-preview-discount-amount='true']") as HTMLElement | null;
        const net = root.querySelector("[data-addcharge-preview-net='true']") as HTMLElement | null;
        const posted = root.querySelector("[data-addcharge-posted-balance='true']") as HTMLElement | null;
        const posting = root.querySelector("[data-addcharge-posting]") as HTMLElement | null;
        return {
            present: true,
            text: text.slice(0, 1400),
            chargeToCount: (text.match(/Charge to/gi) || []).length,
            discountAmount: pv?.innerText.trim() ?? null,
            netLine: net?.innerText.replace(/\s+/g, " ").trim() ?? null,
            postedBalance: posted?.innerText.trim() ?? null,
            postingKind: posting?.getAttribute("data-addcharge-posting") ?? null,
            postingCopy: posting?.innerText.replace(/\s+/g, " ").trim() ?? null,
            nativeDates: root.querySelectorAll("input[type=date]").length,
            alloyDates: root.querySelectorAll("[data-alloy-date-input='true']").length,
            discountSelector: Array.from(root.querySelectorAll("button")).filter((b) => /discount/i.test(b.getAttribute("aria-label") || "")).length,
            nativeSelects: root.querySelectorAll("select").length,
        };
    });
    log(`§13 PREVIEW ${JSON.stringify(r, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/B-add-charge-discount.json`, JSON.stringify(r, null, 2));
    await page.screenshot({ path: `${OUT}/M10-add-charge-discount.png` });
    const cancel = page.locator("[data-financials-overlay='add_charge']").getByRole("button", { name: /^Cancel$/ }).first();
    if (await cancel.count()) await cancel.click({ timeout: 15_000 });
});
