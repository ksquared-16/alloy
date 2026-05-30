import { describe, expect, it } from "vitest";
import {
    buildLocationSpecificLinkMetadata,
    resolveLinkLocationLabel,
} from "@/lib/forms/locationSpecificPublicLinkMetadata";

const LOC_A = "7ce70708-3517-4ab3-93d0-241a75ec3284";
const LOC_B = "8de80809-4628-5bc4-a541-352b87fd4395";
const WU = "5ba90557-876d-4450-9c28-36beac6e83be";

describe("locationSpecificPublicLinkMetadata", () => {
    it("builds metadata with label and location routing", () => {
        const meta = buildLocationSpecificLinkMetadata({
            label: "Website Inquiry — West Campus",
            locationId: LOC_A,
        });
        expect(meta.label).toBe("Website Inquiry — West Campus");
        expect(meta.default_location_id).toBe(LOC_A);
        expect(meta.distribution_context).toBe("location_specific");
        expect(meta.default_work_unit_id).toBeUndefined();
    });

    it("includes optional work unit override", () => {
        const meta = buildLocationSpecificLinkMetadata({
            label: "North Campus",
            locationId: LOC_B,
            workUnitId: WU,
        });
        expect(meta.default_work_unit_id).toBe(WU);
    });

    it("requires link name and location", () => {
        expect(() => buildLocationSpecificLinkMetadata({ label: "", locationId: LOC_A })).toThrow(/name/i);
        expect(() => buildLocationSpecificLinkMetadata({ label: "X", locationId: "bad" })).toThrow(/location/i);
    });

    it("resolves location label from catalog", () => {
        expect(
            resolveLinkLocationLabel({ default_location_id: LOC_A }, { [LOC_A]: "West Campus" })
        ).toBe("West Campus");
        expect(resolveLinkLocationLabel({}, { [LOC_A]: "West Campus" })).toBeNull();
    });

    it("feeds intake routing on public submit", async () => {
        const { parseIntakeLinkDefaults } = await import("@/lib/forms/intake/parseIntakeLinkDefaults");
        const meta = buildLocationSpecificLinkMetadata({
            label: "North",
            locationId: LOC_B,
            workUnitId: WU,
        });
        const parsed = parseIntakeLinkDefaults(meta);
        expect(parsed.default_location_id).toBe(LOC_B);
        expect(parsed.default_work_unit_id).toBe(WU);
    });
});

describe("mergePublicLinkMetadataForCreate with location", () => {
    it("preserves client location over org default", async () => {
        const { mergePublicLinkMetadataForCreate } = await import("@/lib/forms/intake/defaultPublicLinkMetadata");
        const { vi } = await import("vitest");
        const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
        const DEFAULT_LOC = "11111111-1111-4111-8111-111111111111";
        const CLIENT_LOC = LOC_A;

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "verticals") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { id: "1000d719-2248-4816-8ff6-cbdeee8e91ce" }, error: null }),
                                }),
                                order: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: { id: "1000d719-2248-4816-8ff6-cbdeee8e91ce" }, error: null }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "locations") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        order: () => ({
                                            limit: () => ({
                                                maybeSingle: async () => ({ data: { id: DEFAULT_LOC }, error: null }),
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "departments") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        maybeSingle: async () => ({ data: { id: "04958a78-32ca-4091-bcd3-4bbaef3fee4b" }, error: null }),
                                    }),
                                    order: () => ({
                                        limit: () => ({
                                            maybeSingle: async () => ({ data: { id: "04958a78-32ca-4091-bcd3-4bbaef3fee4b" }, error: null }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "work_units") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    eq: () => ({
                                        order: () => ({
                                            limit: () => ({
                                                maybeSingle: async () => ({ data: { id: WU }, error: null }),
                                            }),
                                        }),
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected ${table}`);
            }),
        };

        const out = await mergePublicLinkMetadataForCreate(supabase as never, {
            orgId: ORG,
            formKey: "website_inquiry",
            formMetadata: { intake_intent: "enrollment_lead" },
            clientMetadata: buildLocationSpecificLinkMetadata({
                label: "Riverbend",
                locationId: CLIENT_LOC,
            }),
        });

        expect(out.default_location_id).toBe(CLIENT_LOC);
        expect(out.label).toBe("Riverbend");
        expect(out.lead_capture).toBe(true);
    });
});
