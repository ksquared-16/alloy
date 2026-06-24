/**
 * Regression: drawer section-flow rows must never force horizontal overflow.
 *
 * A ½ + ½ row (or stacked-right row) that contains a full-width child table with
 * a min-width must keep its grid tracks bounded to the available drawer width.
 * The contract is enforced by `minmax(0, Nfr)` grid tracks + `min-w-0`/`max-w-full`
 * peer cells in the shared `LayoutEditorSectionFlowView` primitive.
 */

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";

import LayoutEditorSectionFlowView from "@/components/layout/LayoutEditorSectionFlowView";
import {
    sectionRowGroupGridStyle,
    sectionStackedRowGroupGridStyle,
} from "@/lib/layout/layoutEditorSectionLayout";
import {
    LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
    LAYOUT_RUNTIME_SECTION_STACK_CLASS,
} from "@/lib/layout/runtime/layoutRuntimeSurfaceStyles";
import type { LayoutSection } from "@/lib/layout/layoutV2";

function halfRowSections(): LayoutSection[] {
    const make = (key: string, span: number): LayoutSection => ({
        id: `sec_${key}`,
        key,
        title: key,
        rows: [{ id: `row_${key}`, columns: [{ id: `col_${key}`, width: 12, items: [] }] }],
        metadata: { layoutEditorSectionRowGroup: "overflow_no_clip_group", layoutEditorSectionRowSpan: span },
    });
    return [make("contact_summary", 6), make("address_employment", 6)];
}

describe("drawer section-flow — no horizontal overflow", () => {
    it("row grid tracks use minmax(0, Nfr) so wide content cannot exceed the track", () => {
        const style = sectionRowGroupGridStyle([6, 6]);
        expect(style.gridTemplateColumns).toBe("minmax(0, 6fr) minmax(0, 6fr)");
        // Every track must be wrapped in minmax(0, …) — no bare `Nfr` track allowed.
        const tracks = style.gridTemplateColumns.split(") ").map((t) => (t.endsWith(")") ? t : `${t})`));
        expect(tracks.every((t) => t.startsWith("minmax(0,"))).toBe(true);
    });

    it("stacked row grid tracks use minmax(0, ...) on columns and rows", () => {
        const right = sectionStackedRowGroupGridStyle("stacked_right_equal");
        expect(right.gridTemplateColumns).toBe("minmax(0, 1fr) minmax(0, 1fr)");
        expect(right.gridTemplateRows).toBe("minmax(0, 1fr) minmax(0, 1fr)");

        const wide = sectionStackedRowGroupGridStyle("stacked_right");
        expect(wide.gridTemplateColumns).toBe("minmax(0, 2fr) minmax(0, 1fr)");
    });

    it("½ + ½ row with a full-width min-width child table keeps every peer cell width-bounded", () => {
        const html = renderToStaticMarkup(
            React.createElement(LayoutEditorSectionFlowView, {
                sections: halfRowSections(),
                stackClassName: LAYOUT_RUNTIME_SECTION_STACK_CLASS,
                rowCellClassName: LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS,
                renderSection: (section: LayoutSection) =>
                    React.createElement(
                        "div",
                        { "data-test-section": section.key },
                        // Simulate a wide child table inside its own scroll container.
                        React.createElement(
                            "div",
                            { className: "overflow-x-auto" },
                            React.createElement("table", { className: "min-w-[640px] w-full table-fixed" }),
                        ),
                    ),
            }),
        );

        // Grid track uses bounded minmax so the wide table cannot widen the track.
        expect(html).toContain("minmax(0, 6fr) minmax(0, 6fr)");
        // Every peer cell is width-bounded.
        const cellClassMatches = html.match(/<div class="([^"]*)"[^>]*data-layout-runtime-peer-row-card="true"/g) ?? [];
        expect(cellClassMatches.length).toBe(2);
        expect(cellClassMatches.every((m) => m.includes("min-w-0"))).toBe(true);
        expect(cellClassMatches.every((m) => m.includes("max-w-full"))).toBe(true);
        // Wide table stays inside its own horizontal-scroll container.
        expect(html).toContain("overflow-x-auto");
    });

    it("shared stack/cell classes carry width guards (min-w-0 + max-w-full)", () => {
        expect(LAYOUT_RUNTIME_SECTION_STACK_CLASS).toContain("min-w-0");
        expect(LAYOUT_RUNTIME_SECTION_STACK_CLASS).toContain("max-w-full");
        expect(LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS).toContain("min-w-0");
        expect(LAYOUT_RUNTIME_SECTION_ROW_CELL_CLASS).toContain("max-w-full");
    });
});
