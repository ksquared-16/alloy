import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
    SURFACE_SPAN_CHOICES,
    defaultColumnsForCard,
    spanChoiceLabelForColumns,
} from "@/lib/adminV2/runtime/focusPanel/focusPanelCardAuthoring";

const source = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

describe("width is authored by the surface, not fixed by the card type", () => {
    it("offers the operator's vocabulary, in the platform's existing units", () => {
        expect(SURFACE_SPAN_CHOICES.map((c) => c.label)).toEqual(["1/3", "1/2", "2/3", "Full width"]);
        // Columns out of twelve — the same units grid areas and placement variants persist.
        expect(SURFACE_SPAN_CHOICES.map((c) => c.columns)).toEqual([4, 6, 8, 12]);
    });

    it("names any authored span, including one no longer offered", () => {
        expect(spanChoiceLabelForColumns(4)).toBe("1/3");
        expect(spanChoiceLabelForColumns(12)).toBe("Full width");
        expect(spanChoiceLabelForColumns(7)).toBe("2/3");
    });

    it("keeps a recommended default per card, and a platform fallback", () => {
        expect(defaultColumnsForCard("business_process")).toBe(12);
        expect(defaultColumnsForCard("health_safety")).toBe(4);
        // A card that declares nothing gets the honest "I do not know", not full width.
        expect(defaultColumnsForCard("communications")).toBe(6);
    });

    it("reads the authored width from the surface's own grid, so publishes are not migrated", () => {
        const editor = source("components/adminV2/settings/surfaces/FocusPanelSummarySurfaceEditor.tsx");
        expect(editor).toContain("rowLayout?.grid?.areas");
        expect(editor).toContain("authoredColumnsByCard");
        // The width control routes through the same seam placement already uses.
        expect(editor).toContain("setDesiredSpanByCard");
    });

    it("exposes the width control in the inspector", () => {
        const inspector = source("components/admin/focusPanel/FocusPanelCardInspector.tsx");
        expect(inspector).toContain('data-testid="inspector-span"');
        expect(inspector).toContain("SURFACE_SPAN_CHOICES");
        // Authored span wins; the card default only fills in.
        expect(inspector).toContain("authoredColumns ?? defaultColumnsForCard(baseModel.key)");
    });
});

describe("the gesture can start — the defects upstream of any placement maths", () => {
    const canvas = source("components/admin/focusPanel/FocusPanelRuntimeComposerCanvas.tsx");

    it("makes a card Visible at its own width, never full-bleed across the row", () => {
        /*
         * `addCardToGrid(next, key)` with no colSpan defaults to the WHOLE row. A surface
         * built through the visibility control therefore had every card spanning 12
         * columns, no row ever had a vacancy beside anything, and a drag could only stack.
         */
        expect(canvas).toContain("colSpan: defaultColumnsForCard(key)");
        expect(canvas).not.toMatch(/for \(const key of toAdd\) next = addCardToGrid\(next, key\);/);
    });

    it("starts a drag from one grip and nothing else", () => {
        /*
         * The body and the top bar both used to start drags, so activation depended
         * on what the card rendered under the press and on how near Configure it
         * landed. One 44x44 grip removes the variable entirely.
         */
        expect(canvas).not.toContain("bodyPointerDown");
        expect(canvas).toContain('className="alloy-os-fp-composer-cell__grip"');
        /*
         * A press is a click until the pointer travels: the threshold lives in
         * `startMove`, and `preventDefault` is deferred to the first qualifying move.
         * Suppressing the press itself also suppressed the click behind it, which
         * killed selection and Configure the moment the body became a drag surface —
         * a regression the browser caught and no unit test could.
         */
        expect(canvas).toContain(">= 4)");
        expect(canvas).toContain('reason: "no_travel"');
    });
});
