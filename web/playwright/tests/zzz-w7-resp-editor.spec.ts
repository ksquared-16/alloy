/**
 * Probe the responsibility editor's controls on the chosen disposable fixture, read-only.
 * Nothing is confirmed here — this only learns what the share-mode control offers so the
 * arrangement can be configured deliberately rather than by guessing at a custom select.
 */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("what the responsibility editor offers on Certfree", async ({ page }) => {
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
    log(`CERTFREE id=${id}`);
    expect(id, "the disposable fixture is present").not.toBeNull();
    await page.locator(`[data-financials-account-row="${id}"]`).first().click({ timeout: 30_000 });
    await page.waitForTimeout(6_000);

    await page.locator("[data-financials-manage-responsibility='gear'], [data-financials-manage-responsibility='open']")
        .first().click({ timeout: 25_000 });
    await page.waitForTimeout(5_000);

    const controls = await page.evaluate(() => {
        const card = document.querySelector("[data-financials-overlay='responsibility_admin'], [data-financials-entry='responsibility_admin']") as HTMLElement | null;
        const selects = [...document.querySelectorAll("[data-alloy-select], [data-testid^='alloy-select'], [role='combobox']")]
            .map((e) => ({ testid: e.getAttribute("data-testid"), text: (e as HTMLElement).innerText.replace(/\s+/g, " ").trim().slice(0, 50) }));
        const inputs = [...document.querySelectorAll("input")]
            .map((e) => ({ type: e.type, placeholder: e.placeholder, value: e.value, id: e.id, name: e.name })).slice(0, 10);
        return {
            scope: document.querySelector("[data-financials-arrangement-scope]")?.getAttribute("data-financials-arrangement-scope") ?? null,
            mode: document.querySelector("[data-financials-responsibility-mode]")?.getAttribute("data-financials-responsibility-mode") ?? null,
            selects, inputs,
            buttons: [...document.querySelectorAll("button")].map((b) => (b as HTMLElement).innerText.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 14),
            body: card?.innerText.replace(/\s+/g, " ").slice(0, 500) ?? null,
        };
    });
    log(`CONTROLS: ${JSON.stringify(controls, null, 1)}`);
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/certfree-editor.json`, JSON.stringify(controls, null, 2));
    await page.screenshot({ path: `${OUT}/certfree-editor.png`, fullPage: true });
    expect(true).toBe(true);
});
