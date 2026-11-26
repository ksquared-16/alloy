/**
 * AUTHORED IN /surfaces, DRAWN IN /work-unit — the same composition, measured on both.
 *
 * The unit tests hold the planner's contract. This holds the thing the contract exists for:
 * open the Focus Panel builder, read the geometry it draws; open the Work Unit the published
 * Surface is assigned to, read the geometry IT draws; and require them to agree card for card.
 *
 * It is the check that would have caught the defect it was written for. The builder rendered
 * `published-grid` while the Work Unit rendered `published-lanes`, so one published document —
 * Financials authored `colStart 7, colSpan 2` — was drawn 165px in the builder and 554px in the
 * Work Unit. Both surfaces expose their plan on the grid element, so the disagreement is
 * readable without screenshots.
 *
 * Needs an authenticated session and a running server:
 *   PLAYWRIGHT_BASE_URL=http://127.0.0.1:<port> \
 *   PLAYWRIGHT_STORAGE_STATE=<slot storage-state.json> \
 *   npx playwright test playwright/tests/focus-panel-surface-parity.spec.ts
 */

import { test, expect, type Page } from "@playwright/test";

test.use({ viewport: { width: 1680, height: 1050 } });
test.setTimeout(300_000);

type Placement = { card: string; col: string; units: string | undefined; ratio: number };

/**
 * The panel's plan and its placements, read off the DOM.
 *
 * Widths are compared as a RATIO of the panel, never in pixels: the builder canvas and the Work
 * Unit panel are legitimately different widths, and a card that is two twelfths of one must be
 * two twelfths of the other.
 */
async function readPanel(page: Page): Promise<{ strategy: string | null; placements: Placement[] }> {
    await page.locator('[data-focus-panel-card-grid="true"]').first()
        .waitFor({ state: "visible", timeout: 120_000 });
    // Cards resolve asynchronously and the column-aware stack re-measures as they land.
    await page.waitForTimeout(6000);
    return page.evaluate(() => {
        const el = document.querySelector('[data-focus-panel-card-grid="true"]') as HTMLElement;
        const canvas = el.querySelector(".alloy-os-fp-canvas") as HTMLElement | null;
        const width = (canvas ?? el).getBoundingClientRect().width;
        const placements = [...el.querySelectorAll("[data-fp-grid-area]")].map((a) => {
            const cell = a.querySelector("[data-focus-panel-grid-cell]") as HTMLElement | null;
            return {
                card: (a as HTMLElement).dataset.fpGridArea!,
                col: (a as HTMLElement).dataset.fpGridCol!,
                units: cell?.dataset.fpWidthUnits,
                ratio: Math.round(((cell ?? (a as HTMLElement)).getBoundingClientRect().width / width) * 100) / 100,
            };
        }).sort((x, y) => x.card.localeCompare(y.card));
        return { strategy: el.getAttribute("data-fp-render-strategy"), placements };
    });
}

test("the Focus Panel the operator authored is the Focus Panel the operator gets", async ({ page }) => {
    await page.goto("/adminV2/settings/organization/surfaces?section=focus-panels", {
        waitUntil: "domcontentloaded", timeout: 120_000,
    });
    await page.getByText("Enrollment Focus Panel").first().click();
    const builder = await readPanel(page);

    await page.goto("/workspace/work-unit/all", { waitUntil: "domcontentloaded", timeout: 120_000 });
    const runtime = await readPanel(page);

    // One document, one reading of it.
    expect(runtime.strategy).toBe(builder.strategy);
    expect(builder.strategy).toBe("published-grid");

    // Column, span and identity, card for card. (The Work Unit may omit a card the builder shows
    // — visibility is resolved per subject — so parity is asserted over the cards they share.)
    const shared = builder.placements.filter((b) => runtime.placements.some((r) => r.card === b.card));
    expect(shared.length).toBeGreaterThan(2);
    for (const b of shared) {
        const r = runtime.placements.find((p) => p.card === b.card)!;
        expect(r.col, `${b.card} column/span`).toBe(b.col);
        expect(r.units, `${b.card} rendered width units`).toBe(b.units);
        expect(Math.abs(r.ratio - b.ratio), `${b.card} share of the panel`).toBeLessThanOrEqual(0.03);
    }
});
