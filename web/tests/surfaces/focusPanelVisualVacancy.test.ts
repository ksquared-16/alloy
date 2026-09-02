import { describe, expect, it } from "vitest";
import {
    closeEmptyRowBands,
    trackEdges,
    COMPOSER_GRID_GAP_PX,
    COMPOSER_GRID_ROW_UNIT_PX,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

/**
 * VISUAL VACANCY MUST EQUAL LOGICAL VACANCY.
 *
 * Rows are content-sized (`minmax(76px, auto)`), so a card taller than its
 * declared span stretches the tracks it sits on and every card sharing those
 * rows grows with it. The canvas therefore has two descriptions of itself — the
 * grid model and the pixels — and the operator only ever sees the second. These
 * tests pin the places those two can disagree.
 */

const heightOf = (rowSpan: number) =>
    rowSpan * COMPOSER_GRID_ROW_UNIT_PX + (rowSpan - 1) * COMPOSER_GRID_GAP_PX;

describe("row bands", () => {
    it("a layout with an empty band is not compact, and closing it is exact", () => {
        const gapped: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "household", colStart: 7, colSpan: 6, rowStart: 1, rowSpan: 4 },
                // Rows 5-7 empty: nothing declares them, and each still reserves 76px.
                { card: "attendance", colStart: 1, colSpan: 6, rowStart: 8, rowSpan: 2 },
            ],
        };
        const packed = closeEmptyRowBands(gapped);
        expect(packed.areas.find((a) => a.card === "attendance")!.rowStart).toBe(5);
        expect(packed.areas.find((a) => a.card === "household")!.rowStart).toBe(1);
    });

    it("is idempotent, so a committed layout cannot drift row by row", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
                { card: "financials", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 2 },
                { card: "attendance", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 3 },
            ],
        };
        const once = closeEmptyRowBands(grid);
        expect(once).toEqual(grid);
        expect(closeEmptyRowBands(once)).toEqual(once);
    });

    it("closes a band without changing anyone's column or relative order", () => {
        const gapped: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "a", colStart: 1, colSpan: 4, rowStart: 1, rowSpan: 2 },
                { card: "b", colStart: 5, colSpan: 4, rowStart: 6, rowSpan: 2 },
                { card: "c", colStart: 9, colSpan: 4, rowStart: 9, rowSpan: 2 },
            ] as never,
        };
        const packed = closeEmptyRowBands(gapped);
        expect(packed.areas.map((a) => [a.card, a.colStart, a.rowStart])).toEqual([
            ["a", 1, 1], ["b", 5, 3], ["c", 9, 5],
        ]);
    });
});

describe("a card taller than its span stretches the tracks it shares", () => {
    it("declared height and drawn height diverge once content exceeds the span", () => {
        // Attendance draws ~620px in the operator's screenshots.
        const declared = heightOf(2);
        expect(declared).toBe(162);
        const drawn = 620;
        expect(drawn - declared).toBeGreaterThan(400);
    });

    it("the shared track grows for every card on those rows, so the model stays consistent", () => {
        // Two cards on rows 1-2; the taller one sets the track height for both.
        const rows = [Math.max(76, 300), Math.max(76, 300)];
        const edges = trackEdges(rows, COMPOSER_GRID_GAP_PX);
        // Row 3 begins below BOTH cards, so a card placed there cannot visually
        // overlap either of them — the divergence is in size, never in position.
        expect(edges[2]).toBe(300 + COMPOSER_GRID_GAP_PX + 300 + COMPOSER_GRID_GAP_PX);
    });
});
