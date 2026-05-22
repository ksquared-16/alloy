import { describe, expect, it } from "vitest";
import { stabilizeOpportunityWorkflowOverviewSections } from "@/lib/admin/drawer/opportunityDrawerLayoutStability";

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
