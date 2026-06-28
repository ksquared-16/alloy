import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/emitEvent", () => ({
    emitEvent: vi.fn().mockResolvedValue("evt-test"),
}));

import { recordAttendanceEvent } from "@/lib/childcareOperational/attendance/attendanceService";
import {
    createOperationalEnrollmentMockSupabase,
    createOperationalEnrollmentMockStore,
    MEMBER_ID,
    ORG_ID,
    SITE_ID,
    UNIT_ID,
} from "../mockOperationalEnrollmentSupabase";

const AGREEMENT_ID = "agr-1";
const ACTOR = { actorType: "staff" as const, actorUserId: "u-1" };

function supa() {
    const store = createOperationalEnrollmentMockStore({
        customer_members: [{ id: MEMBER_ID, org_id: ORG_ID, customer_id: "cust-1", person_id: "person-1" }],
        locations: [
            { id: SITE_ID, org_id: ORG_ID, location_type: "site" },
            { id: UNIT_ID, org_id: ORG_ID, location_type: "unit", parent_location_id: SITE_ID },
        ],
        child_enrollment_agreements: [
            { id: AGREEMENT_ID, org_id: ORG_ID, customer_member_id: MEMBER_ID, site_location_id: SITE_ID, status: "active", start_date: "2026-06-01" },
        ],
    });
    return createOperationalEnrollmentMockSupabase(store);
}

describe("attendance service hardening (P2.1)", () => {
    it("derives the org-local service date from eventAt + timeZone when serviceDate omitted", async () => {
        // 06:00 UTC -> 23:00 prior day in Los Angeles -> service date 2026-06-14.
        const event = await recordAttendanceEvent(supa(), {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "check_in",
            eventAt: "2026-06-15T06:00:00Z",
            timeZone: "America/Los_Angeles",
            roomLocationId: UNIT_ID,
            actor: ACTOR,
        });
        expect(event.service_date).toBe("2026-06-14");
    });

    it("prefers an explicit serviceDate over timeZone derivation", async () => {
        const event = await recordAttendanceEvent(supa(), {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "check_in",
            eventAt: "2026-06-15T06:00:00Z",
            serviceDate: "2026-06-15",
            timeZone: "America/Los_Angeles",
            roomLocationId: UNIT_ID,
            actor: ACTOR,
        });
        expect(event.service_date).toBe("2026-06-15");
    });

    it("rejects when neither serviceDate nor timeZone is provided", async () => {
        await expect(
            recordAttendanceEvent(supa(), {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                eventKind: "check_in",
                eventAt: "2026-06-15T06:00:00Z",
                roomLocationId: UNIT_ID,
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("accepts a known absence reason and stores it", async () => {
        const event = await recordAttendanceEvent(supa(), {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "absence",
            eventAt: "2026-06-15T07:30:00Z",
            serviceDate: "2026-06-15",
            reasonKey: "illness",
            actor: ACTOR,
        });
        expect(event.reason_key).toBe("illness");
    });

    it("rejects an unknown absence reason", async () => {
        await expect(
            recordAttendanceEvent(supa(), {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                eventKind: "absence",
                eventAt: "2026-06-15T07:30:00Z",
                serviceDate: "2026-06-15",
                reasonKey: "totally_made_up",
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
    });
});
