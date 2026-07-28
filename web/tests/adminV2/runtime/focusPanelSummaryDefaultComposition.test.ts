import { describe, expect, it } from "vitest";

import {
    FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION,
    focusPanelSummaryDefaultGrid,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import {
    FOCUS_PANEL_SUMMARY_DEFAULT_DOC,
    focusPanelSummaryDefaultGridLayout,
    focusPanelSummaryDefaultPublishedLayout,
} from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import { publishedLayoutReadingOrder } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";
import { readFocusPanelCardSectionMeta } from "@/lib/adminV2/runtime/focusPanel/focusPanelLayoutDocModel";
import {
    ENROLLMENT_DEFAULT_LINKED_CARD_KEYS,
    ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardVisibility";

const visible = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.filter((c) => c.visibility === "visible");
const linked = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.filter((c) => c.visibility === "linked");

describe("Focus Panel Summary default composition — ONE code-owned surface authority", () => {
    it("the default doc is generated from the composition: same cards, same reading order", () => {
        expect(FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections).toHaveLength(
            FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.length,
        );
        const metas = FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections.map((s) => readFocusPanelCardSectionMeta(s));
        expect(metas.every(Boolean)).toBe(true);
        expect(metas.map((m) => m!.key)).toEqual(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((c) => c.key));
        // Reading order is array order, encoded as gridRow.
        expect(metas.map((m) => m!.gridRow)).toEqual(FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.map((_, i) => i));
    });

    it("only Visible cards occupy geometry; Linked cards are configured but unplaced", () => {
        expect(visible.every((c) => c.area != null)).toBe(true);
        expect(linked.every((c) => c.area == null)).toBe(true);
        expect(focusPanelSummaryDefaultGrid().areas.map((a) => a.card)).toEqual(visible.map((c) => c.key));
        // …and every Linked card still has a section (navigable, config-resolvable).
        const docKeys = FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections
            .map((s) => readFocusPanelCardSectionMeta(s)!.key);
        for (const entry of linked) expect(docKeys).toContain(entry.key);
    });

    it("the rendered layout is planned from the 12-column grid, in composition order", () => {
        const layout = focusPanelSummaryDefaultPublishedLayout();
        expect(layout.grid).toEqual(focusPanelSummaryDefaultGridLayout());
        expect(layout.grid!.columns).toBe(12);
        expect(publishedLayoutReadingOrder(layout)).toEqual(visible.map((c) => c.key));
    });

    it("visibility matches the declared Enrollment defaults (was an unenforced `void` sanity)", () => {
        expect(visible.map((c) => c.key)).toEqual([...ENROLLMENT_DEFAULT_VISIBLE_CARD_KEYS]);
        expect(linked.map((c) => c.key)).toEqual([...ENROLLMENT_DEFAULT_LINKED_CARD_KEYS]);
    });

    it("every section carries the schema-required span/density (encode boundary, not authority)", () => {
        for (const section of FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections) {
            const meta = readFocusPanelCardSectionMeta(section);
            // `readFocusPanelCardSectionMeta` returns null when span/density are missing or invalid,
            // which would silently drop the card from every consumer.
            expect(meta).not.toBeNull();
            expect(meta!.span).toBeDefined();
            expect(meta!.density).toBeDefined();
        }
    });

    it("provider/visibility filtering applies AFTER resolution, without rewriting the document", () => {
        const inputs = deriveFocusPanelSummaryCompositionInputs(FOCUS_PANEL_SUMMARY_DEFAULT_DOC);
        // Milestones is provider-unavailable -> excluded from rendered geometry…
        expect(publishedLayoutReadingOrder(inputs.publishedLayout!)).not.toContain("milestones");
        // …but the document itself is untouched (the filter is a resolution-time concern).
        const docKeys = FOCUS_PANEL_SUMMARY_DEFAULT_DOC.sections
            .map((s) => readFocusPanelCardSectionMeta(s)!.key);
        expect(docKeys).toContain("milestones");
        // Linked cards likewise hold no initial geometry but stay resolvable.
        expect(publishedLayoutReadingOrder(inputs.publishedLayout!)).toEqual(visible.map((c) => c.key));
    });
});
