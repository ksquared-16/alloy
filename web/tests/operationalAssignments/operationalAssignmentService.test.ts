import { describe, expect, it } from "vitest";

import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    createOperationalAssignment,
    deleteProposedOperationalAssignment,
    listOperationalAssignments,
    promoteProposedAssignment,
} from "@/lib/operationalAssignments/operationalAssignmentService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    createOperationalEnrollmentMockSupabase,
    createOperationalEnrollmentMockStore,
    MEMBER_ID,
    ORG_ID,
    PATTERN_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
} from "../childcareOperational/mockOperationalEnrollmentSupabase";

const TODAY = "2026-07-24";

describe("operationalAssignmentService", () => {
    it("allows a secondary child commitment beside the primary assignment", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });

        const primary = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            isPrimary: true,
            todayYmd: TODAY,
        });
        const secondary = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "child", enrollmentAgreementId: agreement.id },
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            isPrimary: false,
            todayYmd: TODAY,
        });

        expect(primary.is_primary).toBe(true);
        expect(secondary.is_primary).toBe(false);
        const assignments = await listOperationalAssignments(supabase, ORG_ID, {
            subject: { type: "child", enrollmentAgreementId: agreement.id },
        });
        expect(assignments).toHaveLength(2);
    });

    it("creates a proposed child assignment without an enrollment agreement", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);

        const proposed = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: {
                type: "child",
                customerMemberId: MEMBER_ID,
                siteLocationId: SITE_ID,
            },
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            isPrimary: true,
            todayYmd: TODAY,
        });

        expect(proposed.commitment_kind).toBe("proposed");
        expect(proposed.enrollment_agreement_id).toBeNull();
        expect(proposed.customer_member_id).toBe(MEMBER_ID);
        expect(proposed.status).toBe("planned");

        const listed = await listOperationalAssignments(supabase, ORG_ID, {
            subject: { type: "child", customerMemberId: MEMBER_ID },
        });
        expect(listed.some((a) => a.id === proposed.id)).toBe(true);
    });

    it("promotes a proposed assignment onto an enrollment agreement", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const proposed = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: {
                type: "child",
                customerMemberId: MEMBER_ID,
                siteLocationId: SITE_ID,
            },
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });

        const committed = await promoteProposedAssignment(supabase, {
            orgId: ORG_ID,
            assignmentId: proposed.id,
            enrollmentAgreementId: agreement.id,
        });

        expect(committed.id).toBe(proposed.id);
        expect(committed.commitment_kind).toBe("committed");
        expect(committed.enrollment_agreement_id).toBe(agreement.id);
    });

    it("creates a staff commitment for a person with canonical employment", async () => {
        const store = createOperationalEnrollmentMockStore({
            ...seedOperationalEnrollmentFixtures(),
            persons: [{ id: "staff-1", org_id: ORG_ID, archived_at: null }],
            employments: [
                {
                    id: "emp-1",
                    org_id: ORG_ID,
                    person_id: "staff-1",
                    employment_status: "active",
                    start_date: "2026-01-01",
                    end_date: null,
                },
            ],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);

        const assignment = await createOperationalAssignment(supabase, {
            orgId: ORG_ID,
            subject: { type: "staff", personId: "staff-1", siteLocationId: SITE_ID },
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });

        expect(assignment.subject_type).toBe("staff");
        expect(assignment.subject_person_id).toBe("staff-1");
        expect(assignment.is_primary).toBe(false);
    });

    it("rejects a staff commitment when persons.is_employee is the only signal", async () => {
        // The placeholder must not admit anyone. This is the app-layer half of
        // the eligibility repoint; the database trigger enforces the same rule.
        const store = createOperationalEnrollmentMockStore({
            ...seedOperationalEnrollmentFixtures(),
            persons: [{ id: "staff-1", org_id: ORG_ID, is_employee: true, archived_at: null }],
            employments: [],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);

        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: { type: "staff", personId: "staff-1", siteLocationId: SITE_ID },
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "validation_failed" });
    });

    it("rejects a staff commitment dated after employment ended", async () => {
        const store = createOperationalEnrollmentMockStore({
            ...seedOperationalEnrollmentFixtures(),
            persons: [{ id: "staff-1", org_id: ORG_ID, archived_at: null }],
            employments: [
                {
                    id: "emp-1",
                    org_id: ORG_ID,
                    person_id: "staff-1",
                    employment_status: "ended",
                    start_date: "2026-01-01",
                    end_date: "2026-06-30",
                },
            ],
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);

        await expect(
            createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: { type: "staff", personId: "staff-1", siteLocationId: SITE_ID },
                schedulePatternId: PATTERN_ID,
                startDate: "2026-07-01",
                todayYmd: "2026-07-01",
            })
        ).rejects.toMatchObject({ code: "validation_failed" });
    });

    describe("deleteProposedOperationalAssignment", () => {
        it("hard-deletes a Proposed assignment and removes it from listings", async () => {
            const store = seedOperationalEnrollmentFixtures();
            const supabase = createOperationalEnrollmentMockSupabase(store);
            const proposed = await createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: {
                    type: "child",
                    customerMemberId: MEMBER_ID,
                    siteLocationId: SITE_ID,
                },
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                todayYmd: TODAY,
            });
            expect(proposed.commitment_kind).toBe("proposed");

            const deleted = await deleteProposedOperationalAssignment(supabase, {
                orgId: ORG_ID,
                assignmentId: proposed.id,
                actorUserId: "user-1",
            });
            expect(deleted.id).toBe(proposed.id);

            const listed = await listOperationalAssignments(supabase, ORG_ID, {
                subject: { type: "child", customerMemberId: MEMBER_ID },
                includeTerminal: true,
            });
            expect(listed.some((a) => a.id === proposed.id)).toBe(false);
        });

        it("rejects deleting a committed assignment", async () => {
            const store = seedOperationalEnrollmentFixtures();
            const supabase = createOperationalEnrollmentMockSupabase(store);
            const agreement = await createChildEnrollmentAgreement(supabase, {
                orgId: ORG_ID,
                customerMemberId: MEMBER_ID,
                siteLocationId: SITE_ID,
                startDate: TODAY,
                todayYmd: TODAY,
            });
            const committed = await createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: { type: "child", enrollmentAgreementId: agreement.id },
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                isPrimary: true,
                todayYmd: TODAY,
            });
            expect(committed.commitment_kind).toBe("committed");

            await expect(
                deleteProposedOperationalAssignment(supabase, {
                    orgId: ORG_ID,
                    assignmentId: committed.id,
                    actorUserId: "user-1",
                })
            ).rejects.toThrow(OperationalEnrollmentServiceError);

            const stillListed = await listOperationalAssignments(supabase, ORG_ID, {
                subject: { type: "child", enrollmentAgreementId: agreement.id },
            });
            expect(stillListed.some((a) => a.id === committed.id)).toBe(true);
        });

        it("rejects deleting a committed assignment that was promoted from proposed", async () => {
            const store = seedOperationalEnrollmentFixtures();
            const supabase = createOperationalEnrollmentMockSupabase(store);
            const proposed = await createOperationalAssignment(supabase, {
                orgId: ORG_ID,
                subject: {
                    type: "child",
                    customerMemberId: MEMBER_ID,
                    siteLocationId: SITE_ID,
                },
                schedulePatternId: PATTERN_ID,
                startDate: TODAY,
                todayYmd: TODAY,
            });
            const agreement = await createChildEnrollmentAgreement(supabase, {
                orgId: ORG_ID,
                customerMemberId: MEMBER_ID,
                siteLocationId: SITE_ID,
                startDate: TODAY,
                todayYmd: TODAY,
            });
            const promoted = await promoteProposedAssignment(supabase, {
                orgId: ORG_ID,
                assignmentId: proposed.id,
                enrollmentAgreementId: agreement.id,
            });
            expect(promoted.commitment_kind).toBe("committed");

            await expect(
                deleteProposedOperationalAssignment(supabase, {
                    orgId: ORG_ID,
                    assignmentId: promoted.id,
                    actorUserId: "user-1",
                })
            ).rejects.toThrow("Only a Proposed Assignment can be deleted");
        });

        it("throws not_found for an unknown assignment id", async () => {
            const store = seedOperationalEnrollmentFixtures();
            const supabase = createOperationalEnrollmentMockSupabase(store);

            await expect(
                deleteProposedOperationalAssignment(supabase, {
                    orgId: ORG_ID,
                    assignmentId: "does-not-exist",
                    actorUserId: "user-1",
                })
            ).rejects.toThrow("Proposed assignment not found");
        });
    });
});
