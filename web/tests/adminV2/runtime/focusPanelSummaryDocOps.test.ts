import { describe, expect, it } from "vitest";

import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelGridFromLayoutDoc } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelCardsFromLayoutDoc";
import {
    addSummaryCard,
    buildSummaryDocFromOrder,
    cycleSummaryCardSpan,
    insertSummaryCard,
    mergeFocusPanelSummaryWorkingDoc,
    moveSummaryCard,
    moveSummaryCardToIndex,
    readSummaryCardOrder,
    removeSummaryCard,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelSummaryDocOps";

const baseOrder = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);

function flatKeys(order = baseOrder): string[] {
    const grid = deriveFocusPanelGridFromLayoutDoc(buildSummaryDocFromOrder(order));
    return grid.rows.flatMap((row) => row.cells.map((cell) => cell.key));
}

describe("focusPanelSummaryDocOps — local structure operations", () => {
    it("flattening the default doc preserves the exact card sequence (parity)", () => {
        const defaultGrid = deriveFocusPanelGridFromLayoutDoc(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const defaultSeq = defaultGrid.rows.flatMap((row) => row.cells.map((cell) => cell.key));
        expect(flatKeys()).toEqual(defaultSeq);
        expect(baseOrder.length).toBeGreaterThan(0);
        expect(baseOrder.length).toBe(defaultSeq.length);
    });

    it("mergeFocusPanelSummaryWorkingDoc preserves untouched metadata on incremental edits", () => {
        const base = {
            ...FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
            metadata: {
                ...(FOCUS_PANEL_SUMMARY_DEFAULT_DOC.metadata ?? {}),
                focusPanelCardLinks: [{ id: "link-1", fromCard: "scheduling", toCard: "children" }],
                customForwardCompat: { keep: true, nested: { a: 1 } },
                nestedSurfaces: { children_surface: { surfaceId: "children_surface", groups: [] } },
            },
        };
        const order = readSummaryCardOrder(base);
        const moved = moveSummaryCard(order, order[0]!.instanceId, 1);
        const merged = mergeFocusPanelSummaryWorkingDoc({
            base,
            order: moved,
            publishedLayoutMetadata: null,
            nestedSurfaces: null,
        });
        expect(merged.metadata?.focusPanelCardLinks).toEqual(base.metadata?.focusPanelCardLinks);
        expect(merged.metadata?.customForwardCompat).toEqual({ keep: true, nested: { a: 1 } });
        expect(merged.metadata?.nestedSurfaces).toEqual(base.metadata?.nestedSurfaces);
        expect(readSummaryCardOrder(merged).map((c) => c.key)).toEqual(moved.map((c) => c.key));
        // Contrast: rebuild-from-order alone would drop forward-compat keys.
        const rebuilt = buildSummaryDocFromOrder(moved);
        expect(rebuilt.metadata?.focusPanelCardLinks).toBeUndefined();
        expect(rebuilt.metadata?.customForwardCompat).toBeUndefined();
    });

    it("moveSummaryCard reorders without adding/removing", () => {
        const first = baseOrder[0]!.key;
        const moved = moveSummaryCard(baseOrder, first, 1);
        expect(moved[0]!.key).toBe(baseOrder[1]!.key);
        expect(moved[1]!.key).toBe(first);
        expect(moved.length).toBe(baseOrder.length);
    });

    it("moveSummaryCard is a no-op at the edges", () => {
        const first = baseOrder[0]!.key;
        expect(moveSummaryCard(baseOrder, first, -1).map((c) => c.key)).toEqual(
            baseOrder.map((c) => c.key),
        );
        const last = baseOrder[baseOrder.length - 1]!.key;
        expect(moveSummaryCard(baseOrder, last, 1).map((c) => c.key)).toEqual(
            baseOrder.map((c) => c.key),
        );
    });

    it("removeSummaryCard drops a card from the rendered grid", () => {
        const target = baseOrder[0]!.key;
        const next = removeSummaryCard(baseOrder, target);
        expect(next.length).toBe(baseOrder.length - 1);
        expect(flatKeys(next)).not.toContain(target);
    });

    it("addSummaryCard appends a new card and ignores duplicates", () => {
        const trimmed = removeSummaryCard(baseOrder, baseOrder[0]!.key);
        const re = addSummaryCard(trimmed, baseOrder[0]!);
        expect(re.length).toBe(baseOrder.length);
        expect(flatKeys(re)).toContain(baseOrder[0]!.key);
        // Duplicate add is ignored.
        expect(addSummaryCard(re, baseOrder[0]!).length).toBe(re.length);
    });

    it("cycleSummaryCardSpan cycles 1 → 2 → row → 1", () => {
        const key = baseOrder.find((c) => c.span === 1)!.key;
        const once = cycleSummaryCardSpan(baseOrder, key);
        expect(once.find((c) => c.key === key)!.span).toBe(2);
        const twice = cycleSummaryCardSpan(once, key);
        expect(twice.find((c) => c.key === key)!.span).toBe("row");
        const thrice = cycleSummaryCardSpan(twice, key);
        expect(thrice.find((c) => c.key === key)!.span).toBe(1);
    });

    it("insertSummaryCard places a card at a specific index", () => {
        const trimmed = removeSummaryCard(baseOrder, baseOrder[0]!.key);
        const inserted = insertSummaryCard(trimmed, baseOrder[0]!, 2);
        expect(inserted[2]!.key).toBe(baseOrder[0]!.key);
        expect(inserted.length).toBe(baseOrder.length);
        // Out-of-range index is clamped, duplicates ignored.
        expect(insertSummaryCard(inserted, baseOrder[0]!, 99).length).toBe(inserted.length);
    });

    it("moveSummaryCardToIndex relocates a card (drag-and-drop)", () => {
        const last = baseOrder[baseOrder.length - 1]!.key;
        const moved = moveSummaryCardToIndex(baseOrder, last, 0);
        expect(moved[0]!.key).toBe(last);
        expect(moved.length).toBe(baseOrder.length);
        expect(flatKeys(moved)[0]).toBe(last);
    });

    it("reset to default round-trips the published order", () => {
        const mutated = removeSummaryCard(moveSummaryCard(baseOrder, baseOrder[0]!.key, 1), baseOrder[2]!.key);
        expect(mutated).not.toEqual(baseOrder);
        // Reset re-reads the default doc.
        const reset = readSummaryCardOrder(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        expect(reset.map((c) => c.key)).toEqual(baseOrder.map((c) => c.key));
    });

    it("operations are pure (do not mutate the input order)", () => {
        const snapshot = baseOrder.map((c) => ({ ...c }));
        moveSummaryCard(baseOrder, baseOrder[0]!.key, 1);
        moveSummaryCardToIndex(baseOrder, baseOrder[0]!.key, 3);
        insertSummaryCard(baseOrder, baseOrder[0]!, 1);
        removeSummaryCard(baseOrder, baseOrder[0]!.key);
        cycleSummaryCardSpan(baseOrder, baseOrder[0]!.key);
        expect(baseOrder).toEqual(snapshot);
    });
});
