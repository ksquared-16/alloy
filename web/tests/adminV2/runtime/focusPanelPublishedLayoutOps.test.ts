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
    removeCard,
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
