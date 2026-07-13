import { describe, expect, it } from "vitest";

import {
    addCardToGrid,
    moveArea,
    normalizeGridColumnStacking,
    placeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const BASE_GRID: FocusPanelGridLayout = { columns: 12, areas: [] };

describe("Focus Panel card placement parity", () => {
    it("stacks Household then Children in the same column without overlap", () => {
        let grid = addCardToGrid(BASE_GRID, "household", { colSpan: 6, rowSpan: 4 });
        grid = placeArea(grid, {
            card: "household",
            colStart: 7,
            colSpan: 6,
            rowStart: 1,
            rowSpan: 4,
        });
        grid = placeArea(grid, {
            card: "children",
            colStart: 7,
            colSpan: 6,
            rowStart: 1,
            rowSpan: 4,
        });
        grid = normalizeGridColumnStacking(grid);

        const household = grid.areas.find((a) => a.card === "household");
        const children = grid.areas.find((a) => a.card === "children");
        expect(household?.colStart).toBe(7);
        expect(children?.colStart).toBe(7);
        expect(children!.rowStart).toBeGreaterThanOrEqual(household!.rowStart + household!.rowSpan);
    });

    it("preserves column order after move + normalize", () => {
        let grid = addCardToGrid(BASE_GRID, "household", { colSpan: 6, rowSpan: 3 });
        grid = addCardToGrid(grid, "children", { colSpan: 6, rowSpan: 3 });
        grid = moveArea(grid, "household", 7, 1);
        grid = moveArea(grid, "children", 7, 1);
        grid = normalizeGridColumnStacking(grid);
        const rightColumn = grid.areas
            .filter((a) => a.colStart === 7)
            .sort((a, b) => a.rowStart - b.rowStart)
            .map((a) => a.card);
        expect(rightColumn).toEqual(["household", "children"]);
    });
});
