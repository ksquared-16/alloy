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

    it("keeps a configured cell even when its card model is hidden (composition is configuration-driven)", () => {
        // A (Runtime V1): composition comes from the published configuration, NEVER from data presence.
        // A `visible:false` card no longer drops the cell — readiness (not visibility) decides content;
        // the configured cell reserves geometry and is filled in place. This is what stops the panel
        // from visibly assembling card-by-card as Settlement arrives.
        const cards = demoCards();
        const withoutCards = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        const firstTypeKey = withoutCards.composeCards[0]!.typeKey;
        const hiddenCards = new Map(cards);
        const base = hiddenCards.get(firstTypeKey);
        expect(base).toBeTruthy();
        hiddenCards.set(firstTypeKey, { ...(base as FocusPanelCardModel), visible: false });

        const withHidden = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC, {
            cards: hiddenCards,
        });
        // The configured cell is STILL present — a hidden card never removes it. Composition matches
        // the unfiltered surface exactly (same cells, same order, same layout).
        expect(withHidden.composeCards.some((c) => c.typeKey === firstTypeKey)).toBe(true);
        expect(withHidden.composeCards.map((c) => c.typeKey)).toEqual(
            withoutCards.composeCards.map((c) => c.typeKey),
        );
        expect(withHidden.publishedLayout).toEqual(withoutCards.publishedLayout);
        expect([...withHidden.cellResolution.keys()].sort()).toEqual(
            [...withoutCards.cellResolution.keys()].sort(),
        );
    });
});
