/**
 * Org-local calendar day bounds in UTC for scheduling / “today’s board” filters.
 * Time zone source: org_settings.metadata.timezone (IANA), else metadata.time_zone, else UTC.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, parseISO, format, startOfDay } from "date-fns";
import { toDate, toZonedTime, fromZonedTime } from "date-fns-tz";

const FALLBACK_TZ = "UTC";

function isValidIanaTimeZone(tz: string): boolean {
    try {
        Intl.DateTimeFormat(undefined, { timeZone: tz });
        return true;
    } catch {
        return false;
    }
}

/**
 * Load IANA time zone for an org. Single source: org_settings.metadata.timezone or .time_zone.
 */
export async function fetchOrgTimeZoneIana(supabase: SupabaseClient, orgId: string): Promise<string> {
    const { data, error } = await supabase.from("org_settings").select("metadata").eq("org_id", orgId).maybeSingle();
    if (error || !data) {
        return FALLBACK_TZ;
    }
    const meta = (data as { metadata?: Record<string, unknown> }).metadata ?? {};
    const raw =
        typeof meta.timezone === "string" && meta.timezone.trim()
            ? meta.timezone.trim()
            : typeof meta.time_zone === "string" && meta.time_zone.trim()
              ? meta.time_zone.trim()
              : FALLBACK_TZ;
    return isValidIanaTimeZone(raw) ? raw : FALLBACK_TZ;
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
    const base = parseISO(`${ymdStr}T00:00:00.000Z`);
    const nextStr = format(addDays(base, 1), "yyyy-MM-dd");
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
