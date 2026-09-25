/** C and D, probed correctly: the site filter is a button, and Overview is a Financials tab. */
import { expect, test } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com", viewport: { width: 1440, height: 900 } });
test.setTimeout(900_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("C and D", async ({ page }) => {
    for (let a = 1; a <= 2; a++) {
        await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(13_000);
        const nav = page.locator("[data-adminv2-sidebar-modal-nav='financials']").first();
        if (await nav.count()) { await nav.click({ force: true, timeout: 20_000 }); break; }
        if (a === 2) throw new Error("no workspace");
    }
    await page.waitForTimeout(11_000);

    const tabs = await page.evaluate(() => [...document.querySelectorAll("[data-workspace-section-tab]")].map((t) => t.getAttribute("data-workspace-section-tab")));
    log(`FINANCIALS TABS: ${JSON.stringify(tabs)}`);

    await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(8_000);
    const ov = await page.evaluate(() => {
        const scope = document.querySelector("[data-financials-section], [data-workspace-section='overview']") ?? document.body;
        const t = (scope as HTMLElement).innerText.replace(/\s+/g, " ");
        return {
            money: (t.match(/\$[\d,]+\.\d\d/g) ?? []).slice(0, 8),
            zeros: (t.match(/\$0\.00/g) ?? []).length,
            needsDecision: /needs decision/i.test(t),
            bendPine: !!document.querySelector("[class*='bend-pine'], [class*='bendPine'], [data-tone='bend_pine']"),
            emptyish: /no data|unavailable|—/.test(t.slice(0, 400)),
            head: t.slice(0, 220),
        };
    });
    log(`D OVERVIEW: ${JSON.stringify(ov)}`);

    const btn = page.locator("button[aria-label='Site filter'], button[aria-label='Site']").first();
    const label0 = await btn.innerText().catch(() => null);
    await btn.click({ timeout: 20_000 }).catch(() => undefined);
    await page.waitForTimeout(1_200);
    const opts = await page.evaluate(() => [...document.querySelectorAll("[role='option'], [role='menuitem'], [role='menuitemradio']")].map((o) => (o as HTMLElement).innerText.trim()).filter(Boolean).slice(0, 8));
    log(`C OPTIONS: ${JSON.stringify(opts)} current=${JSON.stringify(label0)}`);
    if (opts.length > 1) {
        await page.locator("[role='option'], [role='menuitem'], [role='menuitemradio']").nth(1).click({ timeout: 15_000 }).catch(() => undefined);
        await page.waitForTimeout(4_000);
        const picked = await btn.innerText().catch(() => null);
        await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(4_000);
        await page.locator("[data-workspace-section-tab='overview']").first().click({ timeout: 30_000 }).catch(() => undefined);
        await page.waitForTimeout(4_000);
        const back = await btn.innerText().catch(() => null);
        log(`C PERSISTENCE picked=${JSON.stringify(picked)} afterNav=${JSON.stringify(back)} persisted=${picked === back}`);
    }
    expect(true).toBe(true);
});
