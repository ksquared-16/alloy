/**
 * D7 — the Documents clock: the organization-local calendar date every Documents evaluation runs on.
 *
 * Validity, requirement due dates and expiring-soon windows are calendar facts of the ORGANIZATION (its operational time
 * zone, `org_settings.metadata.timezone`, UTC when none is configured). The server resolves it once per read; no
 * browser clock and no UTC midnight ever decides whether a document has expired. D6 used the UTC date, which is one day
 * ahead of a Pacific organization every evening — D7 replaces it for every Documents consumer.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";

import { fetchOperationalTimezoneForOrg } from "@/lib/admin/timezoneContract";

export type DocumentsClock = { today: string; timeZone: string };

/** The calendar date of an instant in a zone (YYYY-MM-DD). An unparseable instant gives null. */
export function localDateOf(instant: string | null | undefined, timeZone: string): string | null {
    if (!instant) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(instant)) return instant;
    const d = new Date(instant);
    if (Number.isNaN(d.getTime())) return null;
    try {
        return formatInTimeZone(d, timeZone, "yyyy-MM-dd");
    } catch {
        return d.toISOString().slice(0, 10);
    }
}

export function clockAt(now: Date, timeZone: string): DocumentsClock {
    return { today: localDateOf(now.toISOString(), timeZone) ?? now.toISOString().slice(0, 10), timeZone };
}

/** Today for this organization. Falls back to UTC only when the zone cannot be read. */
export async function resolveDocumentsClock(supabase: SupabaseClient, orgId: string, now: Date = new Date()): Promise<DocumentsClock> {
    let timeZone = "UTC";
    try {
        timeZone = (await fetchOperationalTimezoneForOrg(supabase, orgId)).iana || "UTC";
    } catch {
        timeZone = "UTC";
    }
    return clockAt(now, timeZone);
}
