import { formatInTimeZone } from "date-fns-tz";

/**
 * A TOUR IS SCHEDULED FOR TOMORROW OR LATER — in the site's own calendar.
 *
 * "Today" is the tour site's local date (the booking's IANA timezone), never the browser's date and
 * never UTC: at 6 PM in Bend it is already tomorrow in UTC, and a UTC check would let a same-day tour
 * through (or refuse a valid one in the morning). Enforced at the booking service for create AND
 * reschedule, so the admin, public, manual and command paths cannot bypass it; pickers only mirror it.
 *
 * Applies to NEW times only. An existing same-day booking stays viewable and is never invalidated.
 */
export const TOUR_TOO_SOON_MESSAGE = "Tours can be scheduled from tomorrow onward.";

export function tourLocalDate(at: Date, timezone: string): string {
    return formatInTimeZone(at, timezone, "yyyy-MM-dd");
}

/** The earliest date a tour may be booked for, as the site's local `yyyy-MM-dd`. */
export function earliestTourLocalDate(timezone: string, now: Date = new Date()): string {
    const [y, m, d] = tourLocalDate(now, timezone).split("-").map(Number) as [number, number, number];
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return next.toISOString().slice(0, 10);
}

export function isTourStartAllowed(startAt: Date, timezone: string, now: Date = new Date()): boolean {
    return tourLocalDate(startAt, timezone) >= earliestTourLocalDate(timezone, now);
}
