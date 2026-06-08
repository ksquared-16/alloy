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

describe("parseCreateLeadChildParticipationPayload", () => {
    it("maps create lead payload keys to OCM columns", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Riley",
            child_last_name: "Nguyen",
            child_date_of_birth: "2022-03-15",
            location_id: SITE_ID,
            child_program: "infant",
            child_desired_schedule_type: "full_day",
            child_desired_start_date: "2026-09-01",
            child_program_room_cohort_key: ROOM_ID,
            child_notes: "Sibling attends",
        });

        expect(parsed).not.toBeNull();
        expect(parsed!.identity.display_name).toBe("Riley Nguyen");
        expect(parsed!.ocm).toEqual({
            location_id: SITE_ID,
            desired_program_type: "infant",
            desired_schedule_type: "full_day",
            desired_start_date: "2026-09-01",
            program_room_cohort_key: ROOM_ID,
            notes: "Sibling attends",
        });
    });

    it("stores program item_key not display label", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_program: "preschool",
        });
        expect(parsed!.ocm.desired_program_type).toBe("preschool");
        expect(parsed!.ocm.desired_program_type).not.toBe("Preschool");
    });

    it("stores room unit location id not label", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_program_room_cohort_key: ROOM_ID,
        });
        expect(parsed!.ocm.program_room_cohort_key).toBe(ROOM_ID);
    });

    it("ignores non-uuid room labels", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_program_room_cohort_key: "Infant A",
        });
        expect(parsed!.ocm.program_room_cohort_key).toBeNull();
    });

    it("returns null when no child identity or OCM fields", () => {
        expect(parseCreateLeadChildParticipationPayload({ first_name: "Parent" })).toBeNull();
    });

    it("accepts child_location_id before execute payload remap", () => {
        const parsed = parseCreateLeadChildParticipationPayload({
            child_first_name: "Sam",
            child_location_id: SITE_ID,
        });
        expect(parsed!.ocm.location_id).toBe(SITE_ID);
    });
});

describe("buildCreateLeadOcmInsertRow", () => {
    it("writes stable keys to OCM insert row", () => {
        const row = buildCreateLeadOcmInsertRow({
            orgId: "org-1",
            opportunityId: "opp-1",
            customerMemberId: "cm-1",
            ocm: {
                location_id: SITE_ID,
                desired_program_type: "infant",
                desired_schedule_type: "full_day",
                desired_start_date: "2026-09-01",
                program_room_cohort_key: ROOM_ID,
                notes: "Notes",
            },
        });
        expect(row).toMatchObject({
            org_id: "org-1",
            opportunity_id: "opp-1",
            customer_member_id: "cm-1",
            location_id: SITE_ID,
            desired_program_type: "infant",
            desired_schedule_type: "full_day",
            desired_start_date: "2026-09-01",
            program_room_cohort_key: ROOM_ID,
            notes: "Notes",
        });
    });
});

describe("applyCreateLeadChildParticipation", () => {
    it("creates customer_member and OCM with enrollment fields", async () => {
        let ocmInsertPayload: Record<string, unknown> | null = null;
        const sb = {
            from: vi.fn((table: string) => {
                if (table === "customer_members") {
                    return {
                        insert: vi.fn().mockReturnValue({
                            select: vi.fn().mockReturnValue({
                                single: vi.fn().mockResolvedValue({ data: { id: "cm-1" }, error: null }),
                            }),
                        }),
                    };
                }
                if (table === "opportunity_customer_members") {
                    return {
                        insert: vi.fn((row: Record<string, unknown>) => {
                            ocmInsertPayload = row;
                            return {
                                select: vi.fn().mockReturnValue({
                                    single: vi.fn().mockResolvedValue({ data: { id: "ocm-1" }, error: null }),
                                }),
                            };
                        }),
                    };
                }
                return { insert: vi.fn() };
            }),
        };

        const merged = {
            child_first_name: "Riley",
            child_last_name: "Nguyen",
            location_id: SITE_ID,
            child_program: "infant",
            child_desired_schedule_type: "full_day",
            child_program_room_cohort_key: ROOM_ID,
            child_desired_start_date: "2026-09-01",
        };

        const result = await applyCreateLeadChildParticipation(sb as never, {
            orgId: "org-1",
            opportunityId: "opp-1",
            customerId: "cust-1",
            merged,
        });

        expect(result).toEqual({ customer_member_id: "cm-1", ocm_id: "ocm-1" });
        expect(ocmInsertPayload).toMatchObject({
            org_id: "org-1",
            opportunity_id: "opp-1",
            customer_member_id: "cm-1",
            location_id: SITE_ID,
            desired_program_type: "infant",
            desired_schedule_type: "full_day",
            program_room_cohort_key: ROOM_ID,
            desired_start_date: "2026-09-01",
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
