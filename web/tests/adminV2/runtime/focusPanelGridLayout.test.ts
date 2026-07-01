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
    defaultRowSpanForCard,
    emptyGridLayout,
    gridFromPublishedLayout,
    moveArea,
    removeArea,
    resizeArea,
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

        // Move readiness beside household (col 9, row 1) — a vertical neighbour.
        g = moveArea(g, "readiness_kpi", 9, 1);
        expect(g.areas.find((a) => a.card === "readiness_kpi")).toMatchObject({ colStart: 9, rowStart: 1 });

        // Resize readiness to span 3 rows vertically.
        g = resizeArea(g, "readiness_kpi", 4, 3);
        expect(g.areas.find((a) => a.card === "readiness_kpi")!.rowSpan).toBe(3);

        g = removeArea(g, "household");
        expect(cardsInGrid(g)).toEqual(["readiness_kpi"]);
    });

    it("opens new/seeded cards at their NATURAL summary height — not a min row", () => {
        // Per-card defaults: Household/Children tallest, Current Work shortest, > 1 row each.
        expect(defaultRowSpanForCard("household")).toBeGreaterThanOrEqual(3);
        expect(defaultRowSpanForCard("children")).toBeGreaterThan(defaultRowSpanForCard("current_work"));
        expect(defaultRowSpanForCard("current_work")).toBeGreaterThan(1);

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
});
