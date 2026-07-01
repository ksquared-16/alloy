import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveOpportunityEnrollmentSelection } from "@/lib/forms/packets/opportunityPacketLaunchValidation";

const ORG = "11111111-1111-4111-8111-111111111111";
const OID = "55555555-5555-4555-8555-555555555555";
const CID = "44444444-4444-4444-8444-444444444444";
const MID = "33333333-3333-4333-8333-333333333333";
const PID = "66666666-6666-4666-8666-666666666666";

describe("resolveOpportunityEnrollmentSelection", () => {
    it("accepts member in same household as opportunity", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: {
                                            id: OID,
                                            customer_id: CID,
                                            primary_person_id: PID,
                                            primary_contact_id: null,
                                        },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customer_members") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { id: MID, customer_id: CID },
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
                                        data: { primary_contact_id: null },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "persons") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({ data: { id: PID }, error: null }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected ${table}`);
            }),
        } as unknown as SupabaseClient;

        const r = await resolveOpportunityEnrollmentSelection(supabase, ORG, OID, {
            customer_member_id: MID,
            recipient_person_id: PID,
            delivery_intent: "copy_link",
        });
        expect(r.ok).toBe(true);
        if (!r.ok) return;
        expect(r.value.selected_customer_member_id).toBe(MID);
        expect(r.value.recipient_person_id).toBe(PID);
    });

    it("rejects member from another household", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
                if (table === "opportunities") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { id: OID, customer_id: CID, primary_person_id: null, primary_contact_id: null },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                if (table === "customer_members") {
                    return {
                        select: () => ({
                            eq: () => ({
                                eq: () => ({
                                    maybeSingle: async () => ({
                                        data: { id: MID, customer_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" },
                                        error: null,
                                    }),
                                }),
                            }),
                        }),
                    };
                }
                throw new Error(`unexpected ${table}`);
            }),
        } as unknown as SupabaseClient;

        const r = await resolveOpportunityEnrollmentSelection(supabase, ORG, OID, { customer_member_id: MID });
        expect(r.ok).toBe(false);
    });
});
