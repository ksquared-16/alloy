import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    addCardToGrid,
    gridOverlaps,
    moveArea,
    normalizeGridColumnStacking,
    placeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { planPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const BASE_GRID: FocusPanelGridLayout = { columns: 12, areas: [] };

describe("Focus Panel card placement parity", () => {
    it("gives the JUST-PLACED card the slot, and pushes the incumbent below it", () => {
        /*
         * INSERT-ABOVE IS THE POINT OF THE TIE-BREAK.
         *
         * These two tests asserted the opposite until now — that the first card placed on a cell
         * keeps it — and had been red since `79b39ba07` (2026-07-24) deliberately flipped the rule
         * so that dropping a card onto the top of a column puts it at the top of that column.
         * `placeArea` appends the placed card last precisely so `normalizeGridColumnStacking`
         * prefers it on a same-cell tie; asserting the old order asserted that the drag gesture
         * does not work.
         *
         * What must hold is stated below and is stronger than what was here: the just-placed card
         * takes the cell, the incumbent moves DOWN rather than sideways or away, and the two do
         * not overlap.
         */
        let grid = addCardToGrid(BASE_GRID, "household", { colSpan: 6, rowSpan: 4 });
        grid = placeArea(grid, { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 });
        grid = placeArea(grid, { card: "children", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 });
        grid = normalizeGridColumnStacking(grid);

        const household = grid.areas.find((a) => a.card === "household")!;
        const children = grid.areas.find((a) => a.card === "children")!;
        // Both stay in the column they were dropped into.
        expect(household.colStart).toBe(7);
        expect(children.colStart).toBe(7);
        // Children was placed last, so it owns the cell and Household is the one that moves.
        expect(children.rowStart).toBe(1);
        expect(household.rowStart).toBeGreaterThanOrEqual(children.rowStart + children.rowSpan);
        // And the invariant the stacking exists to keep.
        expect(gridOverlaps(grid)).toEqual([]);
    });

    it("puts the most recently moved card on top of the column it was moved into", () => {
        let grid = addCardToGrid(BASE_GRID, "household", { colSpan: 6, rowSpan: 3 });
        grid = addCardToGrid(grid, "children", { colSpan: 6, rowSpan: 3 });
        grid = moveArea(grid, "household", 7, 1);
        grid = moveArea(grid, "children", 7, 1);
        grid = normalizeGridColumnStacking(grid);
        const rightColumn = grid.areas
            .filter((a) => a.colStart === 7)
            .sort((a, b) => a.rowStart - b.rowStart)
            .map((a) => a.card);
        // Children moved second, so Children reads first. Both cards are still in the column, in a
        // definite order, and neither was dropped.
        expect(rightColumn).toEqual(["children", "household"]);
        expect(gridOverlaps(grid)).toEqual([]);
    });

    it("stacks cards that share column-range overlap (not only exact colStart)", () => {
        let grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 },
                { card: "children", colStart: 8, colSpan: 5, rowStart: 1, rowSpan: 3 },
            ],
        };
        grid = normalizeGridColumnStacking(grid);
        const household = grid.areas.find((a) => a.card === "household")!;
        const children = grid.areas.find((a) => a.card === "children")!;
        expect(children.rowStart).toBeGreaterThanOrEqual(household.rowStart + household.rowSpan);
    });

    it("Builder and /work-unit plan the SAME published grid, because neither may ask for another", () => {
        // The divergence this file is named for, closed at its source. The body used to write
        // `preferLanesFromGrid={Boolean(publishedLayout?.grid) || mode === "work"}` while the
        // /surfaces composer passed nothing, so one document produced two geometries. Neither
        // consumer may name a strategy now, and `planPublishedLayout` no longer accepts one.
        const modeGrid = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
            "utf8",
        );
        const composer = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx"),
            "utf8",
        );
        const skeleton = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/FocusPanelSummarySkeleton.tsx"),
            "utf8",
        );
        for (const [name, src] of [["modeGrid", modeGrid], ["composer", composer], ["skeleton", skeleton]] as const) {
            expect(src, name).toContain("<FocusPanelCardGrid");
            expect(src, name).not.toContain("preferLanesFromGrid");
        }

        const layout = {
            grid: {
                columns: 12,
                areas: [
                    { card: "current_work" as const, colStart: 1, colSpan: 6, rowStart: 1, rowSpan: 6 },
                    { card: "household" as const, colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 },
                    { card: "children" as const, colStart: 7, colSpan: 6, rowStart: 5, rowSpan: 4 },
                ],
            },
            rows: [] as never[],
        };
        const plan = planPublishedLayout(layout as never, 1200);
        expect(plan.strategy).toBe("grid");
        expect(plan.lanes).toEqual([]);
        // The authored rectangles reach the renderer untouched — column, span and order.
        expect(plan.areas.map((a) => [a.card, a.colStart, a.colSpan, a.rowStart])).toEqual([
            ["current_work", 1, 6, 1],
            ["household", 7, 6, 1],
            ["children", 7, 6, 5],
        ]);
    });

    it("runtime and composer share the same vertical gap token", () => {
        const css = readFileSync(
            join(process.cwd(), "app/adminV2/components/alloyOsRuntime.css"),
            "utf8",
        );
        expect(css).toMatch(/--alloy-os-fp-gap-y:\s*10px/);
        expect(css).toContain("grid-auto-rows: minmax(76px, auto)");
        // The composer's rows are content-sized too. A fixed row cannot grow, so a card
        // whose content exceeded rowSpan x 76 overflowed its own grid area and painted over
        // the card declared beneath it — with the declared areas still perfectly disjoint.
        expect(css).toContain(
            ".alloy-os-fp-composer .alloy-os-fp-canvas--grid {\n  grid-auto-rows: minmax(76px, auto);",
        );
    });
});
