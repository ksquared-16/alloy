import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FOCUS_PANEL_SUMMARY_DEFAULT_DOC } from "@/lib/adminV2/runtime/focusPanel/buildFocusPanelSummaryDefaultDoc";
import { FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION } from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelSummaryDefaultComposition";
import { deriveFocusPanelSummaryCompositionInputs } from "@/lib/adminV2/runtime/focusPanel/deriveFocusPanelSummaryCompositionInputs";
import {
    planPublishedLayout,
    PUBLISHED_LAYOUT_MIN_PX,
} from "@/lib/adminV2/runtime/focusPanel/composition/focusPanelPublishedLayout";

/**
 * NO-PUBLISHED-DOC certification (Step 2).
 *
 * Exercises the REAL runtime resolution seam for an org that has published nothing:
 * `usePublishedFocusPanelSummaryDoc` returns null, so `OpportunityFocusPanelModeGrid` resolves
 * `activeDoc = FOCUS_PANEL_SUMMARY_DEFAULT_DOC`, derives composition inputs, and plans the layout
 * with the body's own flag (`preferLanesFromGrid = Boolean(publishedLayout?.grid)`).
 *
 * Firefly — the certification org — renders a PUBLISHED doc, so this path has no browser subject.
 * This test is the certification evidence for it.
 */

// Exactly what ModeGrid does when nothing is published.
const activeDoc = FOCUS_PANEL_SUMMARY_DEFAULT_DOC;
const inputs = deriveFocusPanelSummaryCompositionInputs(activeDoc);
const plan = (widthPx: number) =>
    planPublishedLayout(inputs.publishedLayout!, widthPx, {
        preferLanesFromGrid: Boolean(inputs.publishedLayout?.grid),
    });

const visibleKeys = FOCUS_PANEL_SUMMARY_DEFAULT_COMPOSITION.filter((c) => c.visibility === "visible").map(
    (c) => c.key,
);

describe("Focus Panel Summary — no published doc resolves the canonical composition", () => {
    it("desktop: plans published LANES from the 12-column composition (same strategy as a published tenant)", () => {
        const p = plan(1024);
        expect(p.collapsed).toBe(false);
        expect(p.strategy).toBe("lanes");
        // Two 6/12 lanes — the geometry the composition authors.
        expect(p.lanes.map((l) => l.widthUnits)).toEqual([6, 6]);
        expect(p.lanes.map((l) => l.cards.map((c) => c.key))).toEqual([
            ["current_work", "scheduling"],
            ["household", "children", "billing_preview"],
        ]);
    });

    it("places every Visible composition card, and only those", () => {
        const placed = plan(1024).lanes.flatMap((l) => l.cards.map((c) => c.key));
        expect([...placed].sort()).toEqual([...visibleKeys].sort());
    });

    it("Milestones stays excluded (provider-unavailable), and Linked cards hold no geometry", () => {
        const placed = plan(1024).lanes.flatMap((l) => l.cards.map((c) => c.key));
        expect(placed).not.toContain("milestones");
        expect(placed).not.toContain("tour_summary");
        expect(placed).not.toContain("communications");
    });

    it("narrow: collapses to one full-width column in reading order", () => {
        const p = plan(PUBLISHED_LAYOUT_MIN_PX - 40);
        expect(p.collapsed).toBe(true);
        expect(p.strategy).toBe("rows");
        expect(p.rows.every((r) => r.cells.length === 1)).toBe(true);
        expect(p.rows.flatMap((r) => r.cells.flatMap((c) => c.cards))).toEqual([
            "current_work",
            "household",
            "children",
            "scheduling",
            "billing_preview",
        ]);
    });

    it("no SUMMARY_GRID fallback remains anywhere in the source", () => {
        const root = join(process.cwd());
        const files = [
            "lib/adminV2/runtime/focusPanel/deriveOpportunityFocusPanelCards.ts",
            "components/admin/focusPanel/OpportunityFocusPanelModeGrid.tsx",
            "components/admin/focusPanel/FocusPanelSummarySkeleton.tsx",
        ];
        for (const rel of files) {
            expect(readFileSync(join(root, rel), "utf8")).not.toContain("SUMMARY_GRID");
        }
    });
});
