import { describe, expect, it } from "vitest";
import { createInitialChildPlacement } from "@/lib/childcareOperational/childPlacementService";
import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import {
    buildOperationalEnrollmentReadModelForMemberSite,
    buildOperationalEnrollmentReadModelForAgreement,
} from "@/lib/childcareOperational/operationalEnrollmentReadModel";
import { createInitialScheduleAssignment } from "@/lib/childcareOperational/scheduleAssignmentService";
import {
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    PATTERN_ID,
    PROGRAM_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
    UNIT_ID,
} from "./mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-15";

describe("operationalEnrollmentReadModel", () => {
    it("returns empty model when no agreement exists", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const model = await buildOperationalEnrollmentReadModelForMemberSite(
            supabase,
            ORG_ID,
            MEMBER_ID,
            SITE_ID
        );
        expect(model.agreement).toBeNull();
        expect(model.warnings).toEqual([]);
    });

    it("returns labels and warnings for partial handoff", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        const model = await buildOperationalEnrollmentReadModelForAgreement(
            supabase,
            ORG_ID,
            agreement.id
        );
        expect(model.agreement?.id).toBe(agreement.id);
        expect(model.labels.site).toBe("Main Campus");
        expect(model.warnings).toContain("missing_placement");
        expect(model.warnings).toContain("missing_schedule_assignment");
    });

    it("returns full model without missing warnings when placement and schedule exist", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await createInitialChildPlacement(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            startDate: "2026-01-01",
            programCategoryId: PROGRAM_ID,
            roomLocationId: UNIT_ID,
            todayYmd: TODAY,
        });
        await createInitialScheduleAssignment(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            schedulePatternId: PATTERN_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });

        const model = await buildOperationalEnrollmentReadModelForMemberSite(
            supabase,
            ORG_ID,
            MEMBER_ID,
            SITE_ID
        );
        expect(model.placement?.room_location_id).toBe(UNIT_ID);
        expect(model.schedulePattern?.key).toBe("full_time");
        expect(model.labels.program).toBe("Infant");
        expect(model.labels.room).toBe("Infant A");
        expect(model.labels.schedule).toContain("Full Time");
        expect(model.warnings).not.toContain("missing_placement");
        expect(model.warnings).not.toContain("missing_schedule_assignment");
    });

    it("warns agreement_ended for terminal agreement in read model", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        const row = store.child_enrollment_agreements.find((r) => r.id === agreement.id);
        if (row) {
            row.status = "ended";
            row.end_date = "2026-05-31";
        }
        const model = await buildOperationalEnrollmentReadModelForAgreement(
            supabase,
            ORG_ID,
            agreement.id
        );
        expect(model.warnings).toContain("agreement_ended");
    });
});
