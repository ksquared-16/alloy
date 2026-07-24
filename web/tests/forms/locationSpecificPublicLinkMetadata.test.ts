import { describe, expect, it } from "vitest";
import {
    buildLocationSpecificLinkMetadata,
    resolveLinkLocationLabel,
} from "@/lib/forms/locationSpecificPublicLinkMetadata";

const LOC_A = "7ce70708-3517-4ab3-93d0-241a75ec3284";
const LOC_B = "8de80809-4628-5bc4-a541-352b87fd4395";
const WU = "5ba90557-876d-4450-9c28-36beac6e83be";

describe("locationSpecificPublicLinkMetadata", () => {
    it("builds metadata with auto-generated label and location routing", () => {
        const meta = buildLocationSpecificLinkMetadata({
            formName: "Website Inquiry",
            locationId: LOC_A,
            locationName: "West Campus",
        });
        expect(meta.label).toBe("Website Inquiry — West Campus");
        expect(meta.default_location_id).toBe(LOC_A);
        expect(meta.distribution_context).toBe("location_specific");
        expect(meta.default_work_unit_id).toBeUndefined();
    });

    it("includes optional work unit override for advanced flows", () => {
        const meta = buildLocationSpecificLinkMetadata({
            formName: "Website Inquiry",
            locationId: LOC_B,
            locationName: "North Campus",
            workUnitId: WU,
        });
        expect(meta.default_work_unit_id).toBe(WU);
    });

    it("requires location name and id", () => {
        expect(() =>
            buildLocationSpecificLinkMetadata({
                formName: "Form",
                locationId: LOC_A,
                locationName: "",
            })
        ).toThrow(/location name/i);
        expect(() =>
            buildLocationSpecificLinkMetadata({
                formName: "Form",
                locationId: "bad",
                locationName: "West",
            })
        ).toThrow(/location/i);
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
            formName: "Inquiry",
            locationId: LOC_B,
            locationName: "North Campus",
            workUnitId: WU,
        });
        const parsed = parseIntakeLinkDefaults(meta);
        expect(parsed.default_location_id).toBe(LOC_B);
        expect(parsed.default_work_unit_id).toBe(WU);
    });

    it("location-specific link metadata is link-only — no submission or CRM rows", () => {
        const meta = buildLocationSpecificLinkMetadata({
            formName: "Website Inquiry",
            locationId: LOC_A,
            locationName: "West Campus",
        });
        const keys = Object.keys(meta).sort();
        expect(keys).toEqual(["default_location_id", "distribution_context", "label"]);
        expect(meta).not.toHaveProperty("opportunity_id");
        expect(meta).not.toHaveProperty("person_id");
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
                formName: "Website Inquiry",
                locationId: CLIENT_LOC,
                locationName: "Riverbend Campus",
            }),
        });

        expect(out.default_location_id).toBe(CLIENT_LOC);
        expect(out.label).toBe("Website Inquiry — Riverbend Campus");
        expect(out.lead_capture).toBe(true);
    });

    it("merges intake routing into Studio processing_intake links (per-campus Share by location)", async () => {
        // Regression: the Studio mint stamps form_context_mode=processing_intake. That used to
        // short-circuit the intent merge, so per-campus links minted with no lead_capture and no
        // default_vertical_id — public submits then skipped intake (skipped_intake_disabled) and
        // nothing reached the Mailroom. Routing must merge underneath; client keys still win.
        const { mergePublicLinkMetadataForCreate } = await import("@/lib/forms/intake/defaultPublicLinkMetadata");
        const { vi } = await import("vitest");
        const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
        const VERTICAL = "1000d719-2248-4816-8ff6-cbdeee8e91ce";

        const DEFAULT_LOC = "11111111-1111-4111-8111-111111111111";
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "verticals") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({ maybeSingle: async () => ({ data: { id: VERTICAL }, error: null }) }),
                                order: () => ({
                                    limit: () => ({ maybeSingle: async () => ({ data: { id: VERTICAL }, error: null }) }),
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
                                        maybeSingle: async () => ({
                                            data: { id: "04958a78-32ca-4091-bcd3-4bbaef3fee4b" },
                                            error: null,
                                        }),
                                    }),
                                    order: () => ({
                                        limit: () => ({
                                            maybeSingle: async () => ({
                                                data: { id: "04958a78-32ca-4091-bcd3-4bbaef3fee4b" },
                                                error: null,
                                            }),
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
                                            limit: () => ({ maybeSingle: async () => ({ data: { id: WU }, error: null }) }),
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
            clientMetadata: {
                ...buildLocationSpecificLinkMetadata({
                    formName: "Website Inquiry",
                    locationId: LOC_A,
                    locationName: "North Campus",
                }),
                form_context_mode: "processing_intake",
            },
        });

        // Intake actually runs for this link now.
        expect(out.lead_capture).toBe(true);
        expect(out.default_vertical_id).toBe(VERTICAL);
        // Client-owned keys are preserved (mode + campus scope).
        expect(out.form_context_mode).toBe("processing_intake");
        expect(out.default_location_id).toBe(LOC_A);
    });
});
