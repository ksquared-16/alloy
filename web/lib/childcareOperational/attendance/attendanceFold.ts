/**
 * Pure folding of the append-only attendance event stream into effective facts
 * and per-day summaries. No DB, no IO.
 *
 * Effective-fact rules:
 *  - A correction or reversal "supersedes" its target (corrects_event_id).
 *  - A superseded event is not effective.
 *  - A reversal is a tombstone: it voids its target and contributes nothing.
 *  - A non-superseded original or correction is effective (corrections carry the
 *    restated values).
 */

import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";

export type EffectiveAttendanceEvent = ChildAttendanceEventRow;

/** Events that represent current truth after applying corrections/reversals. */
export function effectiveAttendanceEvents(
    events: readonly ChildAttendanceEventRow[]
): EffectiveAttendanceEvent[] {
    const supersededIds = new Set<string>();
    for (const e of events) {
        if ((e.entry_type === "correction" || e.entry_type === "reversal") && e.corrects_event_id) {
            supersededIds.add(e.corrects_event_id);
        }
    }
    return events.filter((e) => !supersededIds.has(e.id) && e.entry_type !== "reversal");
}

export type DayAttendanceSummary = {
    enrollmentAgreementId: string;
    customerMemberId: string;
    serviceDate: string;
    present: boolean;
    absent: boolean;
    checkInCount: number;
    checkOutCount: number;
    missingCheckout: boolean;
    firstCheckInAt: string | null;
    lastCheckOutAt: string | null;
    roomsObserved: string[];
};

function dayKey(agreementId: string, serviceDate: string): string {
    return `${agreementId}::${serviceDate}`;
}

/** Summarize effective events into one record per (agreement, service_date). */
export function summarizeAttendanceByDay(
    events: readonly ChildAttendanceEventRow[]
): DayAttendanceSummary[] {
    const effective = effectiveAttendanceEvents(events);
    const byDay = new Map<string, ChildAttendanceEventRow[]>();
    for (const e of effective) {
        const k = dayKey(e.enrollment_agreement_id, e.service_date);
        const list = byDay.get(k) ?? [];
        list.push(e);
        byDay.set(k, list);
    }

    const summaries: DayAttendanceSummary[] = [];
    for (const list of byDay.values()) {
        const sorted = list.slice().sort((a, b) => a.event_at.localeCompare(b.event_at));
        const first = sorted[0];
        const checkIns = sorted.filter((e) => e.event_kind === "check_in");
        const checkOuts = sorted.filter((e) => e.event_kind === "check_out");
        const presenceKinds = sorted.filter(
            (e) => e.event_kind === "check_in" || e.event_kind === "present" || e.event_kind === "room_transfer"
        );
        const hasAbsence = sorted.some((e) => e.event_kind === "absence");
        const present = presenceKinds.length > 0;

        const rooms = new Set<string>();
        for (const e of sorted) {
            if (e.room_location_id) rooms.add(e.room_location_id);
            if (e.to_room_location_id) rooms.add(e.to_room_location_id);
        }

        summaries.push({
            enrollmentAgreementId: first.enrollment_agreement_id,
            customerMemberId: first.customer_member_id,
            serviceDate: first.service_date,
            present,
            absent: hasAbsence && !present,
            checkInCount: checkIns.length,
            checkOutCount: checkOuts.length,
            missingCheckout: checkIns.length > checkOuts.length,
            firstCheckInAt: checkIns[0]?.event_at ?? null,
            lastCheckOutAt: checkOuts.length > 0 ? checkOuts[checkOuts.length - 1].event_at : null,
            roomsObserved: [...rooms].sort(),
        });
    }

    return summaries.sort(
        (a, b) =>
            a.serviceDate.localeCompare(b.serviceDate) ||
            a.enrollmentAgreementId.localeCompare(b.enrollmentAgreementId)
    );
}
