import { describe, expect, it } from "vitest";
import {
    buildLocationShareLinkLabel,
    findLocationSpecificShareLinkForSite,
    findShareLinkForSite,
    parseOutcomeLabelsApiPayload,
    SHARE_BY_LOCATION_COPY,
    shareByLocationRowLabel,
} from "@/lib/forms/shareByLocationPresentation";
import { buildLocationSpecificLinkMetadata } from "@/lib/forms/locationSpecificPublicLinkMetadata";

const LOC_A = "7ce70708-3517-4ab3-93d0-241a75ec3284";
const LOC_B = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

describe("shareByLocationPresentation", () => {
    it("uses operator-friendly section copy", () => {
        expect(SHARE_BY_LOCATION_COPY.sectionTitle).toBe("Share by Location");
        expect(SHARE_BY_LOCATION_COPY.helper).toMatch(/each school/i);
    });

    it("buildLocationShareLinkLabel combines form and location", () => {
        expect(buildLocationShareLinkLabel("New Enrollment Lead", "West Campus")).toBe(
            "New Enrollment Lead — West Campus"
        );
    });

    it("shareByLocationRowLabel prefers campus name in table", () => {
        expect(
            shareByLocationRowLabel(
                { label: "New Enrollment Lead — West Campus", default_location_id: LOC_A },
                { [LOC_A]: "West Campus" },
                "fallback"
            )
        ).toBe("West Campus");
    });

    it("parseOutcomeLabelsApiPayload unwraps data envelope", () => {
        const payload = parseOutcomeLabelsApiPayload({
            data: {
                locations: { [LOC_A]: "North Campus" },
                shareByLocationSites: [{ id: LOC_A, label: "North Campus" }],
            },
        });
        expect(payload?.locations?.[LOC_A]).toBe("North Campus");
        expect(payload?.shareByLocationSites?.[0]?.label).toBe("North Campus");
    });

    it("findLocationSpecificShareLinkForSite ignores general share links", () => {
        const links = [
            {
                id: "general",
                is_active: true,
                metadata: { default_location_id: LOC_A, lead_capture: true },
            },
            {
                id: "campus",
                is_active: true,
                metadata: buildLocationSpecificLinkMetadata({
                    formName: "Form",
                    locationId: LOC_B,
                    locationName: "West Campus",
                }),
            },
        ];
        expect(findLocationSpecificShareLinkForSite(links, LOC_A)).toBeNull();
        expect(findLocationSpecificShareLinkForSite(links, LOC_B)?.id).toBe("campus");
        expect(findShareLinkForSite(links, LOC_A)).toBeNull();
    });
});

describe("locationSpecificPublicLinkMetadata auto label", () => {
    it("generates label from form + location without manual name", () => {
        const meta = buildLocationSpecificLinkMetadata({
            formName: "New Enrollment Lead",
            locationId: LOC_A,
            locationName: "West Campus",
        });
        expect(meta.label).toBe("New Enrollment Lead — West Campus");
        expect(meta.default_location_id).toBe(LOC_A);
        expect(meta.distribution_context).toBe("location_specific");
    });

    it("requires location only", () => {
        expect(() =>
            buildLocationSpecificLinkMetadata({
                formName: "Form",
                locationId: "bad",
                locationName: "West Campus",
            })
        ).toThrow(/location/i);
    });
});
