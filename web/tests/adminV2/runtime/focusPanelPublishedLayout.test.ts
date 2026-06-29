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
    it("maps fractional widths to 12-unit columns", () => {
        expect(CELL_WIDTH_UNITS).toEqual({ "1/3": 4, "1/2": 6, "2/3": 8, full: 12 });
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
