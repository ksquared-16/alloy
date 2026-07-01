import { describe, expect, it, vi } from "vitest";
import { deriveSubmissionFksFromLaunchMetadata, applyOpportunityPacketLinkFkExtras } from "@/lib/forms/formLaunchFkDerivation";

const ORG = "11111111-1111-4111-8111-111111111111";
const MID = "33333333-3333-4333-8333-333333333333";
const CID = "44444444-4444-4444-8444-444444444444";
const OID = "55555555-5555-4555-8555-555555555555";
const PID = "66666666-6666-4666-8666-666666666666";

function mockSupabaseForMember() {
    return {
        from: vi.fn((table: string) => {
            if (table !== "customer_members") throw new Error(`unexpected table ${table}`);
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: { customer_id: CID },
                                error: null,
                            }),
                        }),
                    }),
                }),
            };
        }),
    };
}

function mockSupabaseForOpportunity() {
    return {
        from: vi.fn((table: string) => {
            if (table !== "opportunities") throw new Error(`unexpected table ${table}`);
            return {
                select: () => ({
                    eq: () => ({
                        eq: () => ({
                            maybeSingle: async () => ({
                                data: {
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
        }),
    };
}

function mockSupabaseForOpportunityViaContact() {
    return {
        from: vi.fn((table: string) => {
            if (table === "opportunities") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                maybeSingle: async () => ({
                                    data: {
                                        customer_id: CID,
                                        primary_person_id: null,
                                        primary_contact_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
                                    data: { person_id: PID },
                                    error: null,
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

describe("deriveSubmissionFksFromLaunchMetadata", () => {
    it("returns empty when not existing_record", async () => {
        const r = await deriveSubmissionFksFromLaunchMetadata({} as never, ORG, { form_context_mode: "lead_capture" });
        expect(r.person_id).toBeNull();
    });

    it("maps person source to person_id only", async () => {
        const r = await deriveSubmissionFksFromLaunchMetadata({} as never, ORG, {
            form_context_mode: "existing_record",
            source_entity_type: "person",
            source_entity_id: PID,
        });
        expect(r.person_id).toBe(PID);
        expect(r.customer_id).toBeNull();
    });

    it("maps customer_member and derives customer_id", async () => {
        const r = await deriveSubmissionFksFromLaunchMetadata(mockSupabaseForMember() as never, ORG, {
            form_context_mode: "existing_record",
            source_entity_type: "customer_member",
            source_entity_id: MID,
        });
        expect(r.customer_member_id).toBe(MID);
        expect(r.customer_id).toBe(CID);
    });

    it("maps opportunity and derives customer_id", async () => {
        const r = await deriveSubmissionFksFromLaunchMetadata(mockSupabaseForOpportunity() as never, ORG, {
            form_context_mode: "existing_record",
            source_entity_type: "opportunity",
            source_entity_id: OID,
        });
        expect(r.opportunity_id).toBe(OID);
        expect(r.customer_id).toBe(CID);
        expect(r.person_id).toBe(PID);
    });

    it("maps opportunity person_id via primary contact when primary_person_id is null", async () => {
        const r = await deriveSubmissionFksFromLaunchMetadata(mockSupabaseForOpportunityViaContact() as never, ORG, {
            form_context_mode: "packet",
            source_entity_type: "opportunity",
            source_entity_id: OID,
        });
        expect(r.opportunity_id).toBe(OID);
        expect(r.customer_id).toBe(CID);
        expect(r.person_id).toBe(PID);
    });
});

describe("applyOpportunityPacketLinkFkExtras", () => {
    it("stamps member and recipient person when metadata matches org rows", async () => {
        const supabase = {
            from: vi.fn((table: string) => {
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
                throw new Error(table);
            }),
        } as unknown as import("@supabase/supabase-js").SupabaseClient;

        const base = {
            person_id: "aaaaaaa-a-aaaa-aaaa-aaaaaaaaaaaa" as string | null,
            customer_id: CID,
            customer_member_id: null as string | null,
            opportunity_id: OID,
        };
        const out = await applyOpportunityPacketLinkFkExtras(supabase, ORG, base, {
            selected_customer_member_id: MID,
            recipient_person_id: PID,
        });
        expect(out.customer_member_id).toBe(MID);
        expect(out.person_id).toBe(PID);
    });
});
