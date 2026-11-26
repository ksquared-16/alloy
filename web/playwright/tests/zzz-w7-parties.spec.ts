/** How many responsible parties does each disposable account actually offer? */
import { expect, test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/w7-repair-1/responsibility";
const ENTRY = "/workspace/work-unit/enrolled-children";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("count the responsible parties", async ({ page }) => {
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

    const ids = await page.evaluate(() =>
        [...document.querySelectorAll("[data-financials-account-row]")]
            .map((r) => ({ id: r.getAttribute("data-financials-account-row"), label: (r as HTMLElement).innerText.replace(/\s+/g, " ").slice(0, 40) }))
            .filter((r) => /demo|automation|certfree|certopp|chen/i.test(r.label) && !/certhouse|alvarez/i.test(r.label)));

    const out: Record<string, unknown>[] = [];
    for (const c of ids) {
        await page.locator(`[data-financials-account-row="${c.id}"]`).first().click({ timeout: 30_000 });
        await page.waitForTimeout(6_000);
        const gear = page.locator("[data-financials-manage-responsibility='gear'], [data-financials-manage-responsibility='open']").first();
        if (await gear.count() === 0) continue;
        await gear.click({ timeout: 25_000 });
        await page.waitForTimeout(5_000);
        const r = await page.evaluate(() => {
            const card = document.querySelector("[data-financials-overlay='responsibility_admin'], [data-financials-entry='responsibility_admin']") as HTMLElement | null;
            const text = card?.innerText ?? "";
            /* Each party row carries a share control; count the share inputs, and read the names. */
            const shareInputs = document.querySelectorAll("[data-financials-responsibility-share] input, [data-financials-responsibility-share]").length;
            const section = text.slice(text.indexOf("RESPONSIBLE PARTIES"));
            return {
                shareControls: shareInputs,
                partiesBlock: section.replace(/\s+/g, " ").slice(0, 400),
                fullLen: text.length,
            };
        });
        log(`${c.label} | shareControls=${r.shareControls} | ${r.partiesBlock}`);
        out.push({ ...c, ...r });
        const close = page.locator("[data-financials-responsibility-done], [data-financials-responsibility-cancel]").first();
        if (await close.count()) await close.click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(2_500);
    }
    mkdirSync(OUT, { recursive: true });
    writeFileSync(`${OUT}/parties.json`, JSON.stringify(out, null, 2));
    expect(out.length).toBeGreaterThan(0);
});
