import { describe, expect, it, vi } from "vitest";
import {
    applyInquiryChildPlacementFieldChange,
} from "@/lib/admin/location/inquiryChildPlacementFieldKeys";
import {
    applyCreateLeadChildParticipation,
    buildCreateLeadOcmInsertRow,
    parseCreateLeadChildParticipationPayload,
} from "@/lib/admin/actions/createLeadChildOcmPersistence";

const SITE_ID = "11111111-1111-4111-8111-111111111111";
const ROOM_ID = "22222222-2222-4222-8222-222222222222";
const CATEGORY_ID = "33333333-3333-4333-8333-333333333333";

describe("parseCreateLeadChildParticipationPayload", () => {
    it("maps create lead payload keys to OCM columns", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Riley",
            child_last_name: "Nguyen",
            child_date_of_birth: "2022-03-15",
            child_location_id: SITE_ID,
            child_program: "infant",
            child_schedule_type: "full_day",
            child_start_date: "2026-09-01",
            child_program_room_cohort_key: ROOM_ID,
            child_notes: "Sibling attends",
        });

        expect(parsed).not.toBeNull();
        expect(parsed!.identity.display_name).toBe("Riley Nguyen");
        expect(parsed!.ocm).toEqual({
            location_id: SITE_ID,
            program_key: "infant",
            program_category_id: null,
            schedule_type: "full_day",
            start_date: "2026-09-01",
            program_room_cohort_key: ROOM_ID,
            notes: "Sibling attends",
        });
    });

    it("parses intake program item_key (not display label) for FK resolution at persist", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_last_name: "Lee",
            child_program: "preschool",
        });
        expect(parsed!.ocm.program_key).toBe("preschool");
        expect(parsed!.ocm.program_key).not.toBe("Preschool");
    });

    it("stores room unit location id not label", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_last_name: "Lee",
            child_program_room_cohort_key: ROOM_ID,
        });
        expect(parsed!.ocm.program_room_cohort_key).toBe(ROOM_ID);
    });

    it("ignores non-uuid room labels", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_last_name: "Lee",
            child_program_room_cohort_key: "Infant A",
        });
        expect(parsed!.ocm.program_room_cohort_key).toBeNull();
    });

    it("returns null when no child identity or OCM fields", () => {
        expect(parseCreateLeadChildParticipationPayload({ first_name: "Parent" })).toBeNull();
    });

    it("returns null when only parent location_id is set (no child names)", () => {
        expect(
            parseCreateLeadChildParticipationPayload({
                first_name: "Kelly",
                last_name: "Kurzman",
                email: "kelly.kurzman@gmail.com",
                phone: "6022904816",
                location_id: SITE_ID,
            }),
        ).toBeNull();
    });

    it("returns null when only child first name is present", () => {
        expect(
            parseCreateLeadChildParticipationPayload({
                child_first_name: "Sam",
                child_location_id: SITE_ID,
            }),
        ).toBeNull();
    });

    it("accepts child_location_id for child OCM site", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_last_name: "Lee",
            child_location_id: SITE_ID,
        });
        expect(parsed!.ocm.location_id).toBe(SITE_ID);
    });

    it("cascades Lead location_id onto child OCM when child_location_id is absent", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_last_name: "Lee",
            location_id: SITE_ID,
        });
        expect(parsed!.ocm.location_id).toBe(SITE_ID);
    });

    it("prefers explicit child_location_id over Lead location_id", () => {
        const childSite = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_last_name: "Lee",
            location_id: SITE_ID,
            child_location_id: childSite,
        });
        expect(parsed!.ocm.location_id).toBe(childSite);
    });
});

describe("buildCreateLeadOcmInsertRow", () => {
    it("writes stable keys to OCM insert row (FK-only program; the key is never stored)", () => {
        const row = buildCreateLeadOcmInsertRow({
            orgId: "org-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            ocm: {
                location_id: SITE_ID,
                program_key: "infant",
                program_category_id: CATEGORY_ID,
                schedule_type: "full_day",
                start_date: "2026-09-01",
                program_room_cohort_key: ROOM_ID,
                notes: "Notes",
            },
        });
        expect(row).toMatchObject({
            org_id: "org-1",
            opportunity_id: "opp-1",
            customer_member_id: "cm-1",
            location_id: SITE_ID,
            program_category_id: CATEGORY_ID,
            schedule_type: "full_day",
            start_date: "2026-09-01",
            program_room_cohort_key: ROOM_ID,
            notes: "Notes",
        });
        expect(row).not.toHaveProperty("program_key");
    });
});

describe("applyCreateLeadChildParticipation", () => {
    it("creates customer_member + process_instance with participation metadata, and NO OCM row", async () => {
        let piUpsertPayload: Record<string, unknown> | null = null;
        let ocmInsertCalled = false;
        const sb = {
            from: vi.fn((table: string) => {
                if (table === "customer_members") {
                    return {
                        // The child-member write authority asks "is this person already an active
                        // child of this household?" BEFORE inserting, so the select chain now ends
                        // in `.limit(1)`. Empty = not a member yet, which is this scenario.
                        // @see web/lib/records/childMemberAuthority.ts
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnThis(),
                            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                        insert: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "cm-1" }, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "persons") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnThis(),
                            ilike: vi.fn().mockReturnThis(),
                            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
                        }),
                        insert: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "person-child" }, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "process_instances") {
                    return {
                        upsert: vi.fn((row: Record<string, unknown>) => {
                            piUpsertPayload = row;
                            return {
                                select: vi.fn().mockReturnValue({
                                    maybeSingle: vi.fn().mockResolvedValue({ data: { id: "pi-1" }, error: null }),
                                }),
                            };
                        }),
                    };
                }
                if (table === "opportunity_customer_members") {
                    ocmInsertCalled = true;
                    return { insert: vi.fn() };
                }
                if (table === "location_program_categories") {
                    return {
                        select: vi.fn().mockReturnValue({
                            eq: vi.fn().mockReturnThis(),
                            maybeSingle: vi.fn().mockResolvedValue({ data: { id: CATEGORY_ID }, error: null }),
                        }),
                    };
                }
                return { insert: vi.fn() };
            }),
        };

        const merged = {
            child_first_name: "Riley",
            child_last_name: "Nguyen",
            child_location_id: SITE_ID,
            child_program: "infant",
            child_schedule_type: "full_day",
            child_program_room_cohort_key: ROOM_ID,
            child_start_date: "2026-09-01",
        };

        const result = await applyCreateLeadChildParticipation(sb as never, {
            orgId: "org-1",
            opportunityId: "opp-1",
            customerId: "cust-1",
            merged,
        });

        // OCM is no longer written at Create Lead.
        expect(ocmInsertCalled).toBe(false);
        expect(result).toEqual({ customer_member_id: "cm-1", ocm_id: null, process_instance_id: "pi-1" });
        // Participation facts ride the process instance metadata (draft inputs).
        expect(piUpsertPayload).toMatchObject({
            org_id: "org-1",
            process_key: "enrollment",
            subject_id: "cm-1",
            context_id: "opp-1",
        });
        expect((piUpsertPayload as unknown as { metadata?: Record<string, unknown> })?.metadata).toMatchObject({
            program_category_id: CATEGORY_ID,
            schedule_type: "full_day",
            program_room_cohort_key: ROOM_ID,
            start_date: "2026-09-01",
            location_id: SITE_ID,
        });
    });
});

describe("placement cascade reset (UI contract)", () => {
    it("changing location resets program and room", () => {
        const next = applyInquiryChildPlacementFieldChange("child_location_id", SITE_ID, {
            child_location_id: "",
            child_program: "infant",
            child_program_room_cohort_key: ROOM_ID,
        });
        expect(next.child_program).toBe("");
        expect(next.child_program_room_cohort_key).toBe("");
    });

    it("changing program resets room", () => {
        const next = applyInquiryChildPlacementFieldChange("child_program", "preschool", {
            child_location_id: SITE_ID,
            child_program: "infant",
            child_program_room_cohort_key: ROOM_ID,
        });
        expect(next.child_program).toBe("preschool");
        expect(next.child_program_room_cohort_key).toBe("");
    });
});
