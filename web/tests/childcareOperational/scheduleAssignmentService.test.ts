import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("evt-test"),
}));

import {
    createInitialScheduleAssignment,
    getOperationalScheduleAssignmentForAgreement,
    supersedeScheduleAssignment,
} from "@/lib/childcareOperational/scheduleAssignmentService";
import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    createOperationalEnrollmentMockSupabase,
    createOperationalEnrollmentMockStore,
    MEMBER_ID,
    ORG_ID,
    PATTERN_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
} from "./mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-15";

describe("scheduleAssignmentService", () => {
    async function createAgreement(
        supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>
    ) {
        return createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
    }

    it("creates initial assignment when pattern belongs to site", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createAgreement(supabase);
        const assignment = await createInitialScheduleAssignment(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            schedulePatternId: PATTERN_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        expect(assignment.schedule_pattern_id).toBe(PATTERN_ID);
        expect(assignment.status).toBe("active");
    });

    it("supersedes assignment and closes prior row", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createAgreement(supabase);
        const first = await createInitialScheduleAssignment(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            schedulePatternId: PATTERN_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        const second = await supersedeScheduleAssignment(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            schedulePatternId: PATTERN_ID,
            startDate: "2026-06-20",
            todayYmd: TODAY,
        });
        expect(second.supersedes_assignment_id).toBe(first.id);
        const prior = store.schedule_assignments.find((r) => r.id === first.id);
        expect(prior?.status).toBe("superseded");
        expect(prior?.end_date).toBe("2026-06-19");
    });

    it("rejects pattern from different site", async () => {
        const store = createOperationalEnrollmentMockStore(seedOperationalEnrollmentFixtures());
        store.schedule_patterns.push({
            id: "pattern-other",
            org_id: ORG_ID,
            site_location_id: "other-site",
            key: "part_time",
            label: "Part Time",
            schedule_type_key: "part_time",
            weekdays: [2, 4],
            sort_order: 20,
            is_active: true,
            metadata: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: null,
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createAgreement(supabase);
        await expect(
            createInitialScheduleAssignment(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: agreement.id,
                schedulePatternId: "pattern-other",
                startDate: TODAY,
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "validation_failed" });
    });

    it("enforces one operational assignment per agreement", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createAgreement(supabase);
        await createInitialScheduleAssignment(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            schedulePatternId: PATTERN_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        await expect(
            createInitialScheduleAssignment(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: agreement.id,
                schedulePatternId: PATTERN_ID,
                startDate: "2026-07-01",
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "conflict" });

        const operational = await getOperationalScheduleAssignmentForAgreement(
            supabase,
            ORG_ID,
            agreement.id
        );
        expect(operational?.status).toBe("active");
    });
});
