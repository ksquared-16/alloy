import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeFormDateInput, resolveFormPrefillValues, shouldApplyServerPrefill } from "@/lib/forms/prefill/resolveFormPrefillValues";
import { validateFormSchema } from "@/lib/forms/schema";

describe("resolveFormPrefillValues", () => {
    it("shouldApplyServerPrefill respects existing_record + prefill_enabled", () => {
        expect(shouldApplyServerPrefill({ form_context_mode: "existing_record", prefill_enabled: true })).toBe(true);
        expect(shouldApplyServerPrefill({ form_context_mode: "existing_record", prefill_enabled: false })).toBe(false);
        expect(shouldApplyServerPrefill({ form_context_mode: "lead_capture" })).toBe(false);
    });

    it("normalizeFormDateInput yields YYYY-MM-DD", () => {
        expect(normalizeFormDateInput("2020-06-15T00:00:00.000Z")).toBe("2020-06-15");
    });

    it("loads member → customer → contact chain for contact.* paths", async () => {
        const schema = validateFormSchema({
            schema_version: 1,
            title: "T",
            sections: [{ id: "s", field_ids: ["child_first_name", "child_dob", "guardian_email"] }],
            fields: [
                { id: "child_first_name", type: "text", label: "C", required: false },
                { id: "child_dob", type: "date", label: "D", required: false },
                { id: "guardian_email", type: "text", label: "E", required: false },
            ],
        });

        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "customer_members") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            first_name: "Ada",
                                            last_name: "Lovelace",
                                            dob: "2020-06-15",
                                            customer_id: "ccc-ccc-ccc-ccc-cccccccccccc",
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customers") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            name: "Household",
                                            primary_contact_id: "ctc-ctc-ctc-ctc-cccccccccccc",
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "contacts") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { email: "guardian@example.com", phone: "+15555550100" },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected table ${table}`);
            }),
        } as unknown as SupabaseClient;

        const mid = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
        const values = await resolveFormPrefillValues(
            supabase,
            "11111111-1111-4111-8111-111111111111",
            {
                form_context_mode: "existing_record",
                prefill_enabled: true,
                prefill_field_map: {
                    child_first_name: "customer_member.first_name",
                    child_dob: "customer_member.dob",
                    guardian_email: "contact.email",
                },
            },
            null,
            schema,
            {
                person_id: null,
                customer_id: null,
                customer_member_id: mid,
                opportunity_id: null,
            }
        );

        expect(values.child_first_name).toBe("Ada");
        expect(values.child_dob).toBe("2020-06-15");
        expect(values.guardian_email).toBe("guardian@example.com");
    });
});
