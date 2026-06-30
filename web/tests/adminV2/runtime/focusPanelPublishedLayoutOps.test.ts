import { describe, expect, it } from "vitest";

import {
    planPublishedLayout,
    readFocusPanelPublishedLayout,
    type FocusPanelPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import {
    addCardToRow,
    addRow,
    cardsInLayout,
    emptyLayout,
    moveCardToRow,
    moveRow,
    removeCard,
    removeRow,
    setCellWidth,
    stackCardInCell,
    withPublishedLayoutMetadata,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayoutOps";

describe("focusPanelPublishedLayoutOps", () => {
    it("builds a two-column row by adding cards at half width", () => {
        let l = addRow(emptyLayout());
        l = addCardToRow(l, 0, "household", "1/2");
        l = addCardToRow(l, 0, "readiness_kpi", "1/2");
        expect(l.rows[0]!.cells.map((c) => [c.width, c.cards])).toEqual([
            ["1/2", ["household"]],
            ["1/2", ["readiness_kpi"]],
        ]);
    });

    it("supports the stacked right-column pattern (Household left, Readiness+Current Work stacked right)", () => {
        let l = addRow(emptyLayout());
        l = addCardToRow(l, 0, "household", "1/2");
        l = addCardToRow(l, 0, "readiness_kpi", "1/2");
        l = stackCardInCell(l, 0, 1, "current_work"); // stack under Readiness
        expect(l.rows[0]!.cells[0]!.cards).toEqual(["household"]);
        expect(l.rows[0]!.cells[1]!.cards).toEqual(["readiness_kpi", "current_work"]);
    });

    it("sets cell width with understandable fractions", () => {
        let l = addCardToRow(addRow(emptyLayout()), 0, "children", "1/2");
        l = setCellWidth(l, 0, 0, "2/3");
        expect(l.rows[0]!.cells[0]!.width).toBe("2/3");
        l = setCellWidth(l, 0, 0, "full");
        expect(l.rows[0]!.cells[0]!.width).toBe("full");
    });

    it("places each card once and tracks placed cards", () => {
        let l = addCardToRow(addRow(emptyLayout()), 0, "household");
        l = addCardToRow(l, 0, "household"); // duplicate ignored
        expect(cardsInLayout(l)).toEqual(["household"]);
    });

    it("removes a card and prunes the emptied cell + row", () => {
        let l = addCardToRow(addRow(emptyLayout()), 0, "household");
        l = removeCard(l, { row: 0, cell: 0, card: "household" });
        expect(l.rows).toHaveLength(0);
    });

    it("moves a card to another row (drag-between-rows), keeping its width", () => {
        let l = addRow(addRow(emptyLayout())); // 2 rows
        l = addCardToRow(l, 0, "household", "2/3");
        l = addCardToRow(l, 1, "children", "full");
        l = moveCardToRow(l, { row: 0, cell: 0, card: "household" }, 1);
        // row 0 pruned (emptied), row 1 now has children + household (width preserved)
        expect(l.rows).toHaveLength(1);
        const cards = l.rows[0]!.cells.flatMap((c) => c.cards);
        expect(cards).toContain("household");
        expect(cards).toContain("children");
        expect(l.rows[0]!.cells.find((c) => c.cards.includes("household"))?.width).toBe("2/3");
    });

    it("published layout authored by the builder drives the runtime exactly (round-trip)", () => {
        // Author: Children 2/3 + Current Work 1/3 (row 1); Household 1/2 + Readiness 1/2 (row 2)
        let l = addRow(emptyLayout());
        l = addCardToRow(l, 0, "children", "2/3");
        l = addCardToRow(l, 0, "current_work", "1/3");
        l = addRow(l);
        l = addCardToRow(l, 1, "household", "1/2");
        l = addCardToRow(l, 1, "readiness_kpi", "1/2");

        // Publish: write to doc metadata, then the runtime reads it back.
        const doc = { metadata: withPublishedLayoutMetadata(null, l) };
        const readBack = readFocusPanelPublishedLayout(doc) as FocusPanelPublishedLayout;
        expect(readBack).toEqual(l);

        // Runtime plan honors the exact widths (12-unit columns).
        const plan = planPublishedLayout(readBack, 900);
        expect(plan.rows[0]!.cells.map((c) => [c.widthUnits, c.cards])).toEqual([
            [8, ["children"]],
            [4, ["current_work"]],
        ]);
        expect(plan.rows[1]!.cells.map((c) => [c.widthUnits, c.cards])).toEqual([
            [6, ["household"]],
            [6, ["readiness_kpi"]],
        ]);
    });
});

describe("settings editor persist/load round-trip (metadata + fallback)", () => {
    it("save/publish carries the row layout in the summary doc metadata, runtime reads it", async () => {
        const { buildSummaryDocFromOrder, readSummaryCardOrder } = await import(
            "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps"
        );
        const { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } = await import(
            "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc"
        );
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);

        // Author a layout in the builder, then build the doc the editor saves/publishes.
        let l = addRow(emptyLayout());
        l = addCardToRow(l, 0, "household", "1/2");
        l = addCardToRow(l, 0, "readiness_kpi", "1/2");
        l = stackCardInCell(l, 0, 1, "current_work");
        const baseDoc = buildSummaryDocFromOrder(order);
        const savedDoc = { ...baseDoc, metadata: withPublishedLayoutMetadata(baseDoc.metadata, l) };

        // Card instances/config still persist (sections) AND the layout (metadata).
        expect(savedDoc.sections.length).toBe(order.length);
        const readBack = readFocusPanelPublishedLayout(savedDoc);
        expect(readBack).toEqual(l);
        const plan = planPublishedLayout(readBack!, 900);
        expect(plan.rows[0]!.cells.map((c) => [c.widthUnits, c.cards])).toEqual([
            [6, ["household"]],
            [6, ["readiness_kpi", "current_work"]],
        ]);
    });

    it("falls back to auto-composition when no layout is authored (no metadata)", async () => {
        const { buildSummaryDocFromOrder, readSummaryCardOrder } = await import(
            "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps"
        );
        const { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } = await import(
            "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc"
        );
        const order = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        // Editor with rowLayout=null persists the plain doc (no layout metadata).
        const doc = buildSummaryDocFromOrder(order);
        expect(readFocusPanelPublishedLayout(doc)).toBeNull();
    });
});

describe("row operations (reorder + remove) — Composition V2", () => {
    it("removes an entire row", () => {
        let l = addCardToRow(addRow(emptyLayout()), 0, "household");
        l = addCardToRow(addRow(l), 1, "children");
        l = removeRow(l, 0);
        expect(cardsInLayout(l)).toEqual(["children"]);
        expect(l.rows).toHaveLength(1);
    });

    it("reorders a row up and down, clamping at the ends", () => {
        let l = addCardToRow(addRow(emptyLayout()), 0, "household");
        l = addCardToRow(addRow(l), 1, "children");
        l = addCardToRow(addRow(l), 2, "readiness_kpi");
        // move row 2 (readiness) up to index 1
        l = moveRow(l, 2, -1);
        expect(l.rows.map((r) => r.cells[0]!.cards[0])).toEqual(["household", "readiness_kpi", "children"]);
        // moving the top row up is a no-op (clamped)
        expect(moveRow(l, 0, -1)).toEqual(l);
        // moving the bottom row down is a no-op (clamped)
        expect(moveRow(l, 2, 1)).toEqual(l);
    });

    it("uses operator-friendly named widths by default (half), still placing each card once", () => {
        const l = addCardToRow(addRow(emptyLayout()), 0, "household");
        expect(l.rows[0]!.cells[0]!.width).toBe("half");
    });
})
