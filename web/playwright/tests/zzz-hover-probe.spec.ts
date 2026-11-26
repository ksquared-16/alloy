/** Does pointer intent issue a card read at all? No clicking. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const SEL = "[data-financials-account-row][data-financials-account-selected='true']";

test("hover issues a card read, without selecting", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("workspace never mounted");
    }
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 });
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-account-row]").length > 1, undefined, { timeout: 180_000 });
    await page.waitForTimeout(6_000);

    const rows = page.locator("[data-financials-account-row]");
    const before = await page.evaluate((s) => document.querySelector(s)?.getAttribute("data-financials-account-row") ?? null, SEL);

    const seen: string[] = [];
    page.on("request", (r) => {
        const u = r.url();
        if (u.indexOf("/api/admin/financials/card?") >= 0) seen.push(u.slice(u.indexOf("/api/")));
    });

    const target = await rows.nth(5).getAttribute("data-financials-account-row");
    log(`selected before hover: ${before} hovering: ${target}`);
    await rows.nth(5).hover();
    await page.waitForTimeout(3_000);

    const after = await page.evaluate((s) => document.querySelector(s)?.getAttribute("data-financials-account-row") ?? null, SEL);
    log(`CARD REQUESTS DURING HOVER: ${seen.length}`);
    for (const s of seen) log(`   ${s}`);
    log(`HOVERED ACCOUNT REQUESTED: ${seen.some((s) => s.indexOf(target ?? "zzz") >= 0)}`);
    log(`SELECTION UNCHANGED: ${before === after}`);
    expect(after, "hover must never select").toBe(before);
});
