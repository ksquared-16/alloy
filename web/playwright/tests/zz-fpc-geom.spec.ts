import { test, type Page } from "@playwright/test";
const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const log = (s: string) => console.log(s); // eslint-disable-line no-console
test.use({ storageState: STORAGE, baseURL: "http://127.0.0.1:3012", viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

/** Which box decides the focused card's height, before and after the ledger arrives? */
const chain = (p: Page) => p.evaluate(() => {
    const host = document.querySelector('[data-financials-overlay="detail"]') as HTMLElement | null;
    const card = host?.querySelector(".alloy-os-ucard") as HTMLElement | null;
    const cell = host?.closest('[data-fp-elevated="true"]') as HTMLElement | null;
    const area = host?.closest("[data-fp-grid-area]") as HTMLElement | null;
    const scroll = document.querySelector("[data-financials-detail-scroll]") as HTMLElement | null;
    const body = card?.querySelector(".alloy-os-ucard__body") as HTMLElement | null;
    const box = (el: Element | null) => { const r = el?.getBoundingClientRect(); return r ? `${Math.round(r.width)}x${Math.round(r.height)}` : null; };
    return {
        area: box(area), cell: box(cell), card: box(card), cardBody: box(body), scrollRegion: box(scroll),
        cellHeightCss: cell ? getComputedStyle(cell).height : null,
        cardHeightCss: card ? getComputedStyle(card).height : null,
        cardMaxH: card ? getComputedStyle(card).maxHeight : null,
        bodyOverflow: body ? getComputedStyle(body).overflowY : null,
        scrollOverflow: scroll ? getComputedStyle(scroll).overflowY : null,
        scrollH: scroll ? scroll.scrollHeight : null,
    };
});

test("focused geometry chain", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    await page.locator('[data-financials-nav="details"]').first().click({ timeout: 20_000 });
    await page.locator('[data-financials-overlay="detail"]').waitFor({ state: "visible", timeout: 60_000 });
    await page.waitForTimeout(400);
    log("CHAIN_AT_COMMIT " + JSON.stringify(await chain(page), null, 1));
    await page.waitForFunction(() => document.querySelectorAll("[data-financials-ledger-row]").length > 10, undefined, { timeout: 120_000 });
    await page.waitForTimeout(1_500);
    log("CHAIN_AFTER " + JSON.stringify(await chain(page), null, 1));
});
