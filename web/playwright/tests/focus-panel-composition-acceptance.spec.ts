/**
 * FOCUS PANEL COMPOSITION — browser acceptance against the real published Surface.
 *
 * Everything here is read from RENDERED RECTANGLES, not from the model that produced them,
 * because the defects being closed were all cases where the model was right and the geometry
 * on screen was not.
 *
 * Requires an authenticated lane session against the slot's own server; run with
 * PLAYWRIGHT_BASE_URL=http://127.0.0.1:3016 and the QA storage state.
 */

import { expect, test, type Page } from "@playwright/test";

const SUBJECT = process.env.FP_SUBJECT_ID ?? "d2a3b448-296e-43e7-b0a8-28dd918526ac";
const WORK_UNIT = `/workspace/work-unit/waitlist?subject_id=${SUBJECT}`;
const GUTTER = 10;
/** Sub-pixel tolerance: rects are fractional, the engine rounds to whole pixels. */
const EPS = 1.5;

type Rect = { card: string; left: number; top: number; width: number; height: number };

async function cardRects(page: Page): Promise<Rect[]> {
    return page.$$eval("[data-fp-grid-area]", (nodes) =>
        nodes.map((n) => {
            const r = n.getBoundingClientRect();
            return {
                card: n.getAttribute("data-fp-grid-area") ?? "",
                left: r.left, top: r.top, width: r.width, height: r.height,
            };
        }),
    );
}

/** The authored column span, read off the DOM so the test never restates the layout. */
async function columns(page: Page): Promise<Record<string, { start: number; span: number }>> {
    const raw = await page.$$eval("[data-fp-grid-area]", (nodes) =>
        nodes.map((n) => [
            n.getAttribute("data-fp-grid-area") ?? "",
            n.getAttribute("data-fp-grid-col") ?? "",
        ]),
    );
    return Object.fromEntries(
        raw.map(([card, col]) => {
            const [start, span] = col.split("/").map(Number);
            return [card, { start: start ?? 1, span: span ?? 1 }];
        }),
    );
}

const overlapH = (a: { start: number; span: number }, b: { start: number; span: number }) =>
    a.start < b.start + b.span && b.start < a.start + a.span;

/**
 * Wait for the composition to SETTLE, not merely to appear.
 *
 * Cards resolve asynchronously and each arrival re-flows the column beneath it, so a fixed
 * pause measures whichever half-loaded frame it happens to land on. Poll the rectangles
 * until they stop moving — which also proves the layout converges rather than oscillating.
 */
async function openFocusPanel(page: Page) {
    await page.goto(WORK_UNIT, { waitUntil: "domcontentloaded" });
    await page.waitForSelector('[data-fp-strategy="published-grid"]', { timeout: 60_000 });
    let last = "";
    let stable = 0;
    for (let i = 0; i < 60 && stable < 4; i += 1) {
        await page.waitForTimeout(500);
        const now = JSON.stringify(await cardRects(page));
        if (now === last) stable += 1;
        else { stable = 0; last = now; }
    }
    expect(stable, "layout settled").toBeGreaterThanOrEqual(4);
}

test.describe("card layout — width authored, height content-driven", () => {
    test("no card overlaps another that shares its columns", async ({ page }) => {
        await openFocusPanel(page);
        const rects = await cardRects(page);
        const cols = await columns(page);
        expect(rects.length).toBeGreaterThan(1);
        for (const a of rects) {
            for (const b of rects) {
                if (a.card === b.card) continue;
                if (!overlapH(cols[a.card]!, cols[b.card]!)) continue;
                const clear = a.top + a.height <= b.top + EPS || b.top + b.height <= a.top + EPS;
                expect(clear, `${a.card} overlaps ${b.card}`).toBe(true);
            }
        }
        await page.screenshot({ path: "test-results/fp-composition-layout.png", fullPage: true });
    });

    test("each card sits one gutter below its lowest overlapping predecessor", async ({ page }) => {
        await openFocusPanel(page);
        const rects = await cardRects(page);
        const cols = await columns(page);
        const byTop = [...rects].sort((a, b) => a.top - b.top || a.left - b.left);
        for (const me of byTop) {
            const priors = byTop.filter(
                (p) => p.card !== me.card && p.top < me.top - EPS && overlapH(cols[p.card]!, cols[me.card]!),
            );
            if (priors.length === 0) continue;
            const required = Math.max(...priors.map((p) => p.top + p.height)) + GUTTER;
            expect(Math.abs(me.top - required), `${me.card} gap`).toBeLessThanOrEqual(EPS);
        }
    });

    test("Health stacks under Attendance, not under the right-hand column", async ({ page }) => {
        await openFocusPanel(page);
        const rects = await cardRects(page);
        const cols = await columns(page);
        const attendance = rects.find((r) => r.card === "attendance");
        const health = rects.find((r) => r.card === "health_safety");
        test.skip(!attendance || !health, "this Surface does not place both cards");
        expect(overlapH(cols.attendance!, cols.health_safety!)).toBe(true);
        expect(Math.abs(health!.top - (attendance!.top + attendance!.height + GUTTER))).toBeLessThanOrEqual(EPS);
    });
});

test.describe("an expanded detail does not wear the card's column", () => {
    /**
     * Each card's offset FROM THE CANVAS, so we can prove the panel underneath did not move.
     *
     * Relative, not viewport-relative: raising a card scrolls the panel to bring it into
     * view, which shifts every viewport coordinate by the same amount. That is the surface
     * being revealed, not the layout reflowing.
     */
    async function tops(page: Page) {
        const canvas = await page.locator('[data-fp-strategy="published-grid"]').boundingBox();
        return Object.fromEntries((await cardRects(page)).map((r) => [r.card, r.top - (canvas?.y ?? 0)]));
    }

    /**
     * The platform's width for each modal class, and the inset it keeps from the canvas edge.
     * The surface takes its class width, or the canvas minus that inset when the canvas is
     * narrower — never anything derived from the card it was launched from.
     */
    const CANVAS_INSET = 32;
    for (const [label, trigger, modal, platformWidth] of [
        ["Add charge", "Add charge", "command", 560],
        ["Details", "Details", "workstation", 1180],
    ] as const) {
        test(`${label} opens centered on the canvas, not over Financials`, async ({ page }) => {
            await openFocusPanel(page);
            const before = await tops(page);
            const financials = (await cardRects(page)).find((r) => r.card === "financials");
            test.skip(!financials, "Financials is not placed on this Surface");

            const canvas = await page.locator('[data-fp-strategy="published-grid"]').boundingBox();
            // Scoped to the Financials card so we launch from the card under test, and forced
            // because the floating BOS rail overlays the panel in this environment — unrelated
            // chrome, not the geometry being certified.
            const launch = page
                .locator('[data-fp-grid-area="financials"]')
                .getByRole("button", { name: new RegExp(`^${trigger}`, "i") })
                .first();
            await launch.waitFor({ state: "visible", timeout: 30_000 });
            // Dispatched on the node itself: the floating BOS rail overlays the panel in this
            // environment, so a positional click lands on the rail. The geometry under test is
            // what the surface does once open, not how the pointer reached it.
            await launch.evaluate((el: HTMLElement) => el.click());
            await page.waitForSelector(`.alloy-os-ucard[data-universal-card-modal="${modal}"]`, { timeout: 20_000 });
            await page.waitForTimeout(800);

            const raised = await page
                .locator(`.alloy-os-ucard[data-universal-card-modal="${modal}"]`)
                .first()
                .boundingBox();
            expect(raised, "raised surface has a box").toBeTruthy();

            // 1 · It takes the PLATFORM width for its class, not the card's.
            const expected = Math.min(platformWidth, canvas!.width - CANVAS_INSET);
            expect(Math.abs(raised!.width - expected), `${modal} takes its platform width`).toBeLessThan(2);
            expect(raised!.width).toBeGreaterThan(financials!.width + 40);

            // 2 · It is centered on the canvas, not on the Financials column.
            const canvasMid = canvas!.x + canvas!.width / 2;
            const raisedMid = raised!.x + raised!.width / 2;
            expect(Math.abs(raisedMid - canvasMid), "centered on the canvas").toBeLessThan(24);
            const financialsMid = financials!.left + financials!.width / 2;
            expect(Math.abs(raisedMid - financialsMid), "not centered on the card").toBeGreaterThan(24);

            await page.screenshot({ path: `test-results/fp-${modal}-surface.png`, fullPage: false });

            // 3 · Nothing underneath moved.
            const during = await tops(page);
            for (const [card, top] of Object.entries(before)) {
                if (card === "financials") continue; // the raised card itself lifts out
                expect(Math.abs((during[card] ?? top) - top), `${card} moved while ${label} was open`)
                    .toBeLessThanOrEqual(EPS);
            }

            // 4 · Closing returns the panel exactly as it was.
            await page.locator('[data-fp-depth-scrim="true"]').first().evaluate((el: HTMLElement) => el.click());
            await page.waitForTimeout(1200);
            const after = await tops(page);
            for (const [card, top] of Object.entries(before)) {
                expect(Math.abs((after[card] ?? top) - top), `${card} moved after closing ${label}`)
                    .toBeLessThanOrEqual(EPS);
            }
        });
    }
});
