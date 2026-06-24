import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("evt-test"),
}));

import {
    cancelAgreementBeforeStart,
    createChildEnrollmentAgreement,
    getOperationalAgreementForMemberSite,
    markAgreementEnded,
    markAgreementEnding,
    transitionEndingAgreementsToEnded,
} from "@/lib/childcareOperational/enrollmentAgreementService";
import { OperationalEnrollmentServiceError } from "@/lib/childcareOperational/operationalEnrollmentErrors";
import {
    createOperationalEnrollmentMockSupabase,
    MEMBER_ID,
    ORG_ID,
    seedOperationalEnrollmentFixtures,
    SITE_ID,
} from "./mockOperationalEnrollmentSupabase";

const TODAY = "2026-06-15";

describe("enrollmentAgreementService", () => {
    it("creates pending_start agreement when start is in the future", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const row = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-07-01",
            todayYmd: TODAY,
        });
        expect(row.status).toBe("pending_start");
        expect(row.start_date).toBe("2026-07-01");
    });

    it("creates active agreement when start is today or past", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const row = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        expect(row.status).toBe("active");
    });

    it("rejects second operational agreement for same child and site", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        await expect(
            createChildEnrollmentAgreement(supabase, {
                orgId: ORG_ID,
                customerMemberId: MEMBER_ID,
                siteLocationId: SITE_ID,
                startDate: "2026-08-01",
                todayYmd: TODAY,
            })
        ).rejects.toMatchObject({ code: "conflict" });
    });

    it("allows new agreement at same site after prior ended (re-enrollment)", async () => {
        const store = seedOperationalEnrollmentFixtures();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const first = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await markAgreementEnded(supabase, ORG_ID, first.id, null, "2026-05-31");

        const second = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-06-15",
            todayYmd: TODAY,
        });
        expect(second.id).not.toBe(first.id);
        expect(second.status).toBe("active");
    });

    it("allows operational agreements for same child at different sites", async () => {
        const store = seedOperationalEnrollmentFixtures();
        store.locations.push({
            id: "site-2",
            org_id: ORG_ID,
            label: "East Campus",
            location_type: "site",
        });
        const supabase = createOperationalEnrollmentMockSupabase(store);
        await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        const other = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: "site-2",
            startDate: TODAY,
            todayYmd: TODAY,
        });
        expect(other.site_location_id).toBe("site-2");
    });

    it("cancels only pending_start agreements", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const row = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-08-01",
            todayYmd: TODAY,
        });
        const canceled = await cancelAgreementBeforeStart(supabase, ORG_ID, row.id);
        expect(canceled.status).toBe("canceled");

        const active = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: TODAY,
            todayYmd: TODAY,
        });
        await expect(cancelAgreementBeforeStart(supabase, ORG_ID, active.id)).rejects.toBeInstanceOf(
            OperationalEnrollmentServiceError
        );
    });

    it("marks active agreement ending with future end_date", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const row = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        const ending = await markAgreementEnding(supabase, ORG_ID, row.id, "2026-08-01", TODAY);
        expect(ending.status).toBe("ending");
        expect(ending.end_date).toBe("2026-08-01");
    });

    it("transitions ending agreements to ended when end_date passed", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(seedOperationalEnrollmentFixtures());
        const row = await createChildEnrollmentAgreement(supabase, {
            orgId: ORG_ID,
            customerMemberId: MEMBER_ID,
            siteLocationId: SITE_ID,
            startDate: "2026-01-01",
            todayYmd: TODAY,
        });
        await markAgreementEnding(supabase, ORG_ID, row.id, "2026-06-20", TODAY);
        const updated = await transitionEndingAgreementsToEnded(supabase, ORG_ID, "2026-06-21");
        expect(updated.length).toBe(1);
        expect(updated[0].status).toBe("ended");

        const operational = await getOperationalAgreementForMemberSite(
            supabase,
            ORG_ID,
            MEMBER_ID,
            SITE_ID
        );
        expect(operational).toBeNull();
    });
});
