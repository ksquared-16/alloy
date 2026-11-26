import { describe, expect, it } from "vitest";

import { computeAssignmentAttention } from "@/lib/scheduling/assignmentAttention";

function mockClient(agreementIds: string[], assignmentRows: Record<string, unknown>[]) {
    return {
        from(table: string) {
            if (table === "child_enrollment_agreements") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                in: async () => ({
                                    data: agreementIds.map((id) => ({ id })),
                                    error: null,
                                }),
                            }),
                        }),
                    }),
                };
            }
            if (table === "schedule_assignments") {
                return {
                    select: () => ({
                        eq: () => ({
                            eq: () => ({
                                in: () => ({
                                    in: async () => ({ data: assignmentRows, error: null }),
                                }),
                            }),
                        }),
                    }),
                };
            }
            throw new Error(`unexpected table ${table}`);
        },
    };
}

describe("computeAssignmentAttention", () => {
    it("counts multiple, upcoming, missing types, and expiring windows", async () => {
        const supabase = mockClient(["a1", "a2"], [
            {
                id: "1",
                enrollment_agreement_id: "a1",
                is_primary: true,
                operational_assignment_type_id: "t1",
                start_date: "2026-01-01",
                end_date: "2026-07-30",
                status: "active",
            },
            {
                id: "2",
                enrollment_agreement_id: "a1",
                is_primary: false,
                operational_assignment_type_id: null,
                start_date: "2026-08-01",
                end_date: null,
                status: "planned",
            },
            {
                id: "3",
                enrollment_agreement_id: "a2",
                is_primary: true,
                operational_assignment_type_id: "t1",
                start_date: "2026-08-10",
                end_date: null,
                status: "planned",
            },
        ]);

        const result = await computeAssignmentAttention(
            supabase as never,
            "org",
            "site",
            "2026-07-25",
            4
        );

        expect(result.childrenMissingAssignments).toBe(4);
        expect(result.multipleAssignments).toBe(1);
        expect(result.upcomingAssignments).toBe(2);
        expect(result.futurePrimaryChanges).toBe(1);
        expect(result.missingAssignmentTypes).toBe(1);
        expect(result.expiringSoon).toBe(1);
        expect(result.assignmentConflicts).toBe(0);
        expect(result.changesAwaitingReview).toBe(0);
    });

    it("returns zeros when the site has no operational agreements", async () => {
        const supabase = mockClient([], []);
        const result = await computeAssignmentAttention(supabase as never, "org", "site", "2026-07-25", 0);
        expect(result).toEqual({
            multipleAssignments: 0,
            upcomingAssignments: 0,
            futurePrimaryChanges: 0,
            missingAssignmentTypes: 0,
            childrenMissingAssignments: 0,
            assignmentConflicts: 0,
            expiringSoon: 0,
            changesAwaitingReview: 0,
        });
    });
});
