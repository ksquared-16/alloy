/**
 * The compact Financials card after the height repair: no scheduled footer, Details on the command
 * row, and the past-due verdict said once without clipping.
 */
import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const OUT = "../certification/financials/11b-setup";
test.use({ storageState: STORAGE, baseURL: process.env.QA_BASE_URL || "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test("compact card height and phrasing", async ({ page }) => {
    mkdirSync(OUT, { recursive: true });
    await page.goto("/workspace/work-unit/enrolled-children", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(18_000);
    // The phrasing repair only shows on an account that IS past due — find one.
    const rows = page.locator("[data-work-row], [role='row'], li");
    const n = Math.min(await rows.count(), 14);
    for (let i = 0; i < n; i += 1) {
        const has = await page.evaluate(() =>
            Boolean(document.querySelector("[data-universal-card-key='financials'] [data-financials-pastdue]")));
        if (has) break;
        await rows.nth(i).click({ timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(5500);
    }
    const card = page.locator("[data-universal-card-key='financials']").first();
    log(`financials cards: ${await card.count()}`);
    const out = await page.evaluate(() => {
        const el = document.querySelector("[data-universal-card-key='financials']") as HTMLElement | null;
        if (!el) return { found: false } as Record<string, unknown>;
        const age = el.querySelector("[data-financials-pastdue]") as HTMLElement | null;
        const details = el.querySelector("[data-financials-nav='details']") as HTMLElement | null;
        const pay = el.querySelector("[data-financials-command='payment']") as HTMLElement | null;
        const r = (n: Element | null) => (n ? n.getBoundingClientRect() : null);
        const dr = r(details); const pr = r(pay);
        return {
            found: true,
            cardHeight: Math.round(el.getBoundingClientRect().height),
            text: (el.innerText || "").replace(/\n+/g, " / "),
            saysScheduled: /scheduled this period/i.test(el.innerText || ""),
            pastDueText: age?.innerText ?? null,
            /* Clipping is measurable: the text overflows the box it is drawn in. */
            pastDueClipped: age ? age.scrollWidth > age.clientWidth + 1 : null,
            detailsTop: dr ? Math.round(dr.top) : null,
            paymentTop: pr ? Math.round(pr.top) : null,
            detailsSharesCommandRow: dr && pr ? Math.abs(dr.top + dr.height / 2 - (pr.top + pr.height / 2)) < 10 : null,
            detailsRightOfPayment: dr && pr ? dr.left > pr.right : null,
        };
    });
    log(JSON.stringify(out, null, 1));
    if (await card.count()) await card.screenshot({ path: `${OUT}/compact-card-after.png` });
    writeFileSync(`${OUT}/compact-card.json`, JSON.stringify(out, null, 2));
});
