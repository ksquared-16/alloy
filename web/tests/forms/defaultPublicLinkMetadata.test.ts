import { describe, expect, it, vi } from "vitest";
import {
    intakeDefaultsForFormPublicLink,
    mergePublicLinkMetadataForCreate,
} from "@/lib/forms/intake/defaultPublicLinkMetadata";
import { MEDICATION_AUTHORIZATION_DEMO_FORM_KEY } from "@/lib/forms/seeds/medicationAuthorizationDemo";

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

        const out = await mergePublicLinkMetadataForCreate(supabase as never, MEDICATION_AUTHORIZATION_DEMO_FORM_KEY, {
            alloy_admin_preview: true,
            label: "Preview",
        });
        expect(out.lead_capture).toBe(true);
        expect(out.default_vertical_id).toBe(vid);
        expect(out.auto_create_opportunity).toBe(true);
        expect(out.alloy_admin_preview).toBe(true);
        expect(out.label).toBe("Preview");
    });

    it("non-demo form returns client metadata only", async () => {
        const supabase = {
            from: vi.fn(() => {
                throw new Error("should not query verticals");
            }),
        };
        const out = await mergePublicLinkMetadataForCreate(supabase as never, "other_form", { foo: true });
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
