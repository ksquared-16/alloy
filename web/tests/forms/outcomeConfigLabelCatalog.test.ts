import { describe, expect, it } from "vitest";
import {
    collectOutcomeRoutingUuidSets,
    locationLabelsFromRows,
    workUnitLabelsFromRows,
} from "@/lib/forms/outcomeConfigLabelCatalog";

describe("outcomeConfigLabelCatalog IC-1b", () => {
    it("collectOutcomeRoutingUuidSets merges form defaults and link metadata", () => {
        const sets = collectOutcomeRoutingUuidSets({
            formMetadata: {
                intake_outcome: { default_vertical_id: "1000d719-2248-4816-8ff6-cbdeee8e91ce" },
            },
            links: [
                {
                    id: "a",
                    is_active: true,
                    created_at: "2026-05-27T12:00:00.000Z",
                    metadata: {
                        default_location_id: "7ce70708-3517-4ab3-93d0-241a75ec3284",
                    },
                },
            ],
        });

        expect(sets.locationIds).toContain("7ce70708-3517-4ab3-93d0-241a75ec3284");
        expect(sets.verticalIds).toContain("1000d719-2248-4816-8ff6-cbdeee8e91ce");
    });

    it("locationLabelsFromRows prefers label then address", () => {
        expect(
            locationLabelsFromRows([
                { id: "loc-1", label: "West Campus", address1: "123 Main", city: "Phoenix" },
                { id: "loc-2", label: null, address1: "456 Oak", city: "Tempe", postal_code: "85281" },
            ])
        ).toEqual({
            "loc-1": "West Campus",
            "loc-2": "456 Oak, Tempe, 85281",
        });
    });

    it("workUnitLabelsFromRows formats department · work unit", () => {
        expect(
            workUnitLabelsFromRows(
                [{ id: "wu-1", name: "Enrollment Pipeline", department_id: "dept-1" }],
                { "dept-1": "Enrollment" }
            )
        ).toEqual({ "wu-1": "Enrollment · Enrollment Pipeline" });
    });
});
