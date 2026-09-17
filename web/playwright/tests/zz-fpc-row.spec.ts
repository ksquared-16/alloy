/**
 * FOCUS PANEL CONVERGENCE — WHERE DOES THE ROW STRETCH STOP?
 *
 * The row rhythm is already declared for every mode including work: the grid is `align-items:
 * stretch`, each cell is a flex container and each cell child is `width: 100%`. Yet Process ends
 * short of Financials and leaves a dead band. So the question is not whether the rule exists but
 * which box in the chain — grid area, cell, intrinsic wrapper, card — stops inheriting the row
 * height. This reports every box in that chain for the top row.
 */
import { test, type Page } from "@playwright/test";

const STORAGE = "/Users/vacilando/.local/state/alloy-dev/gateway/auth/slot2/storage-state.json";
const BASE = "http://127.0.0.1:3012";
const LANE = "/workspace/work-unit/enrolled-children";
const SUBJECT = "b5b62172-8b27-44ff-a852-b11b8888a6cd";
const log = (s: string) => console.log(s); // eslint-disable-line no-console

test.use({ storageState: STORAGE, baseURL: BASE, viewport: { width: 1680, height: 1050 } });
test.setTimeout(600_000);

const rows = (p: Page) => p.evaluate(() => {
    const out: Array<Record<string, unknown>> = [];
    for (const card of Array.from(document.querySelectorAll("[data-universal-card-key]"))) {
        const el = card as HTMLElement;
        const key = el.getAttribute("data-universal-card-key");
        if (!key) continue;
        const cell = el.closest(".alloy-os-focus-panel-grid__cell") as HTMLElement | null;
        const area = el.closest("[data-fp-grid-area]") as HTMLElement | null;
        const intrinsic = el.closest(".alloy-os-fp-card-intrinsic") as HTMLElement | null;
        const r = el.getBoundingClientRect();
        if (r.height === 0) continue;
        out.push({
            key,
            top: Math.round(r.y),
            card: Math.round(r.height),
            intrinsic: intrinsic ? Math.round(intrinsic.getBoundingClientRect().height) : null,
            cell: cell ? Math.round(cell.getBoundingClientRect().height) : null,
            area: area ? Math.round(area.getBoundingClientRect().height) : null,
            cellAlign: cell ? getComputedStyle(cell).alignItems : null,
            cardAlignSelf: getComputedStyle(el).alignSelf,
            cardHeightStyle: getComputedStyle(el).height,
            areaPos: area ? getComputedStyle(area).position : null,
        });
    }
    const grid = document.querySelector(".alloy-os-focus-panel-grid") as HTMLElement | null;
    return {
        gridAlign: grid ? getComputedStyle(grid).alignItems : null,
        gridDisplay: grid ? getComputedStyle(grid).display : null,
        gridClass: grid?.className?.toString().slice(0, 70) ?? null,
        cards: out.sort((a, b) => (a.top as number) - (b.top as number)),
    };
});

test("top row boxes", async ({ page }) => {
    await page.goto(`${LANE}?subject_id=${SUBJECT}`);
    await page.waitForLoadState("domcontentloaded");
    await page.locator('[data-financials-card="true"]').first().waitFor({ state: "visible", timeout: 180_000 });
    await page.waitForTimeout(9_000);
    for (const w of [1680, 1280]) {
        await page.setViewportSize({ width: w, height: 1000 });
        await page.waitForTimeout(2_500);
        log(`ROWBOXES_${w} ` + JSON.stringify(await rows(page), null, 1));
    }
});
