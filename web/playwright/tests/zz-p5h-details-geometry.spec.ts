/**
 * §3 — WHAT ACTUALLY GROWS WHEN THE LEDGER ARRIVES.
 *
 * The sequence recorded the overlay root at 52px and then 84px while the ledger went 42 → 95 rows.
 * A 52px root around 42 rows is not the visible shell, so before anything is "fixed" this measures
 * every candidate box on the way down — the grid area, the intrinsic card wrapper, the overlay
 * root, the detail card, and the scroll container that is supposed to own the ledger's overflow —
 * at the first committed frame and again once hydrated. The one whose delta is non-zero is the one
 * that shifts under the operator.
 */
import { expect, test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";

test.use({ storageState: STORAGE, baseURL: BASE });

const boxes = (page: Page) =>
    page.evaluate(() => {
        const of = (sel: string) => {
            const el = document.querySelector(sel) as HTMLElement | null;
            if (!el) return null;
            const r = el.getBoundingClientRect();
            const cs = getComputedStyle(el);
            return {
                h: Math.round(r.height),
                w: Math.round(r.width),
                scrollH: el.scrollHeight,
                clientH: el.clientHeight,
                overflowY: cs.overflowY,
                position: cs.position,
            };
        };
        const overlay = document.querySelector('[data-financials-overlay="detail"]') as HTMLElement | null;
        return {
            rows: document.querySelectorAll("[data-financials-ledger-row]").length,
            gridArea: of('[data-fp-grid-area="financials"]'),
            intrinsic: of('[data-fp-card-intrinsic="financials"]'),
            overlayRoot: of('[data-financials-overlay="detail"]'),
            overlayFirstChild:
                overlay && overlay.firstElementChild
                    ? {
                          cls: String((overlay.firstElementChild as HTMLElement).className).slice(0, 60),
                          h: Math.round(overlay.firstElementChild.getBoundingClientRect().height),
                      }
                    : null,
            detailScroll: of("[data-financials-detail-scroll]"),
            ledgerBand: of(".alloy-os-billingdetail__ledgerband"),
            universalCard: of('[data-universal-card-key="financials"]'),
        };
    });

test("the Details shell commits its structural height once", async ({ page }) => {
    test.setTimeout(600_000);
    await page.setViewportSize({ width: 1680, height: 1050 });
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    const card = page.locator('[data-financials-card="true"]').first();
    await expect(card).toBeVisible({ timeout: 180_000 });
    await page.waitForTimeout(8_000);

    await card.getByRole("button", { name: /^Details/ }).first().click({ timeout: 15_000 });
    await expect(page.locator('[data-financials-overlay="detail"]')).toBeVisible({ timeout: 30_000 });

    // FIRST COMMITTED FRAME — as soon as the shell exists, before waiting for anything.
    const first = await boxes(page);
    // eslint-disable-next-line no-console
    console.log("FIRST_FRAME " + JSON.stringify(first, null, 1));

    await page.waitForTimeout(20_000);
    const hydrated = await boxes(page);
    // eslint-disable-next-line no-console
    console.log("HYDRATED_FRAME " + JSON.stringify(hydrated, null, 1));

    const delta: Record<string, number | null> = {};
    for (const key of Object.keys(hydrated)) {
        const a = (first as Record<string, { h?: number } | number | null>)[key];
        const b = (hydrated as Record<string, { h?: number } | number | null>)[key];
        if (a && b && typeof a === "object" && typeof b === "object" && a.h != null && b.h != null) {
            delta[key] = b.h - a.h;
        }
    }
    // eslint-disable-next-line no-console
    console.log("STRUCTURAL_DELTA " + JSON.stringify(delta));
    await page.screenshot({ path: "/tmp/p5h-details-hydrated.png" });
});
