import { describe, expect, it } from "vitest";

import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    createOperationalAssignment,
    listOperationalAssignments,
} from "@/lib/operationalAssignments/operationalAssignmentService";
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

    it("creates a staff commitment only for an employee person", async () => {
        const store = createOperationalEnrollmentMockStore({
            ...seedOperationalEnrollmentFixtures(),
            persons: [{ id: "staff-1", org_id: ORG_ID, is_employee: true }],
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
});
