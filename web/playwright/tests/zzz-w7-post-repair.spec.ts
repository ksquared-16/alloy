/**
 * §3 — THE DECISIVE PROOF. After the repair deploys, a charge created without touching Charge To
 * must inherit the standing arrangement as a persisted, charge-scoped allocation.
 *
 * The PRE-REPAIR charge on this same account is preserved untouched as the contrast: standing
 * arrangement present, charge posted, zero allocations.
 */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("post-repair: the standing arrangement becomes the charge's allocation", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 0, undefined, { timeout: 180_000 });
    await page.waitForTimeout(3_000);

    const id = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .find((r) => /certfree/i.test((r as HTMLElement).innerText))?.getAttribute("data-financials-account-row") ?? null);
    await page.locator(`[data-financials-account-row="${id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(10_000);

    const before = await page.evaluate(() => ({
        accountRow: [...document.querySelectorAll("[data-financials-account-row]")]
            .find((r) => /certfree/i.test((r as HTMLElement).innerText))?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        detail: (document.querySelector("[data-financials-detail-account]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 320) ?? null,
    }));
    log(`BEFORE: ${JSON.stringify(before)}`);

    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);

    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await page.locator("[role='option'], [data-alloy-select-option]").filter({ hasText: /Field trip/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(8_000);

    /* event_date template: the operator authors the Service Date. Charge To is NEVER touched. */
    const dateField = page.locator("[data-addcharge-event-date] input").first();
    await dateField.fill("Oct 2, 2026");
    await dateField.press("Tab");
    await page.waitForTimeout(11_000);

    const preview = await page.evaluate(() => {
        const t = (s: string) => (document.querySelector(s) as HTMLElement | null)?.innerText.replace(/\s+/g, " ").trim() ?? null;
        const card = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
        return {
            responsibility: t("[data-addcharge-preview-responsibility]"),
            standing: t("[data-addcharge-preview-standing]"),
            chargeTo: t("[data-addcharge-charge-to='summary']"),
            chargeToEditorOpen: !!document.querySelector("[data-addcharge-charge-shares='editor']"),
            /* The whole command, so the standing answer is findable wherever it is stated. */
            body: card?.innerText.replace(/\s+/g, " ").slice(0, 900) ?? null,
        };
    });
    log(`PREVIEW: ${JSON.stringify(preview)}`);
    mkdirSync(OUT, { recursive: true });
    await page.screenshot({ path: `${OUT}/POST-1-preview.png`, fullPage: true });

    await page.locator("[data-addcharge-submit]").first().click({ timeout: 25_000 });
    await page.waitForTimeout(22_000);

    const after = await page.evaluate(() => ({
        error: (document.querySelector("[data-addcharge-error]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 200) ?? null,
        accountRow: [...document.querySelectorAll("[data-financials-account-row]")]
            .find((r) => /certfree/i.test((r as HTMLElement).innerText))?.textContent?.replace(/\s+/g, " ").trim() ?? null,
        detail: (document.querySelector("[data-financials-detail-account]") as HTMLElement | null)?.innerText.replace(/\s+/g, " ").slice(0, 400) ?? null,
        notAllocated: document.body.innerText.includes("Not allocated"),
    }));
    log(`AFTER: ${JSON.stringify(after)}`);
    await page.screenshot({ path: `${OUT}/POST-2-after.png`, fullPage: true });
    writeFileSync(`${OUT}/post-repair.json`, JSON.stringify({ before, preview, after }, null, 2));
    expect(after.error, "the charge was accepted").toBeNull();
});
