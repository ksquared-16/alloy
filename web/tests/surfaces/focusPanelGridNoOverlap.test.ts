/**
 * THE INVARIANT: at rest, no two cards occupy the same cell.
 *
 * It was never enforced. `sameStackColumn` is a PREFERENCE that decides which
 * cards read as one visual column, and it was also the only thing standing
 * between the model and an overlap — so two cards that genuinely collided but
 * failed the "same column" test were left on top of each other. Both cases below
 * were produced by ordinary drags in the real builder.
 */
import { describe, expect, it } from "vitest";

import {
    addCardToGrid,
    gridOverlaps,
    moveArea,
    normalizeGridColumnStacking,
    placeArea,
    removeArea,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";
import type {
    FocusPanelCardKey,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";
import type { FocusPanelGridLayout } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const grid = (areas: Array<[string, number, number, number, number]>): FocusPanelGridLayout => ({
    columns: 12,
    areas: areas.map(([card, colStart, colSpan, rowStart, rowSpan]) => ({
        card: card as FocusPanelCardKey, colStart, colSpan, rowStart, rowSpan,
    })),
});

describe("grid overlap invariant", () => {
    it("the wide-vs-offset case the column heuristic could not see", () => {
        // attendance 1/8 and staff 7/6 share columns 7–8. Overlap is 2 columns,
        // the narrower span is 6, and 2 < 80% of 6 — so they are not "the same
        // column" and nothing pushed them apart.
        const before = grid([["attendance", 1, 8, 8, 2], ["staff", 7, 6, 8, 2]]);
        expect(gridOverlaps(before)).toHaveLength(1);
        expect(gridOverlaps(normalizeGridColumnStacking(before))).toEqual([]);
    });

    it("the full-row-vs-corner case the column heuristic could not see", () => {
        // business_process 1/12 and health_safety 9/4: colStarts are 8 apart, so
        // the heuristic refused them as one column while they plainly collide.
        const before = grid([["business_process", 1, 12, 4, 2], ["health_safety", 9, 4, 3, 2]]);
        expect(gridOverlaps(before)).toHaveLength(1);
        expect(gridOverlaps(normalizeGridColumnStacking(before))).toEqual([]);
    });

    it("resolving one collision cannot create another", () => {
        // Pushing the first card below the second must not land it on a third.
        const before = grid([
            ["a", 1, 12, 1, 2], ["b", 1, 6, 1, 2], ["c", 7, 6, 2, 2], ["d", 1, 4, 3, 2],
        ]);
        const after = normalizeGridColumnStacking(before);
        expect(gridOverlaps(after)).toEqual([]);
        expect(after.areas).toHaveLength(4);
    });

    it("no move can produce an overlap, over the whole reachable grid", () => {
        // The property, not a sample: every card, to every cell it can start at.
        let g = grid([
            ["business_process", 1, 12, 1, 2],
            ["financials", 1, 8, 3, 2],
            ["health_safety", 9, 4, 3, 2],
            ["attendance", 1, 8, 5, 2],
            ["staff", 7, 6, 8, 2],
            ["children", 1, 6, 10, 4],
            ["household", 1, 4, 14, 3],
        ]);
        expect(gridOverlaps(g)).toEqual([]);
        for (const card of g.areas.map((a) => a.card)) {
            for (let col = 1; col <= 12; col += 1) {
                for (let row = 1; row <= 16; row += 1) {
                    const moved = moveArea(g, card, col, row);
                    const bad = gridOverlaps(moved);
                    expect(bad, `${card} → c${col} r${row}: ${JSON.stringify(bad)}`).toEqual([]);
                    // Every card survives the move — a resolution must never drop one.
                    expect(moved.areas).toHaveLength(g.areas.length);
                }
            }
        }
    });

    it("add and remove keep the invariant too", () => {
        let g: FocusPanelGridLayout = { columns: 12, areas: [] };
        for (const [key, span] of [["business_process", 12], ["financials", 8], ["health_safety", 4],
            ["attendance", 8], ["staff", 6], ["children", 6], ["household", 4]] as const) {
            g = addCardToGrid(g, key as FocusPanelCardKey, { colSpan: span, rowSpan: 2 });
            expect(gridOverlaps(g)).toEqual([]);
        }
        for (const card of ["financials", "staff", "children"] as FocusPanelCardKey[]) {
            g = removeArea(g, card);
            expect(gridOverlaps(g)).toEqual([]);
        }
    });

    it("a direct placement that collides is resolved rather than accepted", () => {
        const g = grid([["a", 1, 6, 1, 2], ["b", 7, 6, 1, 2]]);
        const collided = placeArea(g, { card: "c" as FocusPanelCardKey, colStart: 4, colSpan: 6, rowStart: 1, rowSpan: 2 });
        expect(gridOverlaps(collided)).toEqual([]);
        expect(collided.areas).toHaveLength(3);
    });
});
