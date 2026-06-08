import { describe, expect, it } from "vitest";
import {
    computeFamilySummaryUsesFullPanel,
    computeShowInquirySummaryRightColumn,
    opportunityDrawerSummaryLayoutMode,
    stabilizeOpportunityWorkflowOverviewSections,
} from "@/lib/admin/drawer/opportunityDrawerLayoutStability";

describe("stabilizeOpportunityWorkflowOverviewSections", () => {
    it("keeps inquiry_children expanded while above-fold locked", () => {
        const sections = [
            { key: "inquiry_children", title: "Children", defaultExpanded: true, collapsible: true, fields: [] },
            { key: "inquiry_tuition", title: "Tuition", defaultExpanded: true, collapsible: true, fields: [] },
        ];
        const out = stabilizeOpportunityWorkflowOverviewSections(sections, {
            aboveFoldLocked: true,
            firstPaintGatesActive: true,
            enrichmentLayoutReady: false,
        });
        expect(out.find((s) => s.key === "inquiry_children")?.defaultExpanded).toBe(true);
        expect(out.find((s) => s.key === "inquiry_tuition")?.defaultExpanded).toBe(false);
    });
});

describe("inquiry summary layout stability", () => {
    it("uses FamilyContactsPanel whenever family_contacts is in summary layout", () => {
        expect(computeFamilySummaryUsesFullPanel({ familyContactsInSummary: true })).toBe(true);
        expect(computeFamilySummaryUsesFullPanel({ familyContactsInSummary: false })).toBe(false);
    });

    it("reserves two-column summary when shell contract reserves right column", () => {
        expect(
            computeShowInquirySummaryRightColumn({
                summaryRightColumnReserved: true,
                record: {},
                belowFoldEnrichmentReady: false,
                fullHydrateReady: false,
                taskAssistEnabled: false,
            })
        ).toBe(true);
        expect(
            opportunityDrawerSummaryLayoutMode({
                showRightColumn: true,
            })
        ).toBe("two");
    });
});
