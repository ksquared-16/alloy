import { describe, expect, it, vi, beforeEach } from "vitest";

const emitEventMock = vi.fn().mockResolvedValue("evt-test");
vi.mock("@/lib/emitEvent", () => ({
    emitEvent: (...args: unknown[]) => emitEventMock(...args),
}));

import {
    correctAttendanceEvent,
    listAttendanceEvents,
    recordAttendanceEvent,
    assertNoAttendanceMutation,
} from "@/lib/childcareOperational/attendance/attendanceService";
import {
    createOperationalEnrollmentMockSupabase,
    createOperationalEnrollmentMockStore,
    MEMBER_ID,
    ORG_ID,
    SITE_ID,
    UNIT_ID,
} from "../mockOperationalEnrollmentSupabase";

const AGREEMENT_ID = "agr-1";

function storeWithAgreement(status = "active") {
    return createOperationalEnrollmentMockStore({
        customer_members: [{ id: MEMBER_ID, org_id: ORG_ID, customer_id: "cust-1", person_id: "person-1" }],
        locations: [
            { id: SITE_ID, org_id: ORG_ID, location_type: "site" },
            { id: UNIT_ID, org_id: ORG_ID, location_type: "unit", parent_location_id: SITE_ID },
        ],
        child_enrollment_agreements: [
            {
                id: AGREEMENT_ID,
                org_id: ORG_ID,
                customer_member_id: MEMBER_ID,
                site_location_id: SITE_ID,
                status,
                start_date: "2026-06-01",
            },
        ],
    });
}

const ACTOR = { actorType: "staff" as const, actorUserId: "u-1" };

describe("attendanceService.recordAttendanceEvent", () => {
    beforeEach(() => emitEventMock.mockClear());

    it("records a check-in fact and emits a workflow event", async () => {
        const store = storeWithAgreement();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const event = await recordAttendanceEvent(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "check_in",
            eventAt: "2026-06-15T08:00:00Z",
            serviceDate: "2026-06-15",
            roomLocationId: UNIT_ID,
            actor: ACTOR,
        });
        expect(event.entry_type).toBe("original");
        expect(event.event_kind).toBe("check_in");
        expect(event.customer_member_id).toBe(MEMBER_ID);
        expect(event.site_location_id).toBe(SITE_ID);
        expect(store.child_attendance_events).toHaveLength(1);
        expect(emitEventMock).toHaveBeenCalledTimes(1);
        expect(emitEventMock.mock.calls[0][0]).toMatchObject({
            event_type: "attendance_event_recorded",
            entity_type: "child_attendance_events",
        });
    });

    it("requires a room for check_in", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(storeWithAgreement());
        await expect(
            recordAttendanceEvent(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                eventKind: "check_in",
                eventAt: "2026-06-15T08:00:00Z",
                serviceDate: "2026-06-15",
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("requires from/to rooms for room_transfer", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(storeWithAgreement());
        await expect(
            recordAttendanceEvent(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                eventKind: "room_transfer",
                eventAt: "2026-06-15T10:00:00Z",
                serviceDate: "2026-06-15",
                fromRoomLocationId: UNIT_ID,
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ code: "invalid_input" });
    });

    it("rejects attendance against a canceled agreement", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(storeWithAgreement("canceled"));
        await expect(
            recordAttendanceEvent(supabase, {
                orgId: ORG_ID,
                enrollmentAgreementId: AGREEMENT_ID,
                eventKind: "absence",
                eventAt: "2026-06-15T08:00:00Z",
                serviceDate: "2026-06-15",
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ code: "invalid_state" });
    });

    it("accepts varied actor and source contexts", async () => {
        const supabase = createOperationalEnrollmentMockSupabase(storeWithAgreement());
        const event = await recordAttendanceEvent(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "check_in",
            eventAt: "2026-06-15T08:00:00Z",
            serviceDate: "2026-06-15",
            roomLocationId: UNIT_ID,
            actor: { actorType: "parent", actorLabel: "Parent", sourceType: "parent_portal" },
        });
        expect(event.actor_type).toBe("parent");
        expect(event.source_type).toBe("parent_portal");
    });
});

describe("attendanceService.correctAttendanceEvent", () => {
    beforeEach(() => emitEventMock.mockClear());

    it("authors a correction as a new row referencing the target (no mutation)", async () => {
        const store = storeWithAgreement();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const original = await recordAttendanceEvent(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "check_in",
            eventAt: "2026-06-15T08:00:00Z",
            serviceDate: "2026-06-15",
            roomLocationId: UNIT_ID,
            actor: ACTOR,
        });
        const correction = await correctAttendanceEvent(supabase, {
            orgId: ORG_ID,
            entryType: "correction",
            correctsEventId: original.id,
            eventKind: "check_in",
            eventAt: "2026-06-15T08:30:00Z",
            serviceDate: "2026-06-15",
            roomLocationId: UNIT_ID,
            actor: ACTOR,
        });
        expect(correction.entry_type).toBe("correction");
        expect(correction.corrects_event_id).toBe(original.id);
        // original row remains untouched in history
        expect(store.child_attendance_events).toHaveLength(2);
        const stillOriginal = store.child_attendance_events.find((r) => r.id === original.id);
        expect(stillOriginal?.entry_type).toBe("original");
        expect(emitEventMock.mock.calls.at(-1)?.[0]).toMatchObject({ event_type: "attendance_event_corrected" });
    });

    it("authors a reversal that emits a reversed event", async () => {
        const store = storeWithAgreement();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const original = await recordAttendanceEvent(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "absence",
            eventAt: "2026-06-15T08:00:00Z",
            serviceDate: "2026-06-15",
            actor: ACTOR,
        });
        const reversal = await correctAttendanceEvent(supabase, {
            orgId: ORG_ID,
            entryType: "reversal",
            correctsEventId: original.id,
            eventKind: "absence",
            eventAt: "2026-06-15T09:00:00Z",
            serviceDate: "2026-06-15",
            actor: ACTOR,
        });
        expect(reversal.entry_type).toBe("reversal");
        expect(emitEventMock.mock.calls.at(-1)?.[0]).toMatchObject({ event_type: "attendance_event_reversed" });
    });

    it("refuses to correct a reversal", async () => {
        const store = storeWithAgreement();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        const original = await recordAttendanceEvent(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "absence",
            eventAt: "2026-06-15T08:00:00Z",
            serviceDate: "2026-06-15",
            actor: ACTOR,
        });
        const reversal = await correctAttendanceEvent(supabase, {
            orgId: ORG_ID,
            entryType: "reversal",
            correctsEventId: original.id,
            eventKind: "absence",
            eventAt: "2026-06-15T09:00:00Z",
            serviceDate: "2026-06-15",
            actor: ACTOR,
        });
        await expect(
            correctAttendanceEvent(supabase, {
                orgId: ORG_ID,
                entryType: "correction",
                correctsEventId: reversal.id,
                eventKind: "absence",
                eventAt: "2026-06-15T10:00:00Z",
                serviceDate: "2026-06-15",
                actor: ACTOR,
            })
        ).rejects.toMatchObject({ code: "invalid_state" });
    });
});

describe("attendanceService.listAttendanceEvents + immutability guard", () => {
    it("lists events for an agreement", async () => {
        const store = storeWithAgreement();
        const supabase = createOperationalEnrollmentMockSupabase(store);
        await recordAttendanceEvent(supabase, {
            orgId: ORG_ID,
            enrollmentAgreementId: AGREEMENT_ID,
            eventKind: "check_in",
            eventAt: "2026-06-15T08:00:00Z",
            serviceDate: "2026-06-15",
            roomLocationId: UNIT_ID,
            actor: ACTOR,
        });
        const events = await listAttendanceEvents(supabase, ORG_ID, { enrollmentAgreementId: AGREEMENT_ID });
        expect(events).toHaveLength(1);
    });

    it("assertNoAttendanceMutation always throws", () => {
        expect(() => assertNoAttendanceMutation()).toThrow();
    });
});
