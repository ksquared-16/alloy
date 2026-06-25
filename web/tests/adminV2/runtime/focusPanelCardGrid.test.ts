import { describe, expect, it } from "vitest";

import {
    buildFocusPanelGridRows,
    computeFocusPanelGridColumns,
    resolveFocusPanelCellGridSpan,
    resolveFocusPanelSectionSpan,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";

describe("computeFocusPanelGridColumns", () => {
    it("returns 4 columns at wide panel width", () => {
        expect(computeFocusPanelGridColumns(1040)).toBe(4);
        expect(computeFocusPanelGridColumns(1200)).toBe(4);
    });

    it("collapses through 3, 2, and 1 columns", () => {
        expect(computeFocusPanelGridColumns(900)).toBe(3);
        expect(computeFocusPanelGridColumns(600)).toBe(2);
        expect(computeFocusPanelGridColumns(400)).toBe(1);
    });
});

describe("resolveFocusPanelCellGridSpan", () => {
    it("full row spans all columns", () => {
        expect(resolveFocusPanelCellGridSpan("row", 4)).toBe(4);
    });

    it("span 2 caps at available columns", () => {
        expect(resolveFocusPanelCellGridSpan(2, 4)).toBe(2);
        expect(resolveFocusPanelCellGridSpan(2, 1)).toBe(1);
    });
});

describe("resolveFocusPanelSectionSpan", () => {
    it("maps relationship sections to span 2", () => {
        expect(resolveFocusPanelSectionSpan("household")).toBe(2);
        expect(resolveFocusPanelSectionSpan("inquiry_children")).toBe(2);
    });

    it("maps communications to full row", () => {
        expect(resolveFocusPanelSectionSpan("communications")).toBe("row");
    });
});

describe("buildFocusPanelGridRows", () => {
    it("pairs adjacent span-2 sections on one row", () => {
        const rows = buildFocusPanelGridRows(["household", "inquiry_children"]);
        expect(rows).toHaveLength(1);
        expect(rows[0]?.cells).toHaveLength(2);
    });

    it("isolates full-row sections", () => {
        const rows = buildFocusPanelGridRows(["attention", "communications", "documents"]);
        expect(rows.some((r) => r.cells[0]?.key === "communications")).toBe(true);
        expect(rows.find((r) => r.cells[0]?.key === "communications")?.cells[0]?.span).toBe("row");
    });
});
