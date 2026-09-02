import { describe, expect, it } from "vitest";

import {
    isFocusPanelGridLayout,
    isFocusPanelPublishedLayout,
    planPublishedLayout,
    publishedLayoutReadingOrder,
    readFocusPanelPublishedLayout,
    PUBLISHED_LAYOUT_MIN_PX,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { withPublishedLayoutMetadata } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";
import {
    addCardToGrid,
    buildPublishedLayoutFromGrid,
    cardsInGrid,
    clampArea,
    COMPOSER_GRID_GAP_PX,
    COMPOSER_GRID_ROW_UNIT_PX,
    composerGhostBounds,
    defaultRowSpanForCard,
    emptyGridLayout,
    gridFromPublishedLayout,
    moveArea,
    removeArea,
    resizeArea,
    snapMoveTarget,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

// The three validation layouts from the EB V5 brief, in 12-column grid placement.
const A: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "household", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
        { card: "readiness_kpi", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 1 },
        { card: "current_work", colStart: 9, colSpan: 4, rowStart: 2, rowSpan: 1 },
        { card: "children", colStart: 1, colSpan: 8, rowStart: 3, rowSpan: 1 },
    ],
};
const B: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "household", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 },
        { card: "children", colStart: 1, colSpan: 7, rowStart: 2, rowSpan: 2 },
        { card: "readiness_kpi", colStart: 8, colSpan: 5, rowStart: 2, rowSpan: 1 },
        { card: "current_work", colStart: 8, colSpan: 5, rowStart: 3, rowSpan: 1 },
    ],
};
const C: FocusPanelGridLayout = {
    columns: 12,
    areas: [
        { card: "current_work", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 1 },
        { card: "household", colStart: 1, colSpan: 8, rowStart: 2, rowSpan: 1 },
        { card: "children", colStart: 1, colSpan: 8, rowStart: 3, rowSpan: 1 },
        { card: "readiness_kpi", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 3 },
    ],
};

describe("focusPanelGridLayout — V5 responsive grid", () => {
    it("validates a well-formed grid + rejects out-of-bounds / empty", () => {
        expect(isFocusPanelGridLayout(A)).toBe(true);
        expect(isFocusPanelGridLayout({ columns: 12, areas: [] })).toBe(false);
        expect(isFocusPanelGridLayout({ columns: 12, areas: [{ card: "x", colStart: 10, colSpan: 4, rowStart: 1, rowSpan: 1 }] })).toBe(false); // 10+4-1 = 13 > 12
        expect(isFocusPanelGridLayout({ columns: 0, areas: [{ card: "x", colStart: 1, colSpan: 1, rowStart: 1, rowSpan: 1 }] })).toBe(false);
    });

    it("a published layout is valid with ONLY a grid (rows optional)", () => {
        const layout = buildPublishedLayoutFromGrid(C);
        expect(isFocusPanelPublishedLayout(layout)).toBe(true);
    });

    it("plans the grid strategy with exact placement (vertical + horizontal spans)", () => {
        const plan = planPublishedLayout(buildPublishedLayoutFromGrid(C), 1040);
        expect(plan.strategy).toBe("grid");
        expect(plan.gridColumns).toBe(12);
        const readiness = plan.areas.find((a) => a.card === "readiness_kpi")!;
        // Readiness spans all THREE rows vertically next to the Current Work/Household/Children stack.
        expect(readiness).toMatchObject({ colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 3 });
        const cw = plan.areas.find((a) => a.card === "current_work")!;
        expect(cw).toMatchObject({ colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 1 });
    });

    it("authors layouts A, B, C with no row hacks (vertical spans present)", () => {
        for (const layout of [A, B, C]) {
            const plan = planPublishedLayout(buildPublishedLayoutFromGrid(layout), 1040);
            expect(plan.strategy).toBe("grid");
            expect(plan.areas).toHaveLength(layout.areas.length);
        }
        // A: Household spans 2 rows; B: Children spans 2 rows; C: Readiness spans 3 rows.
        expect(planPublishedLayout(buildPublishedLayoutFromGrid(A), 1040).areas.find((a) => a.card === "household")!.rowSpan).toBe(2);
        expect(planPublishedLayout(buildPublishedLayoutFromGrid(B), 1040).areas.find((a) => a.card === "children")!.rowSpan).toBe(2);
        expect(planPublishedLayout(buildPublishedLayoutFromGrid(C), 1040).areas.find((a) => a.card === "readiness_kpi")!.rowSpan).toBe(3);
    });

    it("Work mode: presents an authored grid as column-major lanes (no dead vertical gaps)", () => {
        const twoCol: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "household", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "children", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
                { card: "readiness_kpi", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 1 },
                { card: "health", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 1 },
            ],
        };
        const layout = buildPublishedLayoutFromGrid(twoCol);

        // Default (no opt) keeps the exact CSS-Grid placement — unchanged behavior.
        expect(planPublishedLayout(layout, 1040).strategy).toBe("grid");

        // Work mode transposes the SAME authored columns into continuous lanes.
        const lanes = planPublishedLayout(layout, 1040, { preferLanesFromGrid: true });
        expect(lanes.strategy).toBe("lanes");
        expect(lanes.lanes).toHaveLength(2);
        expect(lanes.lanes[0]!.cards.map((c) => c.key)).toEqual(["household", "children"]);
        expect(lanes.lanes[1]!.cards.map((c) => c.key)).toEqual(["readiness_kpi", "health"]);
    });

    it("Work-mode lanes fall back to the exact grid when a card spans full width", () => {
        const withFullWidth: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "attention", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 1 },
                { card: "household", colStart: 1, colSpan: 6, rowStart: 2, rowSpan: 1 },
                { card: "readiness_kpi", colStart: 7, colSpan: 6, rowStart: 2, rowSpan: 1 },
            ],
        };
        const plan = planPublishedLayout(buildPublishedLayoutFromGrid(withFullWidth), 1040, {
            preferLanesFromGrid: true,
        });
        expect(plan.strategy).toBe("grid");
    });

    it("PRESERVES the grid through the publish round-trip — never persists a rows-only stack", () => {
        // The reported bug: the builder holds the grid correctly, but publishing pruned the
        // `grid` away, persisting only the reading-order full-width `rows` fallback → the
        // work-unit runtime rendered a single full-width STACK instead of the authored grid.
        const layout = buildPublishedLayoutFromGrid(C); // { grid, rows: full-width stack }
        const metadata = withPublishedLayoutMetadata(null, layout); // publish path (prunes)
        const readBack = readFocusPanelPublishedLayout({ metadata });
        expect(readBack).not.toBeNull();
        expect(readBack!.grid).toBeDefined(); // the grid SURVIVES persistence (the fix)

        const plan = planPublishedLayout(readBack!, 1040);
        expect(plan.strategy).toBe("grid"); // renders the grid, NOT a rows stack
        // Readiness still spans 3 rows at its authored coordinates — order is not flattened.
        expect(plan.areas.find((a) => a.card === "readiness_kpi")!).toMatchObject({ colStart: 9, rowStart: 1, rowSpan: 3 });
    });

    it("collapses to a single column in reading order (top→bottom, left→right) when narrow", () => {
        const plan = planPublishedLayout(buildPublishedLayoutFromGrid(C), PUBLISHED_LAYOUT_MIN_PX - 1);
        expect(plan.collapsed).toBe(true);
        expect(plan.strategy).toBe("rows");
        // Reading order: row1 (Current Work, then Readiness), row2 (Household), row3 (Children).
        expect(plan.rows.flatMap((r) => r.cells[0]!.cards)).toEqual([
            "current_work",
            "readiness_kpi",
            "household",
            "children",
        ]);
        expect(publishedLayoutReadingOrder(buildPublishedLayoutFromGrid(C))).toEqual([
            "current_work",
            "readiness_kpi",
            "household",
            "children",
        ]);
    });

    it("supports 2 / 3 / 4 column grids", () => {
        for (const cols of [2, 3, 4]) {
            const g: FocusPanelGridLayout = { columns: cols, areas: [{ card: "household", colStart: 1, colSpan: cols, rowStart: 1, rowSpan: 1 }] };
            expect(planPublishedLayout(buildPublishedLayoutFromGrid(g), 1040).gridColumns).toBe(cols);
        }
    });
});

describe("focusPanelGridLayoutOps", () => {
    it("adds a card on the next free row, snaps + clamps, then moves/resizes/removes", () => {
        let g = emptyGridLayout(12);
        g = addCardToGrid(g, "household");
        expect(cardsInGrid(g)).toEqual(["household"]);
        g = addCardToGrid(g, "readiness_kpi", { colSpan: 4 });
        // readiness lands on the row after household (no overlap).
        expect(g.areas.find((a) => a.card === "readiness_kpi")!.rowStart).toBeGreaterThan(1);

        /*
         * Move readiness onto col 9, row 1 — which is INSIDE household. `addCardToGrid`
         * without a colSpan spans the full 12 columns, so household owns rows 1–3 across
         * the whole canvas and there is no "beside" it on row 1.
         *
         * This once asserted the move landed there, which it only ever did because
         * overlap was tolerated. It is not: a placement that collides is resolved below
         * what it collides with, so the column is honoured and the row is pushed past
         * household. `focusPanelGridNoOverlap.test.ts` owns the invariant itself.
         */
        g = moveArea(g, "readiness_kpi", 9, 1);
        expect(g.areas.find((a) => a.card === "readiness_kpi")).toMatchObject({ colStart: 9, rowStart: 4 });

        // Resize readiness to span 3 rows vertically.
        g = resizeArea(g, "readiness_kpi", 4, 3);
        expect(g.areas.find((a) => a.card === "readiness_kpi")!.rowSpan).toBe(3);

        g = removeArea(g, "household");
        expect(cardsInGrid(g)).toEqual(["readiness_kpi"]);
    });

    it("opens new/seeded cards at their NATURAL summary height — not a min row", () => {
        // Per-card defaults: Household/Children/Current Work open tall enough for full summary cards.
        expect(defaultRowSpanForCard("household")).toBeGreaterThanOrEqual(3);
        expect(defaultRowSpanForCard("children")).toBeGreaterThanOrEqual(3);
        expect(defaultRowSpanForCard("current_work")).toBeGreaterThanOrEqual(3);

        // addCardToGrid uses the natural default (not rowSpan 1).
        const g = addCardToGrid(emptyGridLayout(12), "household");
        expect(g.areas[0]!.rowSpan).toBe(defaultRowSpanForCard("household"));

        // rows→grid seed gives each card its natural height (not a clipped single row).
        const seeded = gridFromPublishedLayout({
            rows: [{ cells: [{ width: "half", cards: ["household"] }, { width: "half", cards: ["readiness_kpi"] }] }],
        });
        expect(seeded.areas.find((a) => a.card === "household")!.rowSpan).toBe(defaultRowSpanForCard("household"));
        expect(seeded.areas.find((a) => a.card === "readiness_kpi")!.rowSpan).toBe(defaultRowSpanForCard("readiness_kpi"));
    });

    it("clamps an out-of-bounds region back inside the grid", () => {
        const g = emptyGridLayout(12);
        expect(clampArea(g, { card: "household", colStart: 11, colSpan: 6, rowStart: 0, rowSpan: 0 })).toMatchObject({
            colStart: 7, // 11 would overflow with span 6 → pulled back to 7 (7..12)
            colSpan: 6,
            rowStart: 1,
            rowSpan: 1,
        });
    });

    it("does not shrink a full-width card when the pointer drifts toward the right half", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "household", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 3 },
                { card: "children", colStart: 1, colSpan: 12, rowStart: 4, rowSpan: 4 },
            ],
        };
        const moving = grid.areas.find((a) => a.card === "children")!;
        // Pointer near right half must not collapse Children to a 6-col tile.
        const snapped = snapMoveTarget(grid, moving, 8, 1);
        expect(snapped.colSpan).toBe(12);
        expect(snapped.rowStart).toBe(1);
    });

    it("moveArea places Children above Household in a full-width stack", () => {
        let grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "household", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 3 },
                { card: "children", colStart: 1, colSpan: 12, rowStart: 4, rowSpan: 4 },
            ],
        };
        grid = moveArea(grid, "children", 1, 1);
        const children = grid.areas.find((a) => a.card === "children")!;
        const household = grid.areas.find((a) => a.card === "household")!;
        expect(children.rowStart).toBe(1);
        expect(children.colSpan).toBe(12);
        expect(household.rowStart).toBeGreaterThanOrEqual(children.rowStart + children.rowSpan);
    });

    it("snapMoveTarget inserts above a same-column neighbor when dropping on its top edge", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "current_work", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "children", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 2 },
            ],
        };
        const moving = grid.areas.find((a) => a.card === "children")!;
        // Drop on Household's top edge → insert above (not forced under it).
        const snapped = snapMoveTarget(grid, moving, 7, 1);
        expect(snapped.rowStart).toBe(1);
        expect(snapped.colStart).toBe(7);
    });

    it("snapMoveTarget stacks immediately beneath a tall neighbor without teleporting to top", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "current_work", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "children", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 5, rowSpan: 3 },
            ],
        };
        const moving = grid.areas.find((a) => a.card === "household")!;
        // Drop one track into the lower half of Children — must land at Children bottom (5),
        // not yank to row 1 via left-column alignTop.
        const snapped = snapMoveTarget(grid, moving, 7, 3);
        expect(snapped.rowStart).toBe(5);
        expect(snapped.colStart).toBe(7);
    });

    it("after a card snaps to top, another card can reclaim the top slot", () => {
        let grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "current_work", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "children", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 3 },
            ],
        };
        grid = moveArea(grid, "household", 7, 1);
        expect(grid.areas.find((a) => a.card === "household")!.rowStart).toBe(1);
        grid = moveArea(grid, "children", 7, 1);
        const children = grid.areas.find((a) => a.card === "children")!;
        const household = grid.areas.find((a) => a.card === "household")!;
        expect(children.rowStart).toBe(1);
        expect(household.rowStart).toBeGreaterThanOrEqual(children.rowStart + children.rowSpan);
    });

    it("move first card to last and last card to first preserves deterministic reading order", () => {
        let grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "household", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 2 },
                { card: "children", colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 2 },
                { card: "current_work", colStart: 1, colSpan: 12, rowStart: 5, rowSpan: 2 },
            ],
        };
        expect(cardsInGrid(grid)).toEqual(["household", "children", "current_work"]);
        grid = moveArea(grid, "household", 1, 7);
        expect(cardsInGrid(grid)).toEqual(["children", "current_work", "household"]);
        grid = moveArea(grid, "household", 1, 1);
        expect(cardsInGrid(grid)).toEqual(["household", "children", "current_work"]);
    });

    it("repeated reorder operations before save stay stable", () => {
        let grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "readiness_kpi", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "current_work", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 2 },
                { card: "household", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 3 },
                { card: "children", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 3 },
            ],
        };
        for (let i = 0; i < 5; i += 1) {
            grid = moveArea(grid, "household", 7, 1);
            grid = moveArea(grid, "household", 1, 6);
            grid = moveArea(grid, "children", 1, 1);
            grid = moveArea(grid, "children", 7, 3);
        }
        const order = cardsInGrid(grid);
        expect(new Set(order).size).toBe(4);
        expect(order).toHaveLength(4);
        const published = buildPublishedLayoutFromGrid(grid);
        const roundTrip = gridFromPublishedLayout(published);
        expect(cardsInGrid(roundTrip)).toEqual(order);
    });

    it("moveArea can place Household beside What's Next and push Children down", () => {
        // Kelly scenario: drag Household up on the right to sit next to What's Next / above Children.
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "current_work", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "children", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 3 },
            ],
        };
        const next = moveArea(grid, "household", 7, 1);
        const household = next.areas.find((a) => a.card === "household")!;
        const children = next.areas.find((a) => a.card === "children")!;
        expect(household).toMatchObject({ colStart: 7, rowStart: 1 });
        expect(children.rowStart).toBeGreaterThanOrEqual(household.rowStart + household.rowSpan);
        expect(next.areas.find((a) => a.card === "current_work")).toMatchObject({
            colStart: 1,
            rowStart: 1,
        });
    });

    it("snapMoveTarget stacks below when dropping in the lower half of a neighbor", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "current_work", colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "children", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 3 },
                { card: "household", colStart: 7, colSpan: 6, rowStart: 4, rowSpan: 2 },
            ],
        };
        const moving = grid.areas.find((a) => a.card === "household")!;
        // Drop toward bottom of Children (row 3 is in lower half of Children rows 1–3).
        const snapped = snapMoveTarget(grid, moving, 7, 3);
        expect(snapped.rowStart).toBe(4);
        expect(snapped.colStart).toBe(7);
    });

    it("composerGhostBounds maps grid placement to pixel coordinates", () => {
        const bounds = composerGhostBounds({
            colStart: 7,
            colSpan: 6,
            rowStart: 1,
            rowSpan: 2,
            columns: 12,
            surfaceWidthPx: 1200,
            paddingX: 10,
            paddingY: 10,
        });
        /*
         * A column is NOT surfaceWidth / columns. The browser subtracts the 11 gaps it
         * inserts between 12 tracks first, then divides; a column's start advances by
         * track + gap. Dividing by 12 alone drifts further right with every column, which
         * is what made the ghost and the drop disagree toward the right of the canvas.
         */
        const track = (1200 - 11 * COMPOSER_GRID_GAP_PX) / 12;
        expect(bounds.left).toBe(10 + 6 * (track + COMPOSER_GRID_GAP_PX));
        expect(bounds.top).toBe(10);
        // A span covers its own tracks plus the gaps between them, and no trailing gap.
        expect(bounds.width).toBeCloseTo(6 * track + 5 * COMPOSER_GRID_GAP_PX);
        expect(bounds.height).toBe(
            2 * COMPOSER_GRID_ROW_UNIT_PX + (2 - 1) * COMPOSER_GRID_GAP_PX,
        );
    });
});
