import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    compactGridRows,
    resolveDropPlacement,
    gridOverlaps,
    type FocusPanelGridLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelGridLayoutOps";

const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
const at = (g: FocusPanelGridLayout, card: string) => g.areas.find((a) => a.card === card)!;

/** Rows that exist as tracks: 1 .. the highest declared start. Empty ones still reserve height. */
const declaredRows = (g: FocusPanelGridLayout) =>
    Math.max(0, ...g.areas.map((a) => a.rowStart + a.rowSpan - 1));
const occupiedRows = (g: FocusPanelGridLayout) => {
    const rows = new Set<number>();
    for (const a of g.areas) for (let r = a.rowStart; r < a.rowStart + a.rowSpan; r += 1) rows.add(r);
    return rows.size;
};

describe("vertical compaction — an empty row index is not free space", () => {
    it("closes the hole a card leaves when it moves to an earlier row", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 3 },
                { card: "financials", colStart: 1, colSpan: 4, rowStart: 4, rowSpan: 3 },
                { card: "attendance", colStart: 1, colSpan: 8, rowStart: 7, rowSpan: 3 },
            ],
        };
        // Financials into the vacancy beside Process. Rows 4-6 lose their only occupant.
        const placement = resolveDropPlacement(grid, at(grid, "financials"), 9, 1);

        expect(at(placement.grid, "financials")).toMatchObject({ colStart: 9, rowStart: 1 });
        // Attendance rises into the vacated band instead of leaving three dead 76px tracks.
        expect(at(placement.grid, "attendance").rowStart).toBe(4);
        // Every declared row is an occupied row: no phantom tracks anywhere.
        expect(declaredRows(placement.grid)).toBe(occupiedRows(placement.grid));
        expect(gridOverlaps(placement.grid)).toEqual([]);
    });

    it("the ghost shows the compacted row, so preview still equals the drop", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 2 },
                { card: "financials", colStart: 1, colSpan: 4, rowStart: 9, rowSpan: 2 },
            ],
        };
        for (let col = 1; col <= 12; col += 1) {
            for (let row = 1; row <= 12; row += 1) {
                const p = resolveDropPlacement(grid, at(grid, "financials"), col, row);
                const landed = at(p.grid, "financials");
                expect({ c: landed.colStart, r: landed.rowStart }).toEqual({
                    c: p.area.colStart,
                    r: p.area.rowStart,
                });
                expect(declaredRows(p.grid)).toBe(occupiedRows(p.grid));
            }
        }
    });

    it("packs a gapped layout to the top without reordering or overlapping", () => {
        const gapped: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "business_process", colStart: 1, colSpan: 8, rowStart: 5, rowSpan: 2 },
                { card: "financials", colStart: 9, colSpan: 4, rowStart: 5, rowSpan: 2 },
                { card: "attendance", colStart: 1, colSpan: 12, rowStart: 20, rowSpan: 2 },
            ],
        };
        const packed = compactGridRows(gapped);
        expect(at(packed, "business_process")).toMatchObject({ colStart: 1, rowStart: 1 });
        expect(at(packed, "financials")).toMatchObject({ colStart: 9, rowStart: 1 });
        expect(at(packed, "attendance")).toMatchObject({ colStart: 1, rowStart: 3 });
        expect(gridOverlaps(packed)).toEqual([]);
    });

    it("is idempotent — a compact layout is left exactly as it is", () => {
        const grid: FocusPanelGridLayout = {
            columns: 12,
            areas: [
                { card: "business_process", colStart: 1, colSpan: 8, rowStart: 1, rowSpan: 3 },
                { card: "financials", colStart: 9, colSpan: 4, rowStart: 1, rowSpan: 3 },
            ],
        };
        expect(compactGridRows(grid)).toEqual(grid);
        expect(compactGridRows(compactGridRows(grid))).toEqual(compactGridRows(grid));
    });

    it("compacts at the one seam every committed layout passes through", () => {
        const canvas = source("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");
        expect(canvas).toContain("const packed = compactGridRows(next);");
    });
});

describe("drag activation is the same on every card", () => {
    const css = source("app/adminV2/components/alloyOsRuntime.css");
    const canvas = source("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");

    it("makes card content inert while composing, and live while configuring", () => {
        /*
         * Inert only while `.is-arranging` meant activation depended on what the card
         * drew under the pointer: a control-heavy card (Attendance) swallowed the press
         * and never dragged, while a text-heavy one (Process) did.
         *
         * It must not be inert ALWAYS either — a selected card is being configured and
         * its controls have to work. So the two coexist deliberately: content is inert
         * on unselected cards (uniform drag activation everywhere), live on the selected
         * one, where the chrome drag bar remains the handle.
         */
        expect(css).toContain(
            ".alloy-os-fp-composer-cell:not(.is-selected) > :first-child {\n  pointer-events: none;",
        );
        expect(css).not.toContain(".alloy-os-fp-composer-cell.is-arranging > :first-child");
        // The handle is generous and present in every mode.
        expect(css).toContain("height: 44px;");
    });

    it("has no second coordinate system for the preview", () => {
        // The dragged card marks itself in the resolved layout; a floating ghost
        // rectangle measured against the pre-drop canvas is what used to lie.
        expect(canvas).toContain('data-fp-composer-dragging={dragging ? "true" : undefined}');
        expect(canvas).not.toContain('className="alloy-os-fp-composer__ghost"');
        expect(canvas).toContain("const renderGrid = previewGrid ?? grid;");
    });

    it("routes every press through the one composer shell", () => {
        expect(canvas).toContain("onPointerDown={onStartMove ? bodyPointerDown : undefined}");
        // One shell renders every card in the composer — no per-card drag wrapper.
        expect(canvas.match(/function ComposerCellShell/g)?.length).toBe(1);
    });

    it("keeps composer chrome clickable", () => {
        expect(canvas).toContain('target?.closest("button, a, input, textarea, select, [data-fp-composer-no-drag]")');
        expect(css).toContain(".alloy-os-fp-composer-cell__chrome");
    });
});
