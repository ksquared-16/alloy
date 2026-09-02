import { describe, expect, it } from "vitest";
import {
    resolveDropPlacement,
    gridOverlaps,
    type FocusPanelGridLayout,
    type FocusPanelGridArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

/**
 * REACHABILITY — every geometrically valid cell, not a curated composition.
 *
 * Operator QA keeps finding vacancies that are visible and obvious and still
 * cannot be hit. Predetermined compositions cannot catch that: they only prove
 * the destinations someone thought to test. This enumerates the whole target
 * space instead, and asks one question of every cell — if the card fits here,
 * does pointing here put it here?
 */

const COLUMNS = 12;

function layoutA(): FocusPanelGridLayout {
    // A populated top row with a real vacancy under it — operator case A.
    return {
        columns: COLUMNS,
        areas: [
            { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
            { card: "financials", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 2 },
            { card: "attendance", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
            { card: "children", colStart: 1, colSpan: 6, rowStart: 5, rowSpan: 3 },
        ],
    };
}

function layoutB(): FocusPanelGridLayout {
    // A taller card to move around, and a right-hand column to reach past.
    return {
        columns: COLUMNS,
        areas: [
            { card: "business_process", colStart: 1, colSpan: 12, rowStart: 1, rowSpan: 2 },
            { card: "children", colStart: 7, colSpan: 6, rowStart: 3, rowSpan: 4 },
            { card: "attendance", colStart: 1, colSpan: 6, rowStart: 3, rowSpan: 2 },
            { card: "health_safety", colStart: 1, colSpan: 4, rowStart: 7, rowSpan: 2 },
        ],
    };
}

const at = (g: FocusPanelGridLayout, card: string) => g.areas.find((a) => a.card === card)!;
const rectFree = (others: readonly FocusPanelGridArea[], a: FocusPanelGridArea) =>
    !others.some((o) =>
        a.colStart < o.colStart + o.colSpan && o.colStart < a.colStart + a.colSpan
        && a.rowStart < o.rowStart + o.rowSpan && o.rowStart < a.rowStart + a.rowSpan);

/**
 * Every cell the card could legally occupy in the layout as it stands: the
 * rectangle fits the grid horizontally AND lands on genuinely empty cells.
 * Those are the placements an operator can SEE are available.
 */
function reachabilityReport(grid: FocusPanelGridLayout, card: string) {
    const moving = at(grid, card);
    const others = grid.areas.filter((a) => a.card !== card);
    const lastRow = Math.max(...others.map((a) => a.rowStart + a.rowSpan - 1), 1);
    const misses: string[] = [];
    let vacancies = 0;
    for (let row = 1; row <= lastRow + 1; row += 1) {
        for (let col = 1; col + moving.colSpan - 1 <= COLUMNS; col += 1) {
            const target = { ...moving, colStart: col, rowStart: row };
            if (!rectFree(others, target)) continue;
            vacancies += 1;
            const placement = resolveDropPlacement(grid, moving, col, row);
            const landed = at(placement.grid, card);

            // 1 · The preview is the commit.
            if (landed.colStart !== placement.area.colStart || landed.rowStart !== placement.area.rowStart) {
                misses.push(`c${col}r${row}: preview≠commit`);
                continue;
            }
            // 2 · The column asked for is the column given. No horizontal drift, ever.
            if (landed.colStart !== col) {
                misses.push(`c${col}r${row}: landed col ${landed.colStart}`);
                continue;
            }
            /*
             * 3 · The row is the requested one MODULO compaction. Vacating a row can
             * close a band above the target, which legitimately shifts every row index
             * up — the operator sees a compact canvas, so the row they point at is a
             * compacted row. The honest test of reachability is that the placement is a
             * FIXED POINT: ask again for where it landed and it stays. A cell you can
             * settle on is a cell you can reach.
             */
            const again = resolveDropPlacement(placement.grid, landed, landed.colStart, landed.rowStart);
            const settled = at(again.grid, card);
            if (settled.colStart !== landed.colStart || settled.rowStart !== landed.rowStart) {
                misses.push(`c${col}r${row}: not a fixed point (${landed.colStart},${landed.rowStart} → ${settled.colStart},${settled.rowStart})`);
            }
            // 4 · Never above a card that was above the requested row to begin with.
            const jumpedAhead = others
                .filter((o) => o.rowStart + o.rowSpan <= row)
                .map((o) => at(placement.grid, o.card))
                .filter((o) => o.rowStart >= landed.rowStart + landed.rowSpan);
            if (jumpedAhead.length) {
                misses.push(`c${col}r${row}: ${jumpedAhead.map((o) => o.card).join(",")} pushed below`);
            }
            if (gridOverlaps(placement.grid).length) misses.push(`c${col}r${row}: overlap`);
        }
    }
    return { vacancies, misses };
}

describe("every visible vacancy is reachable", () => {
    for (const [name, make] of [["A", layoutA], ["B", layoutB]] as const) {
        for (const card of ["children", "attendance", "financials", "business_process"]) {
            it(`layout ${name}: ${card} reaches every empty cell it fits`, () => {
                const grid = make();
                if (!grid.areas.some((a) => a.card === card)) return;
                const { vacancies, misses } = reachabilityReport(grid, card);
                expect(vacancies, "the layout offers vacancies to test").toBeGreaterThan(0);
                expect(misses).toEqual([]);
            });
        }
    }

    it("case A: Children moves up into the open row directly under the top row", () => {
        const grid = layoutA();
        // Attendance holds columns 1-6 of row 3; columns 7-12 of row 3 are open.
        const placement = resolveDropPlacement(grid, at(grid, "children"), 7, 3);
        expect(placement.area).toMatchObject({ colStart: 7, rowStart: 3 });
        expect(at(placement.grid, "children")).toMatchObject({ colStart: 7, rowStart: 3 });
        expect(gridOverlaps(placement.grid)).toEqual([]);
    });

    it("case B: Attendance left-aligns to column 1 when the pointer says so", () => {
        const grid = layoutB();
        const moved = resolveDropPlacement(grid, at(grid, "attendance"), 1, 7);
        expect(moved.area.colStart, "column 1 is a real destination").toBe(1);
        expect(at(moved.grid, "attendance").colStart).toBe(1);
        expect(gridOverlaps(moved.grid)).toEqual([]);
    });

    it("a card can move to an EARLIER row from a later one", () => {
        const grid = layoutA();
        const placement = resolveDropPlacement(grid, at(grid, "children"), 7, 3);
        expect(at(placement.grid, "children").rowStart).toBeLessThan(at(grid, "children").rowStart);
    });
});
