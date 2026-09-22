/**
 * AVAILABILITY, FOR A WHOLE SITE AT ONCE.
 *
 * `resolveAvailabilityForEmployment` answers for one person on one day and
 * issues two queries to do it. A staffing projection asks the same question for
 * every employed person across a date range, and the per-employment shape turns
 * that into two queries per person per call — the read that would make the
 * projection unusable for Operations while looking correct in a unit test.
 *
 * Two queries for the whole set, then the SAME pure resolver per employment·date.
 * The resolver is not reimplemented here and must not be: precedence is the part
 * of Availability that is easy to get subtly wrong (an `unavailable` exception
 * replaces the recurring pattern rather than subtracting from it, and outranks an
 * `available` one on the same date), and two implementations of that rule would
 * eventually disagree about whether someone can be asked to work.
 *
 * Paged, because PostgREST caps a response at 1000 rows: a site with a year of
 * recurring windows and a season of exceptions crosses that quietly, and the
 * failure mode is a person who reads as unavailable because their rows were
 * beyond the cap.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    resolveAvailabilityForDate,
    type ResolvedAvailability,
    type StaffAvailabilityExceptionRow,
    type StaffAvailabilityWindowRow,
} from "@/lib/staffAvailability/staffAvailabilityModel";
import { StaffAvailabilityError } from "@/lib/staffAvailability/staffAvailabilityService";

const WINDOW_COLUMNS =
    "id, org_id, employment_id, weekday, start_time, end_time, effective_start, effective_end, is_active";
const EXCEPTION_COLUMNS =
    "id, org_id, employment_id, exception_date, exception_kind, start_time, end_time, reason, is_active";

const PAGE = 1000;

async function pageAll<T>(
    run: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>
): Promise<T[]> {
    const out: T[] = [];
    for (let from = 0; ; from += PAGE) {
        const { data, error } = await run(from, from + PAGE - 1);
        if (error) throw new StaffAvailabilityError("db_error", error.message);
        const rows = (data ?? []) as T[];
        out.push(...rows);
        if (rows.length < PAGE) break;
    }
    return out;
}

export type AvailabilityBatchInput = {
    orgId: string;
    employmentIds: readonly string[];
    dates: readonly string[];
};

/**
 * `byEmployment.get(employmentId)?.get(date)` — a resolved answer, with the same
 * provenance the single-employment read carries. An employment with no rows at
 * all still gets an answer for every date: `available: false` with a `no_pattern`
 * provenance, which is a real answer and not a gap in the map.
 */
export type AvailabilityBatch = {
    byEmployment: Map<string, Map<string, ResolvedAvailability>>;
    windowCount: number;
    exceptionCount: number;
};

export async function fetchAvailabilityBatch(
    supabase: SupabaseClient,
    input: AvailabilityBatchInput
): Promise<AvailabilityBatch> {
    const employmentIds = [...new Set(input.employmentIds)].filter(Boolean);
    const dates = [...new Set(input.dates)].sort();
    const byEmployment = new Map<string, Map<string, ResolvedAvailability>>();
    if (employmentIds.length === 0 || dates.length === 0) {
        return { byEmployment, windowCount: 0, exceptionCount: 0 };
    }

    const [windows, exceptions] = await Promise.all([
        pageAll<StaffAvailabilityWindowRow>((from, to) =>
            supabase
                .from("staff_availability_windows")
                .select(WINDOW_COLUMNS)
                .eq("org_id", input.orgId)
                .in("employment_id", employmentIds)
                .order("employment_id")
                .order("weekday")
                .order("start_time")
                .range(from, to)
        ),
        pageAll<StaffAvailabilityExceptionRow>((from, to) =>
            supabase
                .from("staff_availability_exceptions")
                .select(EXCEPTION_COLUMNS)
                .eq("org_id", input.orgId)
                .in("employment_id", employmentIds)
                // Only the dates being projected; an employment's whole exception
                // history is not needed to answer about one week.
                .gte("exception_date", dates[0])
                .lte("exception_date", dates[dates.length - 1])
                .order("employment_id")
                .order("exception_date")
                .range(from, to)
        ),
    ]);

    const windowsBy = new Map<string, StaffAvailabilityWindowRow[]>();
    for (const w of windows) {
        windowsBy.set(w.employment_id, [...(windowsBy.get(w.employment_id) ?? []), w]);
    }
    const exceptionsBy = new Map<string, StaffAvailabilityExceptionRow[]>();
    for (const e of exceptions) {
        exceptionsBy.set(e.employment_id, [...(exceptionsBy.get(e.employment_id) ?? []), e]);
    }

    for (const employmentId of employmentIds) {
        const w = windowsBy.get(employmentId) ?? [];
        const e = exceptionsBy.get(employmentId) ?? [];
        const perDate = new Map<string, ResolvedAvailability>();
        for (const date of dates) {
            perDate.set(date, resolveAvailabilityForDate(w, e, date));
        }
        byEmployment.set(employmentId, perDate);
    }

    return { byEmployment, windowCount: windows.length, exceptionCount: exceptions.length };
}
