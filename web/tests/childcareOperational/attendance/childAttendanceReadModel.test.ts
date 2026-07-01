import { describe, expect, it } from "vitest";
import { buildChildAttendanceReadModel } from "@/lib/childcareOperational/attendance/childAttendanceReadModel";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";
import type { ExpectedAttendanceEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import type { ActualComplianceEntry } from "@/lib/childcareOperational/attendance/actualCompliance";

const DATE = "2026-06-15";

function ev(p: Partial<ChildAttendanceEventRow> & Pick<ChildAttendanceEventRow, "id" | "event_kind">): ChildAttendanceEventRow {
    return {
        org_id: "org-1",
        enrollment_agreement_id: "agr-1",
        customer_member_id: "m1",
        site_location_id: "site-1",
        entry_type: "original",
        corrects_event_id: null,
        event_at: `${DATE}T08:00:00Z`,
        service_date: DATE,
        room_location_id: null,
        from_room_location_id: null,
        to_room_location_id: null,
        actor_type: "staff",
        actor_user_id: null,
        actor_person_id: null,
        actor_label: null,
        source_type: "operator_action",
        source_key: "operator_action",
        reason_key: null,
        note: null,
        metadata: {},
        created_by: null,
        created_at: `${DATE}T08:00:00Z`,
        ...p,
    };
}

const expected: ExpectedAttendanceEntry[] = [
    {
        date: DATE,
        weekday: 1,
        agreementId: "agr-1",
        customerMemberId: "m1",
        siteLocationId: "site-1",
        roomLocationId: "room-a",
        programCategoryId: null,
        schedulePatternId: "pat-1",
        scheduleTypeKey: "full_day",
    },
];

describe("buildChildAttendanceReadModel", () => {
    it("projects timelines, room movement, current presence, and variances", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", room_location_id: "room-a", event_at: `${DATE}T08:00:00Z` }),
            ev({
                id: "e2",
                event_kind: "room_transfer",
                from_room_location_id: "room-a",
                to_room_location_id: "room-b",
                event_at: `${DATE}T10:00:00Z`,
            }),
        ];
        const rm = buildChildAttendanceReadModel({ events, expectedAttendance: expected });

        expect(rm.customerMemberId).toBe("m1");
        expect(rm.checkInOutTimeline).toHaveLength(1);
        expect(rm.roomMovementTimeline).toHaveLength(1);
        expect(rm.roomMovementTimeline[0].toRoomLocationId).toBe("room-b");
        // No checkout yet -> present, in destination room.
        expect(rm.currentPresenceState.state).toBe("present");
        expect(rm.currentPresenceState.roomLocationId).toBe("room-b");
    });

    it("reports checked_out after a checkout", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", room_location_id: "room-a" }),
            ev({ id: "e2", event_kind: "check_out", event_at: `${DATE}T17:00:00Z` }),
        ];
        const rm = buildChildAttendanceReadModel({ events, expectedAttendance: expected });
        expect(rm.currentPresenceState.state).toBe("checked_out");
        expect(rm.currentPresenceState.roomLocationId).toBeNull();
    });

    it("classifies absences and surfaces the expected_not_checked_in variance", () => {
        const events = [
            ev({ id: "e1", event_kind: "absence", reason_key: "illness", event_at: `${DATE}T07:30:00Z` }),
        ];
        const rm = buildChildAttendanceReadModel({ events, expectedAttendance: expected });
        expect(rm.absences).toHaveLength(1);
        expect(rm.absences[0].classification).toBe("excused");
        expect(rm.currentPresenceState.state).toBe("absent");
        expect(rm.expectedVsActualVariances.map((v) => v.code)).toContain("absent");
    });

    it("includes corrections as an audit trail and excludes superseded from effective timelines", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", room_location_id: "room-a" }),
            ev({
                id: "e2",
                event_kind: "check_in",
                entry_type: "correction",
                corrects_event_id: "e1",
                room_location_id: "room-b",
                event_at: `${DATE}T08:05:00Z`,
            }),
        ];
        const rm = buildChildAttendanceReadModel({ events, expectedAttendance: expected });
        expect(rm.corrections).toHaveLength(1);
        expect(rm.corrections[0].correctsEventId).toBe("e1");
        // Only the corrected (effective) check-in remains in the timeline.
        expect(rm.checkInOutTimeline).toHaveLength(1);
        expect(rm.checkInOutTimeline[0].roomLocationId).toBe("room-b");
    });

    it("filters site compliance context to the child's observed rooms/dates", () => {
        const events = [ev({ id: "e1", event_kind: "check_in", room_location_id: "room-a" })];
        const siteCompliance: ActualComplianceEntry[] = [
            { roomLocationId: "room-a", date: DATE, actualChildCount: 3, requiredStaff: 1, exceedsDefinedTiers: false, staffOnHand: null, staffingGap: null, staffDataAvailable: false, capacityBinding: null, overCapacity: false },
            { roomLocationId: "room-z", date: DATE, actualChildCount: 9, requiredStaff: 3, exceedsDefinedTiers: false, staffOnHand: null, staffingGap: null, staffDataAvailable: false, capacityBinding: null, overCapacity: false },
        ];
        const rm = buildChildAttendanceReadModel({ events, expectedAttendance: expected, siteCompliance });
        expect(rm.actualComplianceForRooms.map((c) => c.roomLocationId)).toEqual(["room-a"]);
    });

    it("is deterministic for the same input", () => {
        const events = [
            ev({ id: "e2", event_kind: "room_transfer", from_room_location_id: "room-a", to_room_location_id: "room-b", event_at: `${DATE}T10:00:00Z` }),
            ev({ id: "e1", event_kind: "check_in", room_location_id: "room-a", event_at: `${DATE}T08:00:00Z` }),
        ];
        const a = buildChildAttendanceReadModel({ events, expectedAttendance: expected });
        const b = buildChildAttendanceReadModel({ events: [...events].reverse(), expectedAttendance: expected });
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
});
