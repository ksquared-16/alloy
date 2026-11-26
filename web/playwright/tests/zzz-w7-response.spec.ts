/** §3: capture the charge.add response verbatim, so the key the card must read is not guessed. */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(1_800_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("the charge.add response, verbatim", async ({ page }) => {
    const bodies: unknown[] = [];
    page.on("response", async (r) => {
        if (!/actions\/execute/.test(r.url())) return;
        try {
            const j = await r.json();
            bodies.push({ status: r.status(), topKeys: Object.keys(j as object), body: JSON.stringify(j).slice(0, 700) });
        } catch { /* streamed */ }
    });
    for (let a = 1; a <= 2; a++) {
        await page.goto(ENTRY, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
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
    await page.locator(".alloy-os-fdetail__actions button", { hasText: /^Add$/ }).first().click({ timeout: 25_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6_000);
    const sel = page.locator("[data-testid='addcharge-template']").first();
    await sel.click({ timeout: 20_000 });
    await page.waitForTimeout(1_500);
    await page.locator("[role='option'], [data-alloy-select-option]").filter({ hasText: /Field trip/ }).first().click({ timeout: 20_000 });
    await page.waitForTimeout(8_000);
    const d = page.locator("[data-addcharge-event-date] input").first();
    await d.fill("Oct 4, 2026"); await d.press("Tab");
    await page.waitForTimeout(10_000);
    bodies.length = 0;
    await page.locator("[data-addcharge-submit]").first().click({ timeout: 25_000 });
    await page.waitForTimeout(22_000);
    log(`EXECUTE RESPONSES: ${JSON.stringify(bodies, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/charge-add-response.json`, JSON.stringify(bodies, null, 2));
    expect(bodies.length).toBeGreaterThan(0);
});
