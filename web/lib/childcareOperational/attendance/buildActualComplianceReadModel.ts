/**
 * Site-level actual compliance read model (P2.1) — pure. Combines actual
 * occupancy/staffing/compliance over L4 facts with the room-mismatch view from
 * the expected-vs-actual diff. Observational; stores nothing.
 */

import type { RatioTier } from "@/lib/childcareOperational/config/ratioRules";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";
import type { ExpectedAttendanceEntry } from "@/lib/childcareOperational/expectations/scheduleExpectationCore";
import { summarizeAttendanceByDay } from "@/lib/childcareOperational/attendance/attendanceFold";
import {
    diffExpectedVsActual,
    type AttendanceVariance,
} from "@/lib/childcareOperational/attendance/expectedVsActual";
import {
    aggregateActualOccupancyByRoomDate,
    computeActualCompliance,
    computeActualStaffingByRoomDate,
    type ActualComplianceEntry,
    type ActualComplianceWarning,
    type ActualOccupancyEntry,
    type ActualStaffingEntry,
    type ActualStaffingInput,
} from "@/lib/childcareOperational/attendance/actualCompliance";

export type BuildActualComplianceReadModelInput = {
    events: readonly ChildAttendanceEventRow[];
    expectedAttendance: readonly ExpectedAttendanceEntry[];
    resolveTiers: (roomLocationId: string, date: string) => readonly RatioTier[];
    resolveCapacityBinding: (roomLocationId: string, date: string) => number | null;
    staffing?: ActualStaffingInput;
};

export type ActualComplianceReadModel = {
    actualOccupancyByRoomDate: ActualOccupancyEntry[];
    actualStaffingByRoomDate: ActualStaffingEntry[];
    compliance: ActualComplianceEntry[];
    complianceWarnings: ActualComplianceWarning[];
    roomMismatches: AttendanceVariance[];
};

export function buildActualComplianceReadModel(
    input: BuildActualComplianceReadModelInput
): ActualComplianceReadModel {
    const actualOccupancyByRoomDate = aggregateActualOccupancyByRoomDate(input.events);
    const actualStaffingByRoomDate = computeActualStaffingByRoomDate(
        actualOccupancyByRoomDate,
        input.resolveTiers
    );
    const { entries, warnings } = computeActualCompliance({
        occupancy: actualOccupancyByRoomDate,
        resolveTiers: input.resolveTiers,
        resolveCapacityBinding: input.resolveCapacityBinding,
        staffing: input.staffing,
    });

    const daySummaries = summarizeAttendanceByDay(input.events);
    const diff = diffExpectedVsActual(input.expectedAttendance, daySummaries);
    const roomMismatches = diff.variances.filter((v) => v.code === "room_mismatch");

    return {
        actualOccupancyByRoomDate,
        actualStaffingByRoomDate,
        compliance: entries,
        complianceWarnings: warnings,
        roomMismatches,
    };
}
