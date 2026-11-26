/**
 * BROWSER GEOMETRY CERTIFICATION — the Focus Panel's layout contract, measured.
 *
 * ── THE CONTRACT THIS FILE NOW CERTIFIES, AND THE ONE IT RETIRED ──
 *
 * It used to assert that cards sharing a "visual band" were drawn to a COMMON height:
 * `business_process bottom == financials bottom`, and a shorter card stretching to its
 * neighbour's height was the pass condition. That contract is gone, deliberately — see
 * `docs/platform/experience/focus-panel-card-format.md` §6.
 *
 * It was wrong for a canvas where operators compose arbitrary spans. Measured on deployed
 * `d0870c58c` at 1440:
 *
 *     business_process   content 227px   drawn 402px
 *     health_safety      content 178px   drawn 419px
 *
 * Health occupies columns 1-3. The 419px it was drawn at is the height of Household, in
 * columns 9-12 — a card it shares no column with. 410px of the panel was empty because
 * unrelated cards had been made to agree on a bottom edge.
 *
 * NOW: horizontal placement is authored, height is the card's own content, and a card waits
 * only for cards whose COLUMNS it overlaps. Side-by-side cards need not share a bottom.
 *
 * ── WHY A REAL BROWSER IS STILL REQUIRED ──
 *
 * Three implementations shipped green under unit certification and wrong in the product:
 * equalising on literal `rowStart`; assigning the measured wrapper its own solved height; and
 * the equalisation above, whose unit suite tested a solver that the runtime had every right to
 * stop consuming. jsdom computes no layout, so a geometry assertion there passes against any
 * implementation at all. This file measures rectangles.
 */

import { expect, test, type Page } from "@playwright/test";

import { loadFixture } from "./harness";

/** ≤1px, the rounding tolerance the frozen doctrine names. */
const TOLERANCE = 1;
/** Frames a settle may take. Convergence, not micro-performance — CI timing must not flake. */
const SETTLE_FRAME_BUDGET = 120;

const FIXTURE = "focusPanelGeometryFixture.tsx";
const STYLES = ["app/adminV2/components/alloyOsRuntime.css"];

type CardGeometry = {
    top: number;
    bottom: number;
    height: number;
    left: number;
    width: number;
    cardTop: number;
    cardBottom: number;
    cardHeight: number;
    overflow: number;
};

/** Load the fixture and wait for a measured settle — never a sleep. */
async function mount(page: Page, width: number): Promise<void> {
    const errors = await loadFixture(page, FIXTURE, STYLES, width);
    await page.waitForFunction(() => document.querySelectorAll("[data-fp-grid-area]").length > 0);
    const settled = await settle(page);
    expect(errors, "the fixture must mount without a page error").toEqual([]);
    expect(settled.settled, `layout did not settle within ${SETTLE_FRAME_BUDGET} frames`).toBe(true);
}

async function settle(page: Page): Promise<{ settled: boolean; frames: number }> {
    return page.evaluate((budget) => window.__fp.settle(budget), SETTLE_FRAME_BUDGET);
}

const geometry = (page: Page) => page.evaluate(() => window.__fp.geometry()) as Promise<Record<string, CardGeometry>>;
const observerCounts = (page: Page) => page.evaluate(() => window.__fp.counts());

async function scenario(page: Page, name: string): Promise<Record<string, CardGeometry>> {
    await page.evaluate((next) => window.__fp.setScenario(next), name);
    const settled = await settle(page);
    expect(settled.settled, `${name} did not settle within ${SETTLE_FRAME_BUDGET} frames`).toBe(true);
    return geometry(page);
}

async function setHeight(page: Page, card: string, px: number): Promise<Record<string, CardGeometry>> {
    await page.evaluate(([c, h]) => window.__fp.setHeight(c as string, h as number), [card, px] as const);
    const settled = await settle(page);
    expect(settled.settled, `${card} -> ${px}px did not settle`).toBe(true);
    return geometry(page);
}

/** Failure output the reader can act on without re-running anything. */
function report(label: string, width: number, g: Record<string, CardGeometry>): string {
    const rows = Object.entries(g)
        .map(([card, m]) =>
            `    ${card.padEnd(18)} top=${m.cardTop} bottom=${m.cardBottom} height=${m.cardHeight} ` +
            `band=[${m.top}..${m.bottom}] width=${m.width} overflow=${m.overflow}`,
        )
        .join("\n");
    return `${label} @ ${width}px\n${rows}`;
}

/** Columns a card occupies, inclusive. */
const cols = (colStart: number, colSpan: number) => [colStart, colStart + colSpan - 1] as const;

/** Two column ranges share at least one column — the ONLY reason one card waits for another. */
function overlaps(a: readonly [number, number], b: readonly [number, number]): boolean {
    return a[0] <= b[1] && b[0] <= a[1];
}

/**
 * THE AUTHORED COLUMN IS EXACT — the half of the composition the runtime may never touch.
 *
 * The engine decides Y. It does not decide X, and a packing model that drifted cards sideways
 * to close gaps would be free masonry, not an operational canvas.
 */
function expectAuthoredColumns(
    g: Record<string, CardGeometry>,
    canvas: { left: number; width: number },
    gap: number,
    authored: Record<string, readonly [number, number]>,
    label: string,
): void {
    const track = (canvas.width - 11 * gap) / 12;
    for (const [card, [colStart, colSpan]] of Object.entries(authored)) {
        const m = g[card];
        expect(m, `${label}: ${card} is not rendered`).toBeTruthy();
        const expectedLeft = canvas.left + (colStart - 1) * (track + gap);
        const expectedWidth = colSpan * track + (colSpan - 1) * gap;
        expect(Math.abs(m.left - expectedLeft), `${label}: ${card} left ${m.left} != ${expectedLeft}`).toBeLessThanOrEqual(TOLERANCE + 1);
        expect(Math.abs(m.width - expectedWidth), `${label}: ${card} width ${m.width} != ${expectedWidth}`).toBeLessThanOrEqual(TOLERANCE + 1);
    }
}

/**
 * THE PAINTED CARD IS ITS OWN HEIGHT — no band, no neighbour, no authored span.
 *
 * Asserted as three separate facts because each failed independently in this programme's
 * history: the wrapper is not taller than the card (no assigned surplus), the content does not
 * spill out of it, and the height genuinely tracks the card's own content.
 */
function expectIntrinsicHeight(g: Record<string, CardGeometry>, card: string, label: string): void {
    const m = g[card];
    expect(m, `${label}: ${card} is not rendered`).toBeTruthy();
    expect(Math.abs(m.height - m.cardHeight), `${label}: ${card} wrapper ${m.height} != painted ${m.cardHeight} — assigned surplus`).toBeLessThanOrEqual(TOLERANCE);
    expect(m.overflow, `${label}: ${card} spills ${m.overflow}px`).toBeLessThanOrEqual(TOLERANCE);
}

/**
 * NO TWO CARDS SHARING A COLUMN MAY OVERLAP VERTICALLY.
 *
 * Cards in DISJOINT columns are skipped on purpose: they are allowed to overlap vertically,
 * and that freedom is the entire point of the model.
 */
function expectNoColumnOverlap(
    g: Record<string, CardGeometry>,
    authored: Record<string, readonly [number, number]>,
    label: string,
): void {
    const keys = Object.keys(authored);
    for (let i = 0; i < keys.length; i += 1) {
        for (let j = i + 1; j < keys.length; j += 1) {
            const [a, b] = [keys[i], keys[j]];
            const [as, asp] = authored[a];
            const [bs, bsp] = authored[b];
            if (!overlaps(cols(as, asp), cols(bs, bsp))) continue;
            const [x, y] = [g[a], g[b]];
            const separated = x.bottom <= y.top + TOLERANCE || y.bottom <= x.top + TOLERANCE;
            expect(separated, `${label}: ${a} [${x.top}..${x.bottom}] overlaps ${b} [${y.top}..${y.bottom}] and they share a column`).toBe(true);
        }
    }
}

const WIDTHS = [1180, 1440, 1680] as const;

const gapOf = (page: Page) => page.evaluate(() => window.__fp.gap());
const canvasOf = (page: Page) => page.evaluate(() => window.__fp.canvas());

/** The authored spans of each scenario, as [colStart, colSpan]. */
const AUTHORED = {
    flow_8_4: { left: [1, 8], right: [9, 4], leftNext: [1, 8] },
    flow_6_6: { a1: [1, 6], b1: [7, 6], a2: [1, 6], b2: [7, 6] },
    stackedVsTall: { upper: [1, 6], lower: [1, 6], tall: [7, 6] },
    spanningAfterSplit: { l: [1, 6], r: [7, 6], full: [1, 12] },
    threeTracks: { t1: [1, 4], t2: [5, 4], t3: [9, 4], t1b: [1, 4], t2b: [5, 4], t3b: [9, 4] },
    spanEightAfterFours: { t1: [1, 4], t2: [5, 4], t3: [9, 4], wide: [1, 8] },
    realComposition: {
        business_process: [1, 8], financials: [9, 4], children: [1, 8],
        household: [9, 4], health_safety: [1, 3], attendance: [4, 9],
    },
} as const;

for (const width of WIDTHS) {
    test.describe(`column-aware intrinsic flow @ ${width}px`, () => {
        test.beforeEach(async ({ page }) => {
            await mount(page, width);
        });

        test("A — a card waits for its OWN columns, not for a taller card beside it", async ({ page }) => {
            /*
             * THE HEADLINE. `leftNext` occupies columns 1-8, so it begins after `left` (200) and
             * must not wait for `right` (400) in columns 9-12. Under the retired equal-band model
             * both top cards were drawn 400 tall and this started ~200px lower.
             */
            const g = await scenario(page, "flow_8_4");
            const [gap, canvas] = [await gapOf(page), await canvasOf(page)];
            const label = report("flow_8_4", width, g);

            expectAuthoredColumns(g, canvas, gap, AUTHORED.flow_8_4, label);
            for (const c of ["left", "right", "leftNext"]) expectIntrinsicHeight(g, c, label);

            // The two top cards do NOT share a bottom — that is the retired contract.
            expect(g.left.cardHeight, `${label}
left must keep its own height`).toBeLessThan(g.right.cardHeight - TOLERANCE);

            // leftNext begins after LEFT, with exactly one gap.
            expect(Math.abs(g.leftNext.top - (g.left.bottom + gap)), `${label}
leftNext must follow left`).toBeLessThanOrEqual(TOLERANCE);
            // …and strictly above where the retired model would have put it.
            expect(g.leftNext.top, `${label}
leftNext must NOT wait for right`).toBeLessThan(g.right.bottom - TOLERANCE);
            expectNoColumnOverlap(g, AUTHORED.flow_8_4, label);
        });

        test("B — 6/6: each column flows independently", async ({ page }) => {
            const g = await scenario(page, "flow_6_6");
            const [gap, canvas] = [await gapOf(page), await canvasOf(page)];
            const label = report("flow_6_6", width, g);
            expectAuthoredColumns(g, canvas, gap, AUTHORED.flow_6_6, label);
            expect(Math.abs(g.a2.top - (g.a1.bottom + gap)), `${label}
a2 follows a1`).toBeLessThanOrEqual(TOLERANCE);
            expect(Math.abs(g.b2.top - (g.b1.bottom + gap)), `${label}
b2 follows b1`).toBeLessThanOrEqual(TOLERANCE);
            // The two tracks are at different heights, and neither waited for the other.
            expect(Math.abs(g.a2.top - g.b2.top), `${label}
the tracks must be independent`).toBeGreaterThan(TOLERANCE);
            expectNoColumnOverlap(g, AUTHORED.flow_6_6, label);
        });

        test("C — two stacked left do not wait for one tall right", async ({ page }) => {
            const g = await scenario(page, "stackedVsTall");
            const gap = await gapOf(page);
            const label = report("stackedVsTall", width, g);
            expect(Math.abs(g.lower.top - (g.upper.bottom + gap)), `${label}
lower follows upper`).toBeLessThanOrEqual(TOLERANCE);
            expect(g.lower.top, `${label}
lower must not wait for tall`).toBeLessThan(g.tall.bottom - TOLERANCE);
            // DISJOINT COLUMNS MAY OVERLAP VERTICALLY — asserted, because it is desired.
            const verticallyOverlapping = g.lower.top < g.tall.bottom && g.tall.top < g.lower.bottom;
            expect(verticallyOverlapping, `${label}
lower (cols 1-6) and tall (cols 7-12) should be free to coexist vertically`).toBe(true);
            expectNoColumnOverlap(g, AUTHORED.stackedVsTall, label);
        });

        test("D — a card spanning both groups clears the taller of them", async ({ page }) => {
            const g = await scenario(page, "spanningAfterSplit");
            const gap = await gapOf(page);
            const label = report("spanningAfterSplit", width, g);
            const floor = Math.max(g.l.bottom, g.r.bottom);
            expect(Math.abs(g.full.top - (floor + gap)), `${label}
full must clear BOTH columns`).toBeLessThanOrEqual(TOLERANCE);
            expectNoColumnOverlap(g, AUTHORED.spanningAfterSplit, label);
        });

        test("E — 4/4/4 gives three independent vertical tracks", async ({ page }) => {
            const g = await scenario(page, "threeTracks");
            const [gap, canvas] = [await gapOf(page), await canvasOf(page)];
            const label = report("threeTracks", width, g);
            expectAuthoredColumns(g, canvas, gap, AUTHORED.threeTracks, label);
            for (const [second, first] of [["t1b", "t1"], ["t2b", "t2"], ["t3b", "t3"]] as const) {
                expect(Math.abs(g[second].top - (g[first].bottom + gap)), `${label}
${second} follows ${first}`).toBeLessThanOrEqual(TOLERANCE);
            }
            // Three distinct tops: no track inherited another's height.
            const tops = new Set([g.t1b.top, g.t2b.top, g.t3b.top].map((t) => Math.round(t)));
            expect(tops.size, `${label}
the three tracks must be independent`).toBe(3);
            expectNoColumnOverlap(g, AUTHORED.threeTracks, label);
        });

        test("F — an 8-column card clears every column it occupies, and only those", async ({ page }) => {
            const g = await scenario(page, "spanEightAfterFours");
            const gap = await gapOf(page);
            const label = report("spanEightAfterFours", width, g);
            // wide spans 1-8: it clears t1 and t2, and is NOT held by t3 in columns 9-12.
            expect(Math.abs(g.wide.top - (Math.max(g.t1.bottom, g.t2.bottom) + gap)), `${label}
wide must clear t1 and t2`).toBeLessThanOrEqual(TOLERANCE);
            expectNoColumnOverlap(g, AUTHORED.spanEightAfterFours, label);
        });

        test("THE REGRESSION FIXTURE — the real published composition", async ({ page }) => {
            /*
             * Health occupies columns 1-3, Household columns 9-12: no shared column. On deployed
             * `d0870c58c` Health was drawn at Household's height with 241px of nothing in it.
             */
            const g = await scenario(page, "realComposition");
            const [gap, canvas] = [await gapOf(page), await canvasOf(page)];
            const label = report("realComposition", width, g);

            expectAuthoredColumns(g, canvas, gap, AUTHORED.realComposition, label);
            for (const c of Object.keys(AUTHORED.realComposition)) expectIntrinsicHeight(g, c, label);
            expectNoColumnOverlap(g, AUTHORED.realComposition, label);

            // THE DEFECT, as an assertion: the short card must not be the tall card's height.
            expect(g.health_safety.cardHeight, `${label}
Health (cols 1-3) must not inherit Household (cols 9-12)`).toBeLessThan(g.household.cardHeight - TOLERANCE);
            // Attendance is sparse and must stay sparse.
            expect(g.attendance.cardHeight, `${label}
Attendance must not be inflated`).toBeLessThan(g.children.cardHeight - TOLERANCE);
            // Process no longer stretches to Financials.
            expect(g.business_process.cardHeight, `${label}
Process must keep its own height`).toBeLessThan(g.financials.cardHeight - TOLERANCE);
            // Children rises to meet Process rather than waiting for Financials.
            expect(Math.abs(g.children.top - (g.business_process.bottom + gap)), `${label}
Children follows Process`).toBeLessThanOrEqual(TOLERANCE);
        });

        test("AUTHORED ORDER — a taller later card is not hoisted above an earlier one", async ({ page }) => {
            /*
             * The guard against "optimising" the operator's composition. `second` is 400px and
             * `first` is 120px; both span all twelve columns. A packer that reordered for a
             * denser result would put `second` on top and total height would be identical —
             * which is exactly why this must be asserted rather than inferred from geometry.
             */
            const g = await scenario(page, "authoredOrder");
            const gap = await gapOf(page);
            const label = report("authoredOrder", width, g);
            expect(g.first.top, `${label}\nthe first-authored card must be on top`).toBeLessThan(g.second.top - TOLERANCE);
            expect(Math.abs(g.second.top - (g.first.bottom + gap)), `${label}\nsecond follows first`).toBeLessThanOrEqual(TOLERANCE);
            expect(g.second.cardHeight, `${label}\nand it is still the taller card`).toBeGreaterThan(g.first.cardHeight + TOLERANCE);
        });

        test("no horizontal overflow at this width", async ({ page }) => {
            await scenario(page, "realComposition");
            const over = await page.evaluate(() => document.scrollingElement!.scrollWidth - document.scrollingElement!.clientWidth);
            expect(over, "the panel must never scroll horizontally").toBeLessThanOrEqual(0);
        });
    });
}

test.describe("dynamic content — growth, shrink, and who is allowed to move", () => {
    test.beforeEach(async ({ page }) => {
        await mount(page, 1440);
    });

    test("G — growth pushes down only the cards whose columns overlap", async ({ page }) => {
        const before = await scenario(page, "flow_8_4");
        const gap = await gapOf(page);
        const grown = await setHeight(page, "left", 380);
        const label = report("grow left -> 380", 1440, grown);

        expect(grown.left.cardHeight, label).toBeGreaterThanOrEqual(380 - TOLERANCE);
        // leftNext shares columns 1-8, so it moves down by exactly the growth.
        expect(Math.abs(grown.leftNext.top - (grown.left.bottom + gap)), `${label}
leftNext must follow`).toBeLessThanOrEqual(TOLERANCE);
        expect(grown.leftNext.top, `${label}
leftNext must have moved DOWN`).toBeGreaterThan(before.leftNext.top + TOLERANCE);
        // right is in columns 9-12 and must not have moved at all.
        expect(Math.abs(grown.right.top - before.right.top), `${label}
right shares no column and must not move`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(grown.right.cardHeight - before.right.cardHeight), `${label}
right must keep its own height`).toBeLessThanOrEqual(TOLERANCE);
        expectNoColumnOverlap(grown, AUTHORED.flow_8_4, label);
    });

    test("H — shrink closes the gap; no stale whitespace", async ({ page }) => {
        await scenario(page, "flow_8_4");
        const gap = await gapOf(page);
        const grown = await setHeight(page, "left", 380);
        const shrunk = await setHeight(page, "left", 120);
        const label = report("shrink left -> 120", 1440, shrunk);

        expect(shrunk.left.cardHeight, `${label}
left must shrink`).toBeLessThan(200);
        expect(Math.abs(shrunk.leftNext.top - (shrunk.left.bottom + gap)), `${label}
leftNext must rise to meet it`).toBeLessThanOrEqual(TOLERANCE);
        expect(shrunk.leftNext.top, `${label}
no stale gap may remain`).toBeLessThan(grown.leftNext.top - TOLERANCE);
    });

    test("LOADING -> READY — a card that resolves taller reflows only its own columns", async ({ page }) => {
        /*
         * The scenario the packing model now depends on directly. Financials resolves from a
         * loading placeholder to its ready height; cards sharing columns 9-12 move, cards in
         * columns 1-8 do not.
         */
        await scenario(page, "realComposition");
        const loading = await setHeight(page, "financials", 100);
        const ready = await setHeight(page, "financials", 320);
        const gap = await gapOf(page);
        const label = report("financials loading -> ready", 1440, ready);

        expect(ready.financials.cardHeight, label).toBeGreaterThan(loading.financials.cardHeight + TOLERANCE);
        // Household shares columns 9-12 and must move down.
        expect(ready.household.top, `${label}
Household shares columns and must move`).toBeGreaterThan(loading.household.top + TOLERANCE);
        expect(Math.abs(ready.household.top - (ready.financials.bottom + gap)), `${label}
Household follows Financials`).toBeLessThanOrEqual(TOLERANCE);
        // Process and Children are columns 1-8 and must be untouched.
        expect(Math.abs(ready.business_process.top - loading.business_process.top), `${label}
Process must not move`).toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(ready.children.top - loading.children.top), `${label}
Children must not move`).toBeLessThanOrEqual(TOLERANCE);
        expectNoColumnOverlap(ready, AUTHORED.realComposition, label);
    });

    test("no ratchet — measure X, place X, measure X", async ({ page }) => {
        /*
         * The feedback class this canvas has shipped twice. It is structurally weaker now — the
         * measured height IS the painted height, so there is no assigned Y to leak back — but a
         * repeated assignment must still be a fixed point.
         */
        await scenario(page, "flow_8_4");
        const first = await setHeight(page, "left", 240);
        for (const _ of [0, 1, 2]) {
            const again = await settle(page);
            expect(again.settled).toBe(true);
        }
        const after = await geometry(page);
        expect(Math.abs(after.left.cardHeight - first.left.cardHeight), "height ratcheted with no content change").toBeLessThanOrEqual(TOLERANCE);
        expect(Math.abs(after.leftNext.top - first.leftNext.top), "placement ratcheted with no content change").toBeLessThanOrEqual(TOLERANCE);
    });

    test("deterministic across a cold reload", async ({ page }) => {
        const first = await scenario(page, "realComposition");
        await mount(page, 1440);
        const second = await scenario(page, "realComposition");
        for (const card of Object.keys(AUTHORED.realComposition)) {
            expect(Math.abs(second[card].top - first[card].top), `${card} top differs across a cold reload`).toBeLessThanOrEqual(TOLERANCE);
            expect(Math.abs(second[card].cardHeight - first[card].cardHeight), `${card} height differs across a cold reload`).toBeLessThanOrEqual(TOLERANCE);
        }
    });

    test("loop guard — the layout converges and then stops working", async ({ page }) => {
        await scenario(page, "flow_8_4");
        await setHeight(page, "left", 420);
        const before = await geometry(page);
        const countsBefore = await observerCounts(page);

        const idle = await settle(page);
        const after = await geometry(page);
        const countsAfter = await observerCounts(page);
        const label = report("after settle", 1440, after);

        expect(idle.settled, label).toBe(true);
        expect(after, `${label}\ngeometry moved while the content held still`).toEqual(before);
        expect(countsAfter.resize - countsBefore.resize, `${label}\nResizeObserver fired with no content change`).toBeLessThanOrEqual(2);
        expect(countsAfter.mutation - countsBefore.mutation, `${label}\nMutationObserver fired with no content change`).toBeLessThanOrEqual(2);
    });
});
