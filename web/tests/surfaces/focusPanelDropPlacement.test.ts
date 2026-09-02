import { describe, expect, it } from "vitest";
import {
    resolveDropPlacement,
    gridOverlaps,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

const at = (grid: FocusPanelGridLayout, card: string) =>
    grid.areas.find((a) => a.card === card)!;

/** Process 2/3 top-left, Financials 1/3 parked below it — the reported QA layout. */
function processAndFinancials(): FocusPanelGridLayout {
    return {
        columns: 12,
        areas: [
            { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 3 },
            { card: "financials", colStart: 1, colSpan: 4, rowStart: 4, rowSpan: 3 },
        ],
    };
}

describe("resolveDropPlacement — the drop the operator was shown", () => {
    it("drags Financials into the open top-right and lands it beside Process", () => {
        const grid = processAndFinancials();
        const placement = resolveDropPlacement(grid, at(grid, "financials"), 9, 1);

        expect(placement.area).toMatchObject({ colStart: 9, colSpan: 4, rowStart: 1 });
        expect(at(placement.grid, "financials")).toMatchObject({ colStart: 9, rowStart: 1 });
        // Process 2/3 + Financials 1/3, one row, nothing else moved.
        expect(at(placement.grid, "business_process")).toMatchObject({ colStart: 1, rowStart: 1 });
        expect(placement.reflowed).toBe(false);
        expect(gridOverlaps(placement.grid)).toEqual([]);
    });

    it("finds that vacancy from anywhere on the row — the pointer need not hit column 9", () => {
        const grid = processAndFinancials();
        for (let col = 1; col <= 12; col += 1) {
            const placement = resolveDropPlacement(grid, at(grid, "financials"), col, 1);
            expect(at(placement.grid, "financials")).toMatchObject({ colStart: 9, rowStart: 1 });
        }
    });

    it("a card holding part of a row does not block the row's free columns", () => {
        const grid = processAndFinancials();
        // Row 1 columns 9-12 are empty; Process must not reserve them by being early.
        const placement = resolveDropPlacement(grid, at(grid, "financials"), 10, 1);
        expect(placement.area.rowStart).toBe(1);
        expect(placement.reflowed).toBe(false);
    });

    it("previewed location IS the persisted location, over the whole reachable canvas", () => {
        const grid = processAndFinancials();
        const moving = at(grid, "financials");
        for (let col = -2; col <= 15; col += 1) {
            for (let row = 1; row <= 8; row += 1) {
                const placement = resolveDropPlacement(grid, moving, col, row);
                const landed = at(placement.grid, "financials");
                expect({ c: landed.colStart, r: landed.rowStart }).toEqual({
                    c: placement.area.colStart,
                    r: placement.area.rowStart,
                });
                expect(gridOverlaps(placement.grid)).toEqual([]);
            }
        }
    });

    it("never reorders an unrelated card while a vacancy exists", () => {
        const grid = processAndFinancials();
        const moving = at(grid, "financials");
        for (let col = 1; col <= 12; col += 1) {
            for (let row = 1; row <= 8; row += 1) {
                const placement = resolveDropPlacement(grid, moving, col, row);
                expect(at(placement.grid, "business_process")).toMatchObject({
                    colStart: 1,
                    rowStart: 1,
                    colSpan: 8,
                });
            }
        }
    });

    it("keeps the dragged card's own width — a drop never resizes it", () => {
        const grid = processAndFinancials();
        const moving = at(grid, "financials");
        for (let col = 1; col <= 12; col += 1) {
            const placement = resolveDropPlacement(grid, moving, col, 1);
            expect(placement.area.colSpan).toBe(4);
            expect(placement.area.rowSpan).toBe(3);
        }
    });

    it("packs every supported span combination into the row that has room", () => {
        // 1/3 = 4, 1/2 = 6, 2/3 = 8, full = 12 — the widths the builder authors.
        const combos: Array<[number, number]> = [
            [8, 4], [4, 8], [6, 6], [4, 4], [8, 8], [12, 4], [6, 4],
        ];
        for (const [anchorSpan, movingSpan] of combos) {
            const grid: FocusPanelGridLayout = {
                columns: 12,
                areas: [
                    { card: "business_process", colStart: 1, colSpan: anchorSpan, rowStart: 1, rowSpan: 2 },
                    { card: "financials", colStart: 1, colSpan: movingSpan, rowStart: 3, rowSpan: 2 },
                ],
            };
            // Point exactly at the first column past the anchor — the operator's "beside it".
            const placement = resolveDropPlacement(grid, at(grid, "financials"), anchorSpan + 1, 1);
            const landed = at(placement.grid, "financials");
            const fits = anchorSpan + movingSpan <= 12;
            // Room on row 1 → same row beside the anchor. No room → below it, never on top of it.
            expect(landed.rowStart).toBe(fits ? 1 : 3);
            if (fits) expect(landed.colStart).toBe(anchorSpan + 1);
            expect(at(placement.grid, "business_process").rowStart).toBe(1);
            expect(gridOverlaps(placement.grid)).toEqual([]);
        }
    });

    it("moves back out of the row as directly as it moved in", () => {
        const grid = processAndFinancials();
        const placed = resolveDropPlacement(grid, at(grid, "financials"), 9, 1).grid;
        expect(at(placed, "financials")).toMatchObject({ colStart: 9, rowStart: 1 });

        const back = resolveDropPlacement(placed, at(placed, "financials"), 1, 4);
        expect(at(back.grid, "financials")).toMatchObject({ colStart: 1, rowStart: 4 });
        expect(at(back.grid, "business_process")).toMatchObject({ colStart: 1, rowStart: 1 });
        expect(gridOverlaps(back.grid)).toEqual([]);
    });

    it("reflows only when the canvas has no room, and keeps the invariant", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "business_process", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 2 },
                { card: "attendance", colStart: 1, colSpan: 12, rowStart: 3, rowSpan: 2 },
                { card: "financials", colStart: 1, colSpan: 12, rowStart: 5, rowSpan: 2 },
            ],
        };
        const placement = resolveDropPlacement(grid, at(grid, "financials"), 1, 1);
        expect(gridOverlaps(placement.grid)).toEqual([]);
        expect(at(placement.grid, "financials")).toMatchObject({
            colStart: placement.area.colStart,
            rowStart: placement.area.rowStart,
        });
    });
});
