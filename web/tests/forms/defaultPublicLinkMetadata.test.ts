import { describe, expect, it, vi } from "vitest";
import {
    intakeDefaultsForFormPublicLink,
    mergePublicLinkMetadataForCreate,
} from "@/lib/forms/intake/defaultPublicLinkMetadata";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";

const ORG = "93667019-bd28-49b5-a688-acc9bb1e0a19";
const VERTICAL = "1000d719-2248-4816-8ff6-cbdeee8e91ce";
const DEPT = "04958a78-32ca-4091-bcd3-4bbaef3fee4b";
const WU = "5ba90557-876d-4450-9c28-36beac6e83be";
const LOC = "7ce70708-3517-4ab3-93d0-241a75ec3284";

function mockSupabaseForEnrollmentLead() {
    return {
        from: vi.fn((table: string) => {
            if (table === "verticals") {
                return {
                    select: () => ({
                        eq: (col: string, val: string) => ({
                            eq: () => ({
                                maybeSingle: async () =>
                                    col === "slug" && val === "childcare" ?
                                        { data: { id: VERTICAL }, error: null }
                                    :   { data: null, error: null },
                            }),
                            order: () => ({
                                limit: () => ({
                                    maybeSingle: async () => ({ data: { id: VERTICAL }, error: null }),
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
                                            maybeSingle: async () => ({ data: { id: LOC }, error: null }),
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
                                    maybeSingle: async () => ({ data: { id: DEPT }, error: null }),
                                }),
                                order: () => ({
                                    limit: () => ({
                                        maybeSingle: async () => ({ data: { id: DEPT }, error: null }),
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
            throw new Error(`unexpected table ${table}`);
        }),
    };
}

describe("defaultPublicLinkMetadata", () => {
    it("merge keeps client metadata over defaults", async () => {
        const vid = "aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee";
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: { id: vid }, error: null }),
                        }),
                    }),
                }),
            })),
        };

        const out = await mergePublicLinkMetadataForCreate(supabase as never, {
            orgId: ORG,
            formKey: MEDICATION_AUTHORIZATION_DEMO_FORM_KEY,
            formMetadata: {},
            clientMetadata: {
                alloy_admin_preview: true,
                label: "Preview",
            },
        });
        expect(out.lead_capture).toBe(true);
        expect(out.default_vertical_id).toBe(vid);
        expect(out.auto_create_opportunity).toBe(true);
        expect(out.alloy_admin_preview).toBe(true);
        expect(out.label).toBe("Preview");
    });

    it("applies enrollment lead intent from form metadata on create", async () => {
        const supabase = mockSupabaseForEnrollmentLead();
        const out = await mergePublicLinkMetadataForCreate(supabase as never, {
            orgId: ORG,
            formKey: "website_inquiry",
            formMetadata: { intake_intent: "enrollment_lead" },
            clientMetadata: { label: "Website" },
        });
        expect(out.lead_capture).toBe(true);
        expect(out.auto_create_opportunity).toBe(true);
        expect(out.default_opportunity_status_key).toBe("new_inquiry");
        expect(out.default_vertical_id).toBe(VERTICAL);
        expect(out.default_work_unit_id).toBe(WU);
        expect(out.default_department_id).toBe(DEPT);
        expect(out.label).toBe("Website");
    });

    it("non-demo form without intent returns client metadata only", async () => {
        const supabase = {
            from: vi.fn(() => {
                throw new Error("should not query when no intent");
            }),
        };
        const out = await mergePublicLinkMetadataForCreate(supabase as never, {
            orgId: ORG,
            formKey: "other_form",
            formMetadata: {},
            clientMetadata: { foo: true },
        });
        expect(out).toEqual({ foo: true });
    });

    it("intakeDefaultsForFormPublicLink returns {} when vertical missing", async () => {
        const supabase = {
            from: vi.fn(() => ({
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                        }),
                    }),
                }),
            })),
        };
        const d = await intakeDefaultsForFormPublicLink(supabase as never, MEDICATION_AUTHORIZATION_DEMO_FORM_KEY);
        expect(d).toEqual({});
    });
});
