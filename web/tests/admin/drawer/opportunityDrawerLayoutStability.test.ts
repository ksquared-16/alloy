import { describe, expect, it } from "vitest";
import {
    computeFamilySummaryUsesFullPanel,
    computeShowInquirySummaryRightColumn,
    opportunityDrawerAboveFoldLayoutLocked,
    opportunityDrawerLayoutFirstPaintGatesActive,
    opportunityDrawerSummaryLayoutMode,
    stabilizeOpportunityWorkflowOverviewSections,
} from "@/lib/admin/drawer/opportunityDrawerLayoutStability";

describe("opportunityDrawerLayoutStability", () => {
    it("locks above-fold until below-fold reveal", () => {
        expect(opportunityDrawerAboveFoldLayoutLocked(true, false)).toBe(true);
        expect(opportunityDrawerAboveFoldLayoutLocked(true, true)).toBe(false);
        expect(opportunityDrawerAboveFoldLayoutLocked(false, false)).toBe(false);
    });

    it("keeps first-paint layout gates after full hydrate while locked", () => {
        expect(opportunityDrawerLayoutFirstPaintGatesActive(true, false)).toBe(true);
        expect(opportunityDrawerLayoutFirstPaintGatesActive(false, true)).toBe(true);
        expect(opportunityDrawerLayoutFirstPaintGatesActive(false, false)).toBe(false);
    });

    it("does not enable two-column summary when above-fold locked despite full surface", () => {
        expect(
            computeShowInquirySummaryRightColumn({
                aboveFoldLocked: true,
                record: { _record_surface: "full", next_follow_up_at: "2026-06-01" },
                enrichmentLayoutReady: true,
                secondaryReady: true,
                taskAssistEnabled: true,
            })
        ).toBe(false);
        expect(
            opportunityDrawerSummaryLayoutMode({
                aboveFoldLocked: true,
                recordSurface: "full",
                showRightColumn: true,
            })
        ).toBe("one");
    });

    it("does not flip to family contacts panel when above-fold locked", () => {
        expect(
            computeFamilySummaryUsesFullPanel({
                aboveFoldLocked: true,
                familyContactsInSummary: true,
                firstPaintActive: false,
            })
        ).toBe(false);
    });

    it("places inquiry_children last and collapsed when above-fold locked", () => {
        const sections = stabilizeOpportunityWorkflowOverviewSections(
            [
                { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
                { key: "quote", title: "Quote", defaultExpanded: true, collapsible: true, fields: [] },
                { key: "inquiry_tuition", title: "Tuition", defaultExpanded: true, collapsible: true, fields: [] },
            ],
            {
                aboveFoldLocked: true,
                firstPaintGatesActive: true,
                enrichmentLayoutReady: true,
            }
        );
        expect(sections.map((s) => s.key)).toEqual(["quote", "inquiry_children"]);
        expect(sections[sections.length - 1]?.defaultExpanded).toBe(false);
        expect(sections.find((s) => s.key === "inquiry_tuition")).toBeUndefined();
    });

    it("allows right column only after below-fold unlock when enrichment is ready", () => {
        expect(
            computeShowInquirySummaryRightColumn({
                aboveFoldLocked: false,
                record: { _record_surface: "full" },
                enrichmentLayoutReady: true,
                secondaryReady: true,
                taskAssistEnabled: true,
            })
        ).toBe(true);
    });
});
