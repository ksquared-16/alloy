import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("evt-test"),
}));

import {
    createInitialChildPlacement,
    getOperationalPlacementForAgreement,
    supersedeChildPlacement,
} from "@/lib/childcareOperational/childPlacementService";
import { createChildEnrollmentAgreement } from "@/lib/childcareOperational/enrollmentAgreementService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    PROGRAM_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
    UNIT_ID,
} from "./mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-15";

describe("childPlacementService", () => {
    async function createAgreement(supabase: ReturnType<typeof createOperationalEnrollmentMockSupabase>) {
        return createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
    }

    it("creates initial placement with validated room and program", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createAgreement(supabase);
        const placement = await createInitialChildPlacement(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            startDate: "2026-01-01",
            programCategoryId: PROGRAM_ID,
            roomLocationId: UNIT_ID,
            todayYmd: TODAY,
        });
        expect(placement.status).toBe("active");
        expect(placement.program_category_id).toBe(PROGRAM_ID);
        expect(placement.room_location_id).toBe(UNIT_ID);
    });

    it("supersedes operational placement and marks prior superseded", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createAgreement(supabase);
        const first = await createInitialChildPlacement(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            startDate: "2026-01-01",
            programCategoryId: PROGRAM_ID,
            roomLocationId: UNIT_ID,
            todayYmd: TODAY,
        });
        const second = await supersedeChildPlacement(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            startDate: "2026-06-20",
            programCategoryId: PROGRAM_ID,
            roomLocationId: UNIT_ID,
            todayYmd: TODAY,
        });
        expect(second.supersedes_placement_id).toBe(first.id);
        expect(second.start_date).toBe("2026-06-20");
        expect(second.status).toBe("planned");

        const prior = store.child_placements.find((r) => r.id === first.id);
        expect(prior?.status).toBe("superseded");
        expect(prior?.end_date).toBe("2026-06-19");
    });

    it("rejects invalid supersede start date", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createAgreement(supabase);
        await createInitialChildPlacement(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            startDate: "2026-06-01",
            programCategoryId: PROGRAM_ID,
            todayYmd: TODAY,
        });
        await expect(
            supersedeChildPlacement(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: agreement.id,
                startDate: "2026-06-01",
                programCategoryId: PROGRAM_ID,
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "validation_failed" });
    });

    it("enforces one operational placement per agreement", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const agreement = await createAgreement(supabase);
        await createInitialChildPlacement(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: agreement.id,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        await expect(
            createInitialChildPlacement(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: agreement.id,
                startDate: "2026-07-01",
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "conflict" });

        const operational = await getOperationalPlacementForAgreement(
            supabase,
            ORG_ID,
            agreement.id
        );
        expect(operational?.status).toBe("active");
    });

    it("rejects room not under site", async () => {
        const store = seedOperationalEnrollmentFixtures();
        store.locations.push({
            id: "unit-bad",
            org_id: ORG_ID,
            label: "Other room",
            location_type: "unit",
            parent_location_id: "other-site",
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const agreement = await createAgreement(supabase);
        await expect(
            createInitialChildPlacement(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: agreement.id,
                startDate: TODAY,
                programCategoryId: PROGRAM_ID,
                roomLocationId: "unit-bad",
                todayYmd: TODAY,
            })
        ).rejects.toBeInstanceOf(OperationalEnrollmentServiceError);
    });
});
