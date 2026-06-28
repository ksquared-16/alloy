import { describe, expect, it } from "vitest";

import {
    buildFocusPanelGridRows,
    computeFocusPanelGridColumns,
    resolveFocusPanelCellGridSpan,
    resolveFocusPanelSectionSpan,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardGrid";
import {
    footprintToGridSpan,
    system5FootprintForCard,
} from "@/lib/adminV2/runtime/focusPanel/system5OperationalSurfaceSpec";

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

describe("card footprint system", () => {
    it("assigns the documented Core Four default footprints", () => {
        expect(system5FootprintForCard("household")).toBe("wide");
        expect(system5FootprintForCard("children")).toBe("wide");
        expect(system5FootprintForCard("readiness_kpi")).toBe("medium");
        expect(system5FootprintForCard("current_work")).toBe("narrow");
    });

    it("maps footprints onto the current grid span vocabulary", () => {
        expect(footprintToGridSpan("wide")).toBe(2);
        expect(footprintToGridSpan("full")).toBe("row");
        // narrow + medium both collapse to one column until the finer base lands.
        expect(footprintToGridSpan("medium")).toBe(1);
        expect(footprintToGridSpan("narrow")).toBe(1);
    });

    it("falls back to the default footprint for unconfigured cards", () => {
        expect(system5FootprintForCard("notes")).toBe("medium");
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
