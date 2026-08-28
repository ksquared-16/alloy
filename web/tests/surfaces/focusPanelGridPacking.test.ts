/**
 * GRID PACKING — a new card must take a slot that already exists before opening a new row.
 *
 * Authoring an 8/12 and then a 4/12 used to produce two rows with a four-column hole beside the
 * first: `addCardToGrid` defaulted every card to the full width at `nextFreeRow`, so the packing an
 * operator obviously meant was available and never taken.
 *
 * These are the packings the instruction names, asserted on the PURE ops rather than through the
 * canvas, because that is where the placement decision is actually made.
 */

import { describe, expect, it } from "vitest";

import {
    addCardToGrid,
    removeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

const EMPTY: FocusPanelGridLayout = { columns: 12, areas: [] };

/** Cards on the same row, left to right — the shape an operator sees. */
function rows(grid: FocusPanelGridLayout): string[] {
    const byRow = new Map<number, typeof grid.areas>();
    for (const a of grid.areas) byRow.set(a.rowStart, [...(byRow.get(a.rowStart) ?? []), a]);
    return [...byRow.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([, areas]) =>
            areas
                .slice()
                .sort((a, b) => a.colStart - b.colStart)
                .map((a) => `${a.card}@${a.colStart}+${a.colSpan}`)
                .join(" "),
        );
}

describe("focus panel grid packing", () => {
    it("packs 8/12 + 4/12 onto one row with no gap", () => {
        let g = addCardToGrid(EMPTY, "financials", { colSpan: 8, rowSpan: 1 });
        g = addCardToGrid(g, "readiness_kpi", { colSpan: 4, rowSpan: 1 });
        expect(rows(g)).toEqual(["financials@1+8 readiness_kpi@9+4"]);
    });

    it("packs two 6/12 cards onto one row", () => {
        let g = addCardToGrid(EMPTY, "children", { colSpan: 6, rowSpan: 1 });
        g = addCardToGrid(g, "staff", { colSpan: 6, rowSpan: 1 });
        expect(rows(g)).toEqual(["children@1+6 staff@7+6"]);
    });

    it("packs three 4/12 cards onto one row", () => {
        let g = addCardToGrid(EMPTY, "household", { colSpan: 4, rowSpan: 1 });
        g = addCardToGrid(g, "health_safety", { colSpan: 4, rowSpan: 1 });
        g = addCardToGrid(g, "scheduling", { colSpan: 4, rowSpan: 1 });
        expect(rows(g)).toEqual(["household@1+4 health_safety@5+4 scheduling@9+4"]);
    });

    it("opens a new row only when the width genuinely does not fit", () => {
        let g = addCardToGrid(EMPTY, "financials", { colSpan: 8, rowSpan: 1 });
        // 8 + 6 > 12: there is no slot, so a new row is the right answer.
        g = addCardToGrid(g, "children", { colSpan: 6, rowSpan: 1 });
        expect(rows(g)).toEqual(["financials@1+8", "children@1+6"]);
    });

    it("gives a full-row card its own row", () => {
        let g = addCardToGrid(EMPTY, "business_process", { colSpan: 12, rowSpan: 1 });
        g = addCardToGrid(g, "financials", { colSpan: 8, rowSpan: 1 });
        expect(rows(g)).toEqual(["business_process@1+12", "financials@1+8"]);
    });

    it("never overlaps: a taller card does not drop into a one-row gap", () => {
        // A 6-wide, 2-row card at column 1, and a 6-wide 1-row card beside it on row 1 only.
        let g = addCardToGrid(EMPTY, "children", { colSpan: 6, rowSpan: 2 });
        g = addCardToGrid(g, "staff", { colSpan: 6, rowSpan: 1 });
        // The next 6-wide 2-row card cannot use row 2 columns 7-12 (only one free row there).
        g = addCardToGrid(g, "household", { colSpan: 6, rowSpan: 2 });
        const overlaps = g.areas.some((a) =>
            g.areas.some(
                (b) =>
                    a !== b
                    && a.colStart < b.colStart + b.colSpan
                    && b.colStart < a.colStart + a.colSpan
                    && a.rowStart < b.rowStart + b.rowSpan
                    && b.rowStart < a.rowStart + a.rowSpan,
            ),
        );
        expect(overlaps).toBe(false);
    });

    it("repacks sensibly when a card is removed", () => {
        let g = addCardToGrid(EMPTY, "financials", { colSpan: 8, rowSpan: 1 });
        g = addCardToGrid(g, "readiness_kpi", { colSpan: 4, rowSpan: 1 });
        g = addCardToGrid(g, "children", { colSpan: 6, rowSpan: 1 });
        g = removeArea(g, "readiness_kpi");
        // Removing the 4/12 leaves the 8/12 and the 6/12 — and nothing overlaps.
        expect(g.areas.map((a) => a.card).sort()).toEqual(["children", "financials"]);
        const cols = g.areas.map((a) => a.colStart + a.colSpan - 1);
        expect(Math.max(...cols)).toBeLessThanOrEqual(12);
    });
});
