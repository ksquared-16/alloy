/**
 * Org/location-local service-date handling for attendance (P2.1).
 *
 * A "service date" is the local calendar day a center operates by — NOT the raw
 * UTC date. An 11pm-Pacific check-in and a 1am-Pacific check-in belong to
 * different UTC dates but may be the same or adjacent service days depending on
 * the site timezone. All attendance grouping/diffing keys on service_date, so it
 * must be derived in the center's local timezone at write time.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { fetchOrgTimeZoneIana } from "@/lib/admin/orgLocalDayBounds";

/** Pure: the local calendar date (YYYY-MM-DD) of an instant in a given IANA zone. */
export function serviceDateForInstant(eventAtIso: string, timeZone: string): string {
    const dt = new Date(eventAtIso);
    if (Number.isNaN(dt.getTime())) {
        throw new RangeError(`serviceDateForInstant: invalid timestamp ${eventAtIso}`);
    }
    return formatInTimeZone(dt, timeZone, "yyyy-MM-dd");
}

/** Resolve the org-local service date for an instant (defaults to now). */
export async function resolveAttendanceServiceDate(
    supabase: SupabaseClient,
    orgId: string,
    eventAtIso: string = new Date().toISOString()
): Promise<string> {
    const timeZone = await fetchOrgTimeZoneIana(supabase, orgId);
    return serviceDateForInstant(eventAtIso, timeZone);
}
