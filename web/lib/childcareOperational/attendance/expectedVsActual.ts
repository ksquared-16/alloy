/**
 * Pure expected-vs-actual attendance diff (read model / projection over L3
 * Expectations and L4 Facts). Observational only — authors neither side.
 *
 * Inputs:
 *  - expectedAttendance: ExpectedAttendanceEntry[] from L3
 *    (web/lib/childcareOperational/expectations/scheduleExpectationCore.ts)
 *  - daySummaries: DayAttendanceSummary[] folded from L4 facts
 *    (web/lib/childcareOperational/attendance/attendanceFold.ts)
 */

import type { ExpectedAttendanceEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import type { DayAttendanceSummary } from "@/lib/childcareOperational/attendance/attendanceFold";

export type AttendanceVarianceCode =
    | "expected_not_checked_in"
    | "checked_in_not_expected"
    | "absent"
    | "late_arrival_unknown_time"
    | "missing_checkout"
    | "room_mismatch";

export type AttendanceVariance = {
    code: AttendanceVarianceCode;
    serviceDate: string;
    enrollmentAgreementId: string;
    customerMemberId: string;
    expectedRoomLocationId?: string | null;
    observedRoomLocationIds?: string[];
    detail: string;
};

export type ExpectedVsActualResult = {
    variances: AttendanceVariance[];
    matchedCount: number;
    expectedCount: number;
    actualPresentCount: number;
};

function key(agreementId: string, serviceDate: string): string {
    return `${agreementId}::${serviceDate}`;
}

export function diffExpectedVsActual(
    expectedAttendance: readonly ExpectedAttendanceEntry[],
    daySummaries: readonly DayAttendanceSummary[]
): ExpectedVsActualResult {
    const summaryByKey = new Map<string, DayAttendanceSummary>();
    for (const s of daySummaries) {
        summaryByKey.set(key(s.enrollmentAgreementId, s.serviceDate), s);
    }
    const expectedByKey = new Map<string, ExpectedAttendanceEntry>();
    for (const e of expectedAttendance) {
        expectedByKey.set(key(e.agreementId, e.date), e);
    }

    const variances: AttendanceVariance[] = [];
    let matchedCount = 0;

    // Expected side: not checked in, absent, late-without-time, room mismatch.
    for (const e of expectedAttendance) {
        const summary = summaryByKey.get(key(e.agreementId, e.date));
        const base = {
            serviceDate: e.date,
            enrollmentAgreementId: e.agreementId,
            customerMemberId: e.customerMemberId,
            expectedRoomLocationId: e.roomLocationId,
        };

        if (!summary || (!summary.present && !summary.absent)) {
            variances.push({
                ...base,
                code: "expected_not_checked_in",
                detail: "child expected but no presence or absence fact recorded",
            });
            continue;
        }
        if (summary.absent) {
            variances.push({ ...base, code: "absent", detail: "child expected but recorded absent" });
            continue;
        }

        // present
        matchedCount += 1;
        if (summary.checkInCount === 0) {
            variances.push({
                ...base,
                code: "late_arrival_unknown_time",
                detail: "presence recorded without a timed check-in",
                observedRoomLocationIds: summary.roomsObserved,
            });
        }
        if (summary.missingCheckout) {
            variances.push({
                ...base,
                code: "missing_checkout",
                detail: "check-in without a matching check-out",
                observedRoomLocationIds: summary.roomsObserved,
            });
        }
        if (
            e.roomLocationId &&
            summary.roomsObserved.length > 0 &&
            !summary.roomsObserved.includes(e.roomLocationId)
        ) {
            variances.push({
                ...base,
                code: "room_mismatch",
                detail: "observed room(s) do not include the expected placement room",
                observedRoomLocationIds: summary.roomsObserved,
            });
        }
    }

    // Actual side: present but not expected.
    let actualPresentCount = 0;
    for (const s of daySummaries) {
        if (s.present) actualPresentCount += 1;
        if (s.present && !expectedByKey.has(key(s.enrollmentAgreementId, s.serviceDate))) {
            variances.push({
                code: "checked_in_not_expected",
                serviceDate: s.serviceDate,
                enrollmentAgreementId: s.enrollmentAgreementId,
                customerMemberId: s.customerMemberId,
                observedRoomLocationIds: s.roomsObserved,
                detail: "presence recorded for a child not expected on this date",
            });
        }
    }

    return {
        variances,
        matchedCount,
        expectedCount: expectedAttendance.length,
        actualPresentCount,
    };
}
