/** The taller preview must not push the primary action out of reach. */
import { expect, test, type Page } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/deployed/alloy_staging_web/storage-state.json";
const OUT = "../certification/financials/sign-repair";
test.use({ storageState: STORAGE, baseURL: "https://staging.workwithalloy.com" });
test.describe.configure({ mode: "serial" });
test.setTimeout(1_200_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console
const out: Record<string, unknown>[] = [];
async function drive(page: Page) {
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(13_000);
    expect(page.url()).not.toContain("/login");
    await page.locator("[data-adminv2-sidebar-modal-nav='financials']").first().click({ force: true, timeout: 20_000 });
    await page.waitForTimeout(11_000);
    await page.locator("[data-workspace-section-tab='accounts']").first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-detail='true']")).toHaveCount(1, { timeout: 120_000 });
    await page.waitForTimeout(9000);
    await page.getByRole("button", { name: /^Add$/ }).first().click({ timeout: 20_000 });
    await expect(page.locator("[data-financials-overlay='add_charge']")).toHaveCount(1, { timeout: 60_000 });
    await page.waitForTimeout(6000);
    for (const [trig, opt] of [[/^Household/, /Certa Certhouse/], [/^Field trip/, /Monthly tuition/]] as const) {
        const t = page.locator("[data-financials-overlay='add_charge'] button").filter({ hasText: trig }).first();
        if (await t.count()) {
            await t.click({ timeout: 20_000 });
            await page.waitForTimeout(2500);
            const o = page.locator("[role='option']").filter({ hasText: opt }).first();
            if (await o.count()) { await o.click({ timeout: 20_000 }); await page.waitForTimeout(7000); }
            else await page.keyboard.press("Escape");
        }
    }
}
for (const width of [1280, 1440, 1680]) {
    test(`primary action reachable at ${width}`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        await drive(page);
        const r = await page.evaluate(() => {
            const root = document.querySelector("[data-financials-overlay='add_charge']") as HTMLElement | null;
            const primary = Array.from(root?.querySelectorAll("button") ?? []).find((b) => /^add charge$/i.test((b.textContent || "").trim()));
            const rr = root?.getBoundingClientRect();
            const pr = primary?.getBoundingClientRect();
            return {
                viewport: window.innerWidth,
                cardBottom: rr ? Math.round(rr.bottom) : null,
                viewportHeight: window.innerHeight,
                cardScrolls: root ? root.scrollHeight > root.clientHeight + 2 : null,
                primaryFound: Boolean(primary),
                primaryBottom: pr ? Math.round(pr.bottom) : null,
                primaryInViewport: pr ? pr.bottom <= window.innerHeight + 1 && pr.top >= -1 : null,
            };
        });
        log(`@${width} ${JSON.stringify(r)}`);
        out.push(r);
        mkdirSync(OUT, { recursive: true });
        writeFileSync(`${OUT}/reachability.json`, JSON.stringify(out, null, 2));
        expect(r.primaryFound, "the primary action exists").toBe(true);
        /* Either it is on screen, or the layer scrolls to it — the documented bound. */
        expect(r.primaryInViewport || r.cardScrolls, "the primary action is reachable").toBe(true);
    });
}
