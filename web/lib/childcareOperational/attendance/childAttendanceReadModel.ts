/**
 * Child-drawer / Focus Panel Attendance read-model CONTRACT (P2.1).
 *
 * Pure, deterministic projection over one child's attendance facts + that child's
 * expected attendance. Defines the data shape a future Attendance tab / Focus
 * Panel will consume. No UI, no DB, no persistence here.
 */

import type { AttendanceEntryType, AttendanceEventKind } from "@/lib/childcareOperational/attendance/attendanceVocabulary";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";
import type { ExpectedAttendanceEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import type { ActualComplianceEntry } from "@/lib/childcareOperational/attendance/actualCompliance";
import {
    effectiveAttendanceEvents,
    summarizeAttendanceByDay,
    type DayAttendanceSummary,
} from "@/lib/childcareOperational/attendance/attendanceFold";
import {
    diffExpectedVsActual,
    type AttendanceVariance,
} from "@/lib/childcareOperational/attendance/expectedVsActual";
import {
    classifyAbsenceReason,
    type AbsenceReasonClassification,
} from "@/lib/childcareOperational/attendance/attendanceAbsenceReasons";

export type CurrentPresenceStateKind = "present" | "checked_out" | "absent" | "no_record";

export type CurrentPresenceState = {
    state: CurrentPresenceStateKind;
    serviceDate: string | null;
    roomLocationId: string | null;
};

export type AttendanceTimelineEntry = {
    eventId: string;
    kind: "check_in" | "check_out";
    at: string;
    serviceDate: string;
    roomLocationId: string | null;
    entryType: AttendanceEntryType;
};

export type RoomMovementEntry = {
    eventId: string;
    at: string;
    serviceDate: string;
    fromRoomLocationId: string | null;
    toRoomLocationId: string | null;
};

export type AbsenceEntry = {
    eventId: string;
    serviceDate: string;
    at: string;
    reasonKey: string | null;
    classification: AbsenceReasonClassification;
};

export type CorrectionEntry = {
    eventId: string;
    entryType: "correction" | "reversal";
    correctsEventId: string;
    at: string;
    eventKind: AttendanceEventKind;
};

export type ChildAttendanceReadModel = {
    customerMemberId: string | null;
    expectedAttendance: ExpectedAttendanceEntry[];
    actualPresenceSummary: DayAttendanceSummary[];
    currentPresenceState: CurrentPresenceState;
    checkInOutTimeline: AttendanceTimelineEntry[];
    roomMovementTimeline: RoomMovementEntry[];
    absences: AbsenceEntry[];
    corrections: CorrectionEntry[];
    expectedVsActualVariances: AttendanceVariance[];
    /** Optional site compliance context, filtered to the rooms/dates the child was in. */
    actualComplianceForRooms: ActualComplianceEntry[];
};

export type BuildChildAttendanceReadModelInput = {
    /** Attendance events for a single child (any number of days). */
    events: readonly ChildAttendanceEventRow[];
    /** Expected attendance entries for that child. */
    expectedAttendance: readonly ExpectedAttendanceEntry[];
    /** Service date to evaluate current presence; defaults to the latest event's service date. */
    asOfDate?: string;
    /** Optional site-level compliance to contextualize (filtered to the child's rooms/dates). */
    siteCompliance?: readonly ActualComplianceEntry[];
};

function byAtThenId(a: { at: string; eventId: string }, b: { at: string; eventId: string }): number {
    return a.at.localeCompare(b.at) || a.eventId.localeCompare(b.eventId);
}

function deriveCurrentPresence(
    effective: readonly ChildAttendanceEventRow[],
    serviceDate: string | null
): CurrentPresenceState {
    if (!serviceDate) return { state: "no_record", serviceDate: null, roomLocationId: null };

    const dayEvents = effective
        .filter((e) => e.service_date === serviceDate)
        .sort((a, b) => a.event_at.localeCompare(b.event_at) || a.id.localeCompare(b.id));

    if (dayEvents.length === 0) return { state: "no_record", serviceDate, roomLocationId: null };

    let checkIns = 0;
    let checkOuts = 0;
    let hasAbsence = false;
    let currentRoom: string | null = null;
    for (const e of dayEvents) {
        if (e.event_kind === "check_in") {
            checkIns += 1;
            currentRoom = e.room_location_id;
        } else if (e.event_kind === "check_out") {
            checkOuts += 1;
        } else if (e.event_kind === "room_transfer") {
            currentRoom = e.to_room_location_id;
        } else if (e.event_kind === "present") {
            currentRoom = e.room_location_id;
        } else if (e.event_kind === "absence") {
            hasAbsence = true;
        }
    }

    const present = checkIns > checkOuts || (checkIns === 0 && currentRoom != null);
    if (present) return { state: "present", serviceDate, roomLocationId: currentRoom };
    if (checkIns > 0) return { state: "checked_out", serviceDate, roomLocationId: null };
    if (hasAbsence) return { state: "absent", serviceDate, roomLocationId: null };
    return { state: "no_record", serviceDate, roomLocationId: null };
}

export function buildChildAttendanceReadModel(
    input: BuildChildAttendanceReadModelInput
): ChildAttendanceReadModel {
    const effective = effectiveAttendanceEvents(input.events);
    const actualPresenceSummary = summarizeAttendanceByDay(input.events);

    const customerMemberId =
        input.events[0]?.customer_member_id ?? input.expectedAttendance[0]?.customerMemberId ?? null;

    const checkInOutTimeline: AttendanceTimelineEntry[] = effective
        .filter((e) => e.event_kind === "check_in" || e.event_kind === "check_out")
        .map((e) => ({
            eventId: e.id,
            kind: e.event_kind as "check_in" | "check_out",
            at: e.event_at,
            serviceDate: e.service_date,
            roomLocationId: e.room_location_id,
            entryType: e.entry_type,
        }))
        .sort(byAtThenId);

    const roomMovementTimeline: RoomMovementEntry[] = effective
        .filter((e) => e.event_kind === "room_transfer")
        .map((e) => ({
            eventId: e.id,
            at: e.event_at,
            serviceDate: e.service_date,
            fromRoomLocationId: e.from_room_location_id,
            toRoomLocationId: e.to_room_location_id,
        }))
        .sort(byAtThenId);

    const absences: AbsenceEntry[] = effective
        .filter((e) => e.event_kind === "absence")
        .map((e) => ({
            eventId: e.id,
            serviceDate: e.service_date,
            at: e.event_at,
            reasonKey: e.reason_key,
            classification: classifyAbsenceReason(e.reason_key),
        }))
        .sort(byAtThenId);

    // Corrections/reversals are the audit trail; include ALL (not only effective).
    const corrections: CorrectionEntry[] = input.events
        .filter((e) => e.entry_type === "correction" || e.entry_type === "reversal")
        .map((e) => ({
            eventId: e.id,
            entryType: e.entry_type as "correction" | "reversal",
            correctsEventId: e.corrects_event_id as string,
            at: e.event_at,
            eventKind: e.event_kind,
        }))
        .sort(byAtThenId);

    const latestServiceDate =
        input.asOfDate ??
        (input.events.length > 0
            ? input.events.map((e) => e.service_date).sort((a, b) => b.localeCompare(a))[0]
            : null);

    const currentPresenceState = deriveCurrentPresence(effective, latestServiceDate);

    const expectedVsActualVariances = diffExpectedVsActual(
        input.expectedAttendance,
        actualPresenceSummary
    ).variances;

    // Filter site compliance to rooms/dates this child was observed in.
    const childRoomDates = new Set<string>();
    for (const s of actualPresenceSummary) {
        for (const room of s.roomsObserved) childRoomDates.add(`${room}::${s.serviceDate}`);
    }
    const actualComplianceForRooms = (input.siteCompliance ?? []).filter((c) =>
        childRoomDates.has(`${c.roomLocationId}::${c.date}`)
    );

    return {
        customerMemberId,
        expectedAttendance: [...input.expectedAttendance].sort(
            (a, b) => a.date.localeCompare(b.date) || a.agreementId.localeCompare(b.agreementId)
        ),
        actualPresenceSummary,
        currentPresenceState,
        checkInOutTimeline,
        roomMovementTimeline,
        absences,
        corrections,
        expectedVsActualVariances,
        actualComplianceForRooms,
    };
}
