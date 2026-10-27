/**
 * Location time for the Operating Calendar — local dates and wall-clock
 * intervals, turned into instants in the location's IANA zone.
 *
 * Never the operator's browser zone, and never UTC day boundaries: "closed on
 * the 25th" means the location's 25th, midnight to midnight where the location
 * is. A DST day is 23 or 25 hours long and stays one calendar day.
 */

import { formatInTimeZone, toDate } from "date-fns-tz";
import { isValidIanaTimeZone } from "@/lib/admin/timezoneContract";

export { isValidIanaTimeZone };

/** The next calendar date (pure date arithmetic, no zone involved). */
export function addCalendarDays(ymd: string, days: number): string {
    const d = new Date(`${ymd}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
}

/** Inclusive list of calendar dates. */
export function calendarDatesBetween(fromYmd: string, toYmd: string): string[] {
    const out: string[] = [];
    for (let d = fromYmd; d <= toYmd; d = addCalendarDays(d, 1)) out.push(d);
    return out;
}

/** The instant a local midnight begins. Midnight always exists in IANA zones used here. */
export function localMidnight(ymd: string, timeZone: string): Date {
    return toDate(`${ymd}T00:00:00`, { timeZone });
}

/**
 * The instant of a wall-clock minute on a local date. `minutes = 1440` is the
 * next local midnight, so "until 24:00" ends exactly where the day does.
 */
export function wallInstant(ymd: string, minutes: number, timeZone: string): Date {
    if (minutes >= 24 * 60) return localMidnight(addCalendarDays(ymd, 1), timeZone);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return toDate(`${ymd}T${hh}:${mm}:00`, { timeZone });
}

/**
 * Whether a wall-clock time exists on that date. On a spring-forward day,
 * 02:30 never happens; converting it silently would move the operator's hour.
 */
export function wallTimeExists(ymd: string, minutes: number, timeZone: string): boolean {
    if (minutes >= 24 * 60) return true;
    const instant = wallInstant(ymd, minutes, timeZone);
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    return formatInTimeZone(instant, timeZone, "yyyy-MM-dd HH:mm") === `${ymd} ${hh}:${mm}`;
}

/** The local calendar date an instant falls on. */
export function localDateOf(instant: Date, timeZone: string): string {
    return formatInTimeZone(instant, timeZone, "yyyy-MM-dd");
}

/** Minutes after local midnight of the instant's own local date. */
export function localMinutesOf(instant: Date, timeZone: string): number {
    const ymd = localDateOf(instant, timeZone);
    return Math.round((instant.getTime() - localMidnight(ymd, timeZone).getTime()) / 60_000);
}

/**
 * The half-open valid-time window covering local dates `from..to` inclusive:
 * local midnight of `from` to local midnight after `to`.
 */
export function localDateRangeWindow(fromYmd: string, toYmd: string, timeZone: string): { validFrom: string; validTo: string } {
    return {
        validFrom: localMidnight(fromYmd, timeZone).toISOString(),
        validTo: localMidnight(addCalendarDays(toYmd, 1), timeZone).toISOString(),
    };
}

/** The coordinate a calendar lineage is resolved at for one local date: local noon. */
export function localNoon(ymd: string, timeZone: string): string {
    return toDate(`${ymd}T12:00:00`, { timeZone }).toISOString();
}
