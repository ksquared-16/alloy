/**
 * Org-local calendar day bounds in UTC for scheduling / “today’s board” filters.
 * Operational calendar uses org_settings.metadata (see timezoneContract).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, startOfDay } from "date-fns";
import { toDate, toZonedTime, fromZonedTime, formatInTimeZone } from "date-fns-tz";
import { fetchOperationalTimezoneForOrg } from "@/lib/admin/timezoneContract";

/**
 * Load IANA time zone for an org (operational calendar). org_settings.metadata.timezone | time_zone | UTC.
 */
export async function fetchOrgTimeZoneIana(supabase: SupabaseClient, orgId: string): Promise<string> {
    const { iana } = await fetchOperationalTimezoneForOrg(supabase, orgId);
    return iana;
}

export type OrgLocalDayUtcBounds = {
    /** Inclusive start of org-local calendar day (UTC instant). */
    dayStartUtc: Date;
    /** Exclusive end of that day — use `start_at < dayEndExclusiveUtc` in queries. */
    dayEndExclusiveUtc: Date;
};

/**
 * “Today” in the org’s time zone: [dayStartUtc, dayEndExclusiveUtc).
 */
export function getOrgLocalTodayUtcBounds(timeZone: string, refUtc: Date = new Date()): OrgLocalDayUtcBounds {
    const zoned = toZonedTime(refUtc, timeZone);
    const localStart = startOfDay(zoned);
    const dayStartUtc = fromZonedTime(localStart, timeZone);
    const dayEndExclusiveUtc = fromZonedTime(addDays(localStart, 1), timeZone);
    return { dayStartUtc, dayEndExclusiveUtc };
}

/**
 * A specific org-local calendar date (YYYY-MM-DD) in the org time zone.
 */
export function getOrgLocalYmdUtcBounds(ymd: string, timeZone: string): OrgLocalDayUtcBounds {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
    if (!m) {
        throw new RangeError(`Invalid scheduled_on date: ${ymd}`);
    }
    const ymdStr = `${m[1]}-${m[2]}-${m[3]}`;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const nextCal = new Date(Date.UTC(y, mo - 1, d + 1));
    const nextStr = `${nextCal.getUTCFullYear()}-${String(nextCal.getUTCMonth() + 1).padStart(2, "0")}-${String(nextCal.getUTCDate()).padStart(2, "0")}`;
    const dayStartUtc = toDate(`${ymdStr}T00:00:00`, { timeZone });
    const dayEndExclusiveUtc = toDate(`${nextStr}T00:00:00`, { timeZone });
    return { dayStartUtc, dayEndExclusiveUtc };
}

/**
 * Resolve `scheduled_on=today` or `scheduled_on=YYYY-MM-DD` to UTC bounds.
 */
export function resolveScheduledOnBounds(
    scheduledOnRaw: string,
    timeZone: string,
    refUtc: Date = new Date()
): OrgLocalDayUtcBounds {
    const s = scheduledOnRaw.trim().toLowerCase();
    if (s === "today") {
        return getOrgLocalTodayUtcBounds(timeZone, refUtc);
    }
    return getOrgLocalYmdUtcBounds(scheduledOnRaw.trim(), timeZone);
}

/** Inclusive org-local calendar dates for month-to-date, plus UTC bounds for API metadata. */
export type OrgOperationalMonthToDateWindow = {
    mtd_start_local_date: string;
    mtd_end_local_date: string;
    /** Inclusive start of first MTD day in UTC (for timestamptz semantics). */
    mtd_start_utc: string;
    /** Exclusive end of MTD period (start of day after `mtd_end_local_date` in org TZ). */
    mtd_end_exclusive_utc: string;
};

/**
 * Resolve financial MTD using `gl_journal_entries.entry_date` (DATE):
 * - MTD start = first calendar day of the current month in org operational TZ
 * - MTD end = current org-local calendar day ("today" in that TZ)
 *
 * Queries should use `mtd_start_local_date` / `mtd_end_local_date` as YYYY-MM-DD strings against `entry_date`.
 */
export function resolveOrgOperationalMonthToDateForFinancialMtd(
    timeZone: string,
    refUtc: Date = new Date()
): OrgOperationalMonthToDateWindow {
    const mtd_end_local_date = formatInTimeZone(refUtc, timeZone, "yyyy-MM-dd");
    const [yStr, mStr] = mtd_end_local_date.split("-");
    const mtd_start_local_date = `${yStr}-${mStr}-01`;
    const startBounds = getOrgLocalYmdUtcBounds(mtd_start_local_date, timeZone);
    const endBounds = getOrgLocalYmdUtcBounds(mtd_end_local_date, timeZone);
    return {
        mtd_start_local_date,
        mtd_end_local_date,
        mtd_start_utc: startBounds.dayStartUtc.toISOString(),
        mtd_end_exclusive_utc: endBounds.dayEndExclusiveUtc.toISOString(),
    };
}
