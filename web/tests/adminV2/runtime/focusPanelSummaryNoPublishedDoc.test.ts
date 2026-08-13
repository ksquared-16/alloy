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
            // Employment closes the right-hand REFERENCE lane. Six columns, deliberately: a
            // full-width card cannot be planned into lanes and silently dropped the whole panel
            // from `lanes` to `grid`.
            ["household", "children", "billing_preview", "employment"],
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
            // Employment reads last on a narrow surface: it answers a question about a person the
            // case happens to employ, never the enrollment work this panel exists for.
            "employment",
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

/**
 * SEED OWNERSHIP AT THE NO-PUBLISHED-DOC SEAM (Option B).
 *
 * The seam matters for seed authority as well as layout: with nothing published, the canonical code
 * composition resolves, and the subject seed must still come from the PAGE (the only boundary that
 * receives `searchParams`) with no second compose from the layout. Certified in the browser for the
 * published-doc tenant; this is the evidence for the unpublished path, which has no browser subject.
 */
describe("no published doc — seed ownership and provider filtering", () => {
    const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");

    it("the page owns the subject seed; the layout composes nothing on either doc path", () => {
        const page = read("app/adminV2/workspace/work-unit/[workUnitSlug]/page.tsx");
        const layout = read("app/adminV2/workspace/work-unit/[workUnitSlug]/layout.tsx");
        expect(page).toContain("searchParams");
        expect(page).toMatch(/subject=\{requestedSubjectId\}/);
        // One compose, page-owned — the layout must not reintroduce a default-subject compose that the
        // unpublished path would then discard.
        expect(layout).not.toContain("composeProvisioningAnswerForRoute");
        expect(layout).toMatch(/\{children\}/);
    });

    it("canonical composition is the resolved source when nothing is published", () => {
        // ModeGrid falls back to FOCUS_PANEL_SUMMARY_DEFAULT_DOC; the composition inputs derive from it.
        expect(inputs.publishedLayout).toBeTruthy();
        expect(visibleKeys.length).toBeGreaterThan(0);
    });

    it("provider-unavailable cards stay withheld here too, not just on the published path", () => {
        // Capability availability outranks authored visibility on BOTH doc paths — an unpublished tenant
        // must not become the way a provider-less card sneaks into production.
        expect(inputs.visibilityByCardKey.get("milestones")).toBe("hidden");
        expect(inputs.linkedCardKeys).not.toContain("milestones");
    });
});
