/**
 * DB wrapper composing L3 expectations + L4 attendance facts into the
 * expected-vs-actual read model. Observational; authors neither side.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchScheduleExpectations } from "@/lib/childcareOperational/expectations/fetchScheduleExpectations";
import { listAttendanceEvents } from "@/lib/childcareOperational/attendance/attendanceService";
import { summarizeAttendanceByDay } from "@/lib/childcareOperational/attendance/attendanceFold";
import {
    diffExpectedVsActual,
    type ExpectedVsActualResult,
} from "@/lib/childcareOperational/attendance/expectedVsActual";

export type FetchExpectedVsActualInput = {
    orgId: string;
    siteLocationId: string;
    dateStart: string;
    dateEnd: string;
};

export async function fetchExpectedVsActualAttendance(
    supabase: SupabaseClient,
    input: FetchExpectedVsActualInput
): Promise<ExpectedVsActualResult> {
    const [expectations, events] = await Promise.all([
        fetchScheduleExpectations(supabase, {
            orgId: input.orgId,
            siteLocationId: input.siteLocationId,
            dateStart: input.dateStart,
            dateEnd: input.dateEnd,
        }),
        listAttendanceEvents(supabase, input.orgId, {
            siteLocationId: input.siteLocationId,
            serviceDateStart: input.dateStart,
            serviceDateEnd: input.dateEnd,
        }),
    ]);

    const daySummaries = summarizeAttendanceByDay(events);
    return diffExpectedVsActual(expectations.expectedAttendance, daySummaries);
}
