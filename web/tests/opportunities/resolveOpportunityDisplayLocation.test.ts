import { describe, expect, it } from "vitest";

import {
    OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL,
    opportunityDisplayLocationFromRecord,
    opportunityDisplayLocationLabel,
    resolveOpportunityDisplayLocation,
} from "@/lib/opportunities/resolveOpportunityDisplayLocation";

describe("resolveOpportunityDisplayLocation", () => {
    it("returns none when no child or opportunity location exists", () => {
        expect(resolveOpportunityDisplayLocation({})).toEqual({
            kind: "none",
            label: null,
            locations: [],
        });
    });

    it("uses opportunity fallback when no child locations are set", () => {
        expect(
            resolveOpportunityDisplayLocation({
                opportunityLocationId: "site-a",
                opportunityLocationLabel: "North Campus",
            })
        ).toEqual({
            kind: "single",
            label: "North Campus",
            locationId: "site-a",
            locations: [{ id: "site-a", name: "North Campus" }],
        });
    });

    it("uses opportunity id as label when fallback label is missing", () => {
        expect(
            resolveOpportunityDisplayLocation({
                opportunityLocationId: "site-a",
            })
        ).toMatchObject({
            kind: "single",
            label: "site-a",
            locationId: "site-a",
        });
    });

    it("returns single when one child location is present", () => {
        expect(
            resolveOpportunityDisplayLocation({
                opportunityLocationId: "site-opp",
                opportunityLocationLabel: "Opportunity Site",
                childLocations: [{ locationId: "site-child", locationLabel: "Bright Horizons" }],
            })
        ).toEqual({
            kind: "single",
            label: "Bright Horizons",
            locationId: "site-child",
            locations: [{ id: "site-child", name: "Bright Horizons" }],
        });
    });

    it("dedupes multiple children at the same location by id", () => {
        expect(
            resolveOpportunityDisplayLocation({
                childLocations: [
                    { locationId: "site-a", locationLabel: "North" },
                    { locationId: "site-a", locationLabel: "North Campus" },
                ],
            })
        ).toMatchObject({
            kind: "single",
            label: "North",
            locationId: "site-a",
        });
    });

    it("dedupes multiple children with the same label when id is missing", () => {
        expect(
            resolveOpportunityDisplayLocation({
                childLocations: [
                    { locationLabel: "North Campus" },
                    { locationLabel: "  north   campus " },
                ],
            })
        ).toMatchObject({
            kind: "single",
            label: "North Campus",
            locationId: null,
        });
    });

    it("returns multiple when children resolve to distinct locations", () => {
        const resolved = resolveOpportunityDisplayLocation({
            opportunityLocationId: "site-opp",
            opportunityLocationLabel: "Should Not Win",
            childLocations: [
                { locationId: "site-a", locationLabel: "North" },
                { locationId: "site-b", locationLabel: "South" },
            ],
        });
        expect(resolved.kind).toBe("multiple");
        if (resolved.kind !== "multiple") return;
        expect(resolved.label).toBe(OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL);
        expect(resolved.locations).toHaveLength(2);
    });

    it("ignores child rows without location id or label", () => {
        expect(
            resolveOpportunityDisplayLocation({
                opportunityLocationId: "site-fallback",
                opportunityLocationLabel: "Fallback Site",
                childLocations: [{ locationId: null, locationLabel: null }, { locationId: "", locationLabel: "  " }],
            })
        ).toMatchObject({
            kind: "single",
            label: "Fallback Site",
            locationId: "site-fallback",
        });
    });
});

describe("opportunityDisplayLocationFromRecord", () => {
    it("prefers inquiry child locations over opportunity location_id", () => {
        const label = opportunityDisplayLocationLabel({
            location_id: "site-opp",
            _location_label: "Opportunity Site",
            _inquiry_children: [
                { location_id: "site-a", location_label: "North" },
                { location_id: "site-b", location_label: "South" },
            ],
        });
        expect(label).toBe(OPPORTUNITY_DISPLAY_MULTIPLE_LOCATIONS_LABEL);
    });

    it("returns null when record has no resolvable location", () => {
        expect(opportunityDisplayLocationLabel({ _inquiry_children: [] })).toBeNull();
    });

    it("resolves single child location from inquiry children array", () => {
        const resolved = opportunityDisplayLocationFromRecord({
            location_id: "site-opp",
            _inquiry_children: [{ location_id: "site-child", location_label: "East Room Site" }],
        });
        expect(resolved.kind).toBe("single");
        if (resolved.kind !== "single") return;
        expect(resolved.locationId).toBe("site-child");
        expect(resolved.label).toBe("East Room Site");
    });
});
