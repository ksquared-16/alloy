/**
 * The two commands: equal width, proportional to the card, and on one baseline.
 */
import { expect, test } from "@playwright/test";
import { mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const OUT = "../certification/financials";
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3112", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

test("command geometry", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    for (const w of [1680, 1440, 1280]) {
        await page.setViewportSize({ width: w, height: 1050 });
        await page.waitForTimeout(2_500);
        const m = await page.evaluate(() => {
            const card = document.querySelector(".alloy-os-billing") as HTMLElement | null;
            const cr = card?.getBoundingClientRect();
            const pick = (sel: string) => {
                const el = document.querySelector(sel) as HTMLElement | null;
                const r = el?.getBoundingClientRect();
                return r ? { y: Math.round(r.y), h: Math.round(r.height), w: Math.round(r.width), right: Math.round(r.right) } : null;
            };
            const pay = pick('[data-financials-command="payment"]');
            const add = pick('[data-financials-command="add"]');
            const det = pick('[data-financials-nav="details"]');
            return {
                cardW: cr ? Math.round(cr.width) : null,
                cardH: cr ? Math.round(cr.height) : null,
                payment: pay, add, details: det,
                shareOfCard: pay && cr ? Math.round((pay.w / cr.width) * 100) : null,
            };
        });
        log(`CMD_${w} ` + JSON.stringify(m));
        await page.screenshot({ path: `${OUT}/cv-compact-${w}.png` });
        if (m.payment && m.add) {
            expect(m.payment.y, `same y at ${w}`).toBe(m.add.y);
            expect(m.payment.h, `same height at ${w}`).toBe(m.add.h);
            expect(m.payment.w, `same width at ${w}`).toBe(m.add.w);
            expect(m.shareOfCard!, `not a banner at ${w}`).toBeLessThan(40);
        }
    }
});
