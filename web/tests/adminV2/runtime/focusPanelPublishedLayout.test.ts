import { describe, expect, it } from "vitest";

import {
    CELL_WIDTH_UNITS,
    PUBLISHED_LAYOUT_MIN_PX,
    isFocusPanelPublishedLayout,
    planPublishedLayout,
    publishedLayoutReadingOrder,
    readFocusPanelPublishedLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

const LAYOUT: FocusPanelPublishedLayout = {
    rows: [
        { cells: [{ width: "2/3", cards: ["children"] }, { width: "1/3", cards: ["current_work"] }] },
        { cells: [{ width: "1/2", cards: ["household"] }, { width: "1/2", cards: ["readiness_kpi"] }] },
    ],
};

describe("focusPanelPublishedLayout", () => {
    it("maps operator size intents to 12-unit columns (legacy fractions still alias)", () => {
        expect(CELL_WIDTH_UNITS).toMatchObject({
            quarter: 3,
            third: 4,
            half: 6,
            twoThirds: 8,
            full: 12,
            // legacy aliases — older published docs keep rendering
            "1/3": 4,
            "1/2": 6,
            "2/3": 8,
        });
    });

    it("named size intents render to the same units as the legacy fractions", () => {
        const named: FocusPanelPublishedLayout = {
            rows: [{ cells: [{ width: "twoThirds", cards: ["children"] }, { width: "third", cards: ["current_work"] }] }],
        };
        const plan = planPublishedLayout(named, 900);
        expect(plan.rows[0]!.cells.map((c) => c.widthUnits)).toEqual([8, 4]);
    });

    it("Fill absorbs the row's remaining units (no dead whitespace)", () => {
        const filled: FocusPanelPublishedLayout = {
            rows: [
                // Quarter (3) + Fill → fill takes the remaining 9.
                { cells: [{ width: "quarter", cards: ["household"] }, { width: "fill", cards: ["children"] }] },
                // Two fills split the full row evenly (6 / 6).
                { cells: [{ width: "fill", cards: ["readiness_kpi"] }, { width: "fill", cards: ["current_work"] }] },
            ],
        };
        const plan = planPublishedLayout(filled, 900);
        expect(plan.rows[0]!.cells.map((c) => c.widthUnits)).toEqual([3, 9]);
        expect(plan.rows[1]!.cells.map((c) => c.widthUnits)).toEqual([6, 6]);
        // Each row sums to the column base — fits together, no leftover.
        plan.rows.forEach((r) => expect(r.cells.reduce((s, c) => s + c.widthUnits, 0)).toBe(12));
    });

    it("composes a column-regular grid into continuous LANES (no floating-island whitespace)", () => {
        // The canonical authored layout: Household/Children left (twoThirds), Readiness/
        // Current Work right (third) — same column widths down each row → column-regular.
        const grid: FocusPanelPublishedLayout = {
            rows: [
                { cells: [{ width: "twoThirds", cards: ["household"] }, { width: "third", cards: ["readiness_kpi"] }] },
                { cells: [{ width: "twoThirds", cards: ["children"] }, { width: "third", cards: ["current_work"] }] },
            ],
        };
        const plan = planPublishedLayout(grid, 900);
        // Column-major: each column becomes one continuous lane that fills its width.
        expect(plan.strategy).toBe("lanes");
        expect(plan.lanes.map((l) => [l.widthUnits, l.cards.map((c) => c.key)])).toEqual([
            [8, ["household", "children"]],
            [4, ["readiness_kpi", "current_work"]],
        ]);
        // The literal row plan stays available (back-compat) but the renderer uses lanes.
        expect(plan.rows).toHaveLength(2);
    });

    it("carries a cell's reserved room (height) onto the first card of its lane segment", () => {
        const grid: FocusPanelPublishedLayout = {
            rows: [
                { cells: [{ width: "half", cards: ["household"], height: "tall" }, { width: "half", cards: ["readiness_kpi"] }] },
                { cells: [{ width: "half", cards: ["children"] }, { width: "half", cards: ["current_work"] }] },
            ],
        };
        const plan = planPublishedLayout(grid, 900);
        expect(plan.strategy).toBe("lanes");
        // household (tall) reserves 268px; children (no height) is natural.
        expect(plan.lanes[0]!.cards).toEqual([
            { key: "household", minHeightPx: 268 },
            { key: "children", minHeightPx: undefined },
        ]);
    });

    it("stays row-major for an IRREGULAR layout (banner row over a multi-column row)", () => {
        const banner: FocusPanelPublishedLayout = {
            rows: [
                { cells: [{ width: "full", cards: ["household"] }] },
                { cells: [{ width: "half", cards: ["children"] }, { width: "half", cards: ["readiness_kpi"] }] },
            ],
        };
        const plan = planPublishedLayout(banner, 900);
        expect(plan.strategy).toBe("rows");
        expect(plan.lanes).toEqual([]);
        expect(plan.rows).toHaveLength(2);
    });

    it("honors the published rows/widths EXACTLY when wide", () => {
        const plan = planPublishedLayout(LAYOUT, 900);
        expect(plan.collapsed).toBe(false);
        expect(plan.rows).toHaveLength(2);
        expect(plan.rows[0]!.cells.map((c) => [c.widthUnits, c.cards])).toEqual([
            [8, ["children"]],
            [4, ["current_work"]],
        ]);
        expect(plan.rows[1]!.cells.map((c) => [c.widthUnits, c.cards])).toEqual([
            [6, ["household"]],
            [6, ["readiness_kpi"]],
        ]);
    });

    it("collapses to a single column (reading order) when too narrow", () => {
        const plan = planPublishedLayout(LAYOUT, PUBLISHED_LAYOUT_MIN_PX - 1);
        expect(plan.collapsed).toBe(true);
        expect(plan.rows).toHaveLength(4);
        expect(plan.rows.every((r) => r.cells.length === 1 && r.cells[0]!.widthUnits === 12)).toBe(true);
        expect(plan.rows.flatMap((r) => r.cells[0]!.cards)).toEqual([
            "children",
            "current_work",
            "household",
            "readiness_kpi",
        ]);
    });

    it("supports vertically stacked cards in one cell (column stacking)", () => {
        const stacked: FocusPanelPublishedLayout = {
            rows: [
                {
                    cells: [
                        { width: "1/2", cards: ["household"] },
                        { width: "1/2", cards: ["readiness_kpi", "current_work"] },
                    ],
                },
            ],
        };
        const plan = planPublishedLayout(stacked, 900);
        expect(plan.rows[0]!.cells[1]!.cards).toEqual(["readiness_kpi", "current_work"]);
        expect(publishedLayoutReadingOrder(stacked)).toEqual(["household", "readiness_kpi", "current_work"]);
    });

    it("validates layout shape (defensive for stored docs)", () => {
        expect(isFocusPanelPublishedLayout(LAYOUT)).toBe(true);
        expect(isFocusPanelPublishedLayout(null)).toBe(false);
        expect(isFocusPanelPublishedLayout({ rows: [] })).toBe(false);
        expect(isFocusPanelPublishedLayout({ rows: [{ cells: [] }] })).toBe(false);
        expect(isFocusPanelPublishedLayout({ rows: [{ cells: [{ width: "3/4", cards: ["x"] }] }] })).toBe(false);
        expect(isFocusPanelPublishedLayout({ rows: [{ cells: [{ width: "full", cards: [] }] }] })).toBe(false);
    });

    it("reads a valid layout from doc metadata, else null", () => {
        expect(readFocusPanelPublishedLayout({ metadata: { focusPanelLayout: LAYOUT } })).toEqual(LAYOUT);
        expect(readFocusPanelPublishedLayout({ metadata: {} })).toBeNull();
        expect(readFocusPanelPublishedLayout(null)).toBeNull();
        expect(readFocusPanelPublishedLayout({ metadata: { focusPanelLayout: { rows: [] } } })).toBeNull();
    });
});
