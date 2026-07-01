import { describe, expect, it } from "vitest";
import {
    effectiveAttendanceEvents,
    summarizeAttendanceByDay,
} from "@/lib/childcareOperational/attendance/attendanceFold";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

const BASE: Omit<ChildAttendanceEventRow, "id" | "event_kind" | "event_at" | "entry_type" | "corrects_event_id"> = {
    org_id: "org-1",
    enrollment_agreement_id: "agr-1",
    customer_member_id: "mem-1",
    site_location_id: "site-1",
    service_date: "2026-06-15",
    room_location_id: "room-1",
    from_room_location_id: null,
    to_room_location_id: null,
    actor_type: "staff",
    actor_user_id: "u-1",
    actor_person_id: null,
    actor_label: null,
    source_type: "operator_action",
    source_key: "operator_action",
    reason_key: null,
    note: null,
    metadata: {},
    created_by: "u-1",
    created_at: "2026-06-15T08:00:00Z",
};

function ev(p: Partial<ChildAttendanceEventRow> & Pick<ChildAttendanceEventRow, "id" | "event_kind" | "event_at">): ChildAttendanceEventRow {
    return {
        ...BASE,
        entry_type: "original",
        corrects_event_id: null,
        ...p,
    };
}

describe("attendanceFold.effectiveAttendanceEvents", () => {
    it("keeps originals not superseded", () => {
        const events = [ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z" })];
        expect(effectiveAttendanceEvents(events).map((e) => e.id)).toEqual(["e1"]);
    });

    it("correction supersedes the original and itself becomes effective", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z", room_location_id: "room-1" }),
            ev({
                id: "e2",
                event_kind: "check_in",
                event_at: "2026-06-15T08:05:00Z",
                entry_type: "correction",
                corrects_event_id: "e1",
                room_location_id: "room-2",
            }),
        ];
        const eff = effectiveAttendanceEvents(events);
        expect(eff.map((e) => e.id)).toEqual(["e2"]);
        expect(eff[0].room_location_id).toBe("room-2");
    });

    it("reversal voids the target and contributes nothing", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z" }),
            ev({
                id: "e2",
                event_kind: "check_in",
                event_at: "2026-06-15T08:05:00Z",
                entry_type: "reversal",
                corrects_event_id: "e1",
            }),
        ];
        expect(effectiveAttendanceEvents(events)).toHaveLength(0);
    });

    it("correction of a correction keeps only the latest", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z" }),
            ev({ id: "e2", event_kind: "check_in", event_at: "2026-06-15T08:05:00Z", entry_type: "correction", corrects_event_id: "e1" }),
            ev({ id: "e3", event_kind: "check_in", event_at: "2026-06-15T08:10:00Z", entry_type: "correction", corrects_event_id: "e2" }),
        ];
        expect(effectiveAttendanceEvents(events).map((e) => e.id)).toEqual(["e3"]);
    });
});

describe("attendanceFold.summarizeAttendanceByDay", () => {
    it("summarizes multiple in/out events into present + counts", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z", room_location_id: "room-1" }),
            ev({ id: "e2", event_kind: "check_out", event_at: "2026-06-15T12:00:00Z" }),
            ev({ id: "e3", event_kind: "check_in", event_at: "2026-06-15T13:00:00Z", room_location_id: "room-1" }),
            ev({ id: "e4", event_kind: "check_out", event_at: "2026-06-15T17:00:00Z" }),
        ];
        const [s] = summarizeAttendanceByDay(events);
        expect(s.present).toBe(true);
        expect(s.checkInCount).toBe(2);
        expect(s.checkOutCount).toBe(2);
        expect(s.missingCheckout).toBe(false);
        expect(s.firstCheckInAt).toBe("2026-06-15T08:00:00Z");
        expect(s.lastCheckOutAt).toBe("2026-06-15T17:00:00Z");
    });

    it("flags missing checkout", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z", room_location_id: "room-1" }),
        ];
        const [s] = summarizeAttendanceByDay(events);
        expect(s.missingCheckout).toBe(true);
        expect(s.present).toBe(true);
    });

    it("records room transfer rooms and remains present (placement untouched)", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z", room_location_id: "room-1" }),
            ev({
                id: "e2",
                event_kind: "room_transfer",
                event_at: "2026-06-15T10:00:00Z",
                room_location_id: null,
                from_room_location_id: "room-1",
                to_room_location_id: "room-2",
            }),
        ];
        const [s] = summarizeAttendanceByDay(events);
        expect(s.present).toBe(true);
        expect(s.roomsObserved).toEqual(["room-1", "room-2"]);
    });

    it("absence with no presence reads as absent", () => {
        const events = [ev({ id: "e1", event_kind: "absence", event_at: "2026-06-15T08:00:00Z", room_location_id: null })];
        const [s] = summarizeAttendanceByDay(events);
        expect(s.absent).toBe(true);
        expect(s.present).toBe(false);
    });

    it("reversed check-in does not count as present", () => {
        const events = [
            ev({ id: "e1", event_kind: "check_in", event_at: "2026-06-15T08:00:00Z", room_location_id: "room-1" }),
            ev({ id: "e2", event_kind: "check_in", event_at: "2026-06-15T08:05:00Z", entry_type: "reversal", corrects_event_id: "e1" }),
        ];
        expect(summarizeAttendanceByDay(events)).toHaveLength(0);
    });
});
