import { describe, expect, it } from "vitest";

import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveOpportunityFocusPanelPresentation } from "@/lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards";
import { buildDemoFocusPanelSummaryViewModel } from "@/lib/adminV2/runtime/focusPanel/demoFocusPanelSummaryViewModel";
import type { FocusPanelCardKey, FocusPanelCardModel } from "@/lib/adminV2/runtime/focusPanel/focusPanelCardModel";

function demoCards(): Map<FocusPanelCardKey, FocusPanelCardModel> {
    const { vm, record } = buildDemoFocusPanelSummaryViewModel();
    return deriveOpportunityFocusPanelPresentation({
        mode: "summary",
        displayVm: vm,
        record,
        title: vm.header.title,
        perspective: null,
        statusLabel: "Tour scheduled",
    }).cards;
}

describe("deriveFocusPanelSummaryCompositionInputs", () => {
    it("without cards includes ALL published cells (no visibility filter)", () => {
        const inputs = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const publishedCellCount = FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections.length;
        const cellCount = inputs.gridRows.reduce((n, row) => n + row.cells.length, 0);
        expect(cellCount).toBe(publishedCellCount);
        expect(inputs.composeCards.length).toBe(publishedCellCount);
    });

    it("with vs without cards yields the same publishedLayout + composeCards keys when all cards visible", () => {
        const cards = demoCards();
        const withCards = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC, { cards });
        const withoutCards = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);

        expect(withCards.publishedLayout).toEqual(withoutCards.publishedLayout);
        // The demo VM has no hidden cards, so the resolved (filtered) surface matches the
        // skeleton (unfiltered) surface — same reading order, same strategy inputs.
        expect(withCards.composeCards.map((c) => c.key)).toEqual(
            withoutCards.composeCards.map((c) => c.key),
        );
        expect(withCards.composeCards.map((c) => c.typeKey)).toEqual(
            withoutCards.composeCards.map((c) => c.typeKey),
        );
    });

    it("applies the visibility filter ONLY when cards are provided (a hidden card drops)", () => {
        const cards = demoCards();
        const firstSection = FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections[0]!;
        // Derive the type key placed in the first published cell and mark its model hidden.
        const withoutCards = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const firstTypeKey = withoutCards.composeCards[0]!.typeKey;
        const hiddenCards = new Map(cards);
        const base = hiddenCards.get(firstTypeKey);
        expect(base).toBeTruthy();
        hiddenCards.set(firstTypeKey, { ...(base as FocusPanelCardModel), visible: false });

        const withHidden = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC, {
            cards: hiddenCards,
        });
        // The hidden type is dropped from the filtered surface but present in the skeleton.
        expect(withHidden.composeCards.some((c) => c.typeKey === firstTypeKey)).toBe(false);
        expect(withoutCards.composeCards.some((c) => c.typeKey === firstTypeKey)).toBe(true);
        // Non-record inputs stay identical regardless of the filter.
        expect(withHidden.publishedLayout).toEqual(withoutCards.publishedLayout);
        expect([...withHidden.cellResolution.keys()].sort()).toEqual(
            [...withoutCards.cellResolution.keys()].sort(),
        );
        void firstSection;
    });
});
