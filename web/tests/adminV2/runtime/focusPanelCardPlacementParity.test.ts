import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
    addCardToGrid,
    moveArea,
    normalizeGridColumnStacking,
    placeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { planPublishedLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

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

    it("Summary prefers lanes from published grid so Builder config and /work-unit share flow", () => {
        const modeGrid = readFileSync(
            join(process.cwd(), "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx"),
            "utf8",
        );
        expect(modeGrid).toContain("preferLanesFromGrid={Boolean(publishedLayout?.grid) || mode === \"work\"}");

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
        const plan = planPublishedLayout(layout as never, 1200, { preferLanesFromGrid: true });
        expect(plan.strategy).toBe("lanes");
        expect(plan.lanes.length).toBe(2);
        const right = plan.lanes.find((lane) => lane.cards.some((c) => c.key === "household"));
        expect(right?.cards.map((c) => c.key)).toEqual(["household", "children"]);
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
