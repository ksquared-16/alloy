import { describe, expect, it } from "vitest";
import {
    buildLocationShareLinkLabel,
    shareByLocationRowLabel,
    SHARE_BY_LOCATION_COPY,
} from "@/lib/forms/shareByLocationPresentation";
import { buildLocationSpecificLinkMetadata } from "@/lib/forms/locationSpecificPublicLinkMetadata";

const LOC_A = "7ce70708-3517-4ab3-93d0-241a75ec3284";

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
