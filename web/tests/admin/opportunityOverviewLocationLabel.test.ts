import { describe, expect, it } from "vitest";

import { opportunityOverviewRelationshipReadLabel } from "@/lib/admin/opportunityOverviewLabels";
import { formatOpportunityDisplayMultipleLocationsLabel } from "@/lib/opportunities/resolveOpportunityDisplayLocation";

describe("opportunityOverviewRelationshipReadLabel location_id", () => {
    it("returns Multiple locations when inquiry children disagree", () => {
        const label = opportunityOverviewRelationshipReadLabel(
            {
                location_id: "site-opp",
                _location_label: "Opportunity Site",
                _inquiry_children: [
                    { location_id: "site-a", location_label: "North" },
                    { location_id: "site-b", location_label: "South" },
                ],
            },
            "location_id"
        );
        expect(label).toBe(formatOpportunityDisplayMultipleLocationsLabel(2));
    });

    it("returns child location when one child location is set", () => {
        const label = opportunityOverviewRelationshipReadLabel(
            {
                location_id: "site-opp",
                _location_label: "Opportunity Site",
                _inquiry_children: [{ location_id: "site-child", location_label: "East Campus" }],
            },
            "location_id"
        );
        expect(label).toBe("East Campus");
    });

    it("falls back to opportunity label when children have no locations", () => {
        const label = opportunityOverviewRelationshipReadLabel(
            {
                location_id: "site-opp",
                _location_label: "Opportunity Site",
                _inquiry_children: [{ location_id: null, location_label: null }],
            },
            "location_id"
        );
        expect(label).toBe("Opportunity Site");
    });
});
