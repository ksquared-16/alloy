/**
 * Tour bookings the Operating Calendar now says fall outside operating time.
 *
 * ── ATTENTION, NOT ACTION ──
 *
 * A closure authored after a family booked does NOT cancel, move or refund that
 * booking, and does not message anyone. The booking keeps its row, its status and
 * its history; it keeps counting toward its slot's capacity. What changes is that
 * an operator can SEE it: this module answers "which active bookings does the
 * calendar now disagree with?", derived on read from the same resolver the slot
 * generator uses — no stored flag, no parallel booking state, no Work Item. The
 * operator resolves it with the existing reschedule / cancel actions, which the
 * calendar already constrains (a reschedule can only land on an open slot).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { calendarSiteFor, loadOperatingCalendarForInstants } from "@/lib/operatingCalendar/operatingCalendarServer";
import { localDateOf, localMinutesOf } from "@/lib/operatingCalendar/operatingCalendarTime";
import { wallMinutes } from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import type { CalendarDayEntry, ResolvedCalendarDay } from "@/lib/operatingCalendar/resolveOperatingCalendar";
import { TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS } from "@/lib/tours/constants";

export type TourCalendarAttentionReason = "closed" | "outside_hours" | "undetermined";

export type CalendarAffectedTourBooking = {
    bookingId: string;
    opportunityId: string | null;
    primaryPersonId: string | null;
    locationId: string;
    siteId: string;
    startAt: string;
    endAt: string;
    timezone: string | null;
    statusKey: string;
    reason: TourCalendarAttentionReason;
    /** The calendar entries that decided the day, by name. */
    entryNames: string[];
};

type BookingRow = {
    id: string;
    opportunity_id: string | null;
    primary_person_id: string | null;
    location_id: string;
    start_at: string;
    end_at: string;
    timezone: string | null;
    status_key: string;
};

/** The most bookings one attention read considers. */
export const TOUR_ATTENTION_BOOKING_LIMIT = 1000;

/**
 * Judge given bookings against each one's location calendar. Bookings are grouped by
 * location so each calendar is read once.
 */
export async function judgeTourBookingsAgainstCalendar(
    supabase: SupabaseClient,
    params: { orgId: string; bookings: readonly BookingRow[]; hypotheticalRows?: readonly ExpectationQueryRow[] },
): Promise<CalendarAffectedTourBooking[]> {
    const byLocation = new Map<string, BookingRow[]>();
    for (const b of params.bookings) {
        const list = byLocation.get(b.location_id);
        if (list) list.push(b);
        else byLocation.set(b.location_id, [b]);
    }
    const out: CalendarAffectedTourBooking[] = [];
    for (const [locationId, list] of byLocation) {
        const from = new Date(Math.min(...list.map((b) => Date.parse(b.start_at))));
        const to = new Date(Math.max(...list.map((b) => Date.parse(b.end_at))));
        const cal = await loadOperatingCalendarForInstants(supabase, {
            orgId: params.orgId,
            locationId,
            fromUtc: from,
            toUtc: to,
            fallbackTimezone: list.find((b) => b.timezone)?.timezone ?? null,
            hypotheticalRows: params.hypotheticalRows,
        });
        for (const b of list) {
            const start = new Date(b.start_at);
            const end = new Date(b.end_at);
            if (cal.isOperating(start, end)) continue;
            const day = cal.days.get(localDateOf(start, cal.timezone));
            const reason: TourCalendarAttentionReason =
                !day || day.status === "unresolved" ? "undetermined" : day.status === "closed" ? "closed" : "outside_hours";
            out.push({
                bookingId: b.id,
                opportunityId: b.opportunity_id,
                primaryPersonId: b.primary_person_id,
                locationId,
                siteId: cal.siteId,
                startAt: b.start_at,
                endAt: b.end_at,
                timezone: b.timezone,
                statusKey: b.status_key,
                reason,
                entryNames: causingEntries(day, localMinutesOf(start, cal.timezone), localMinutesOf(start, cal.timezone) + (end.getTime() - start.getTime()) / 60_000)
                    .map((e) => e.name)
                    .filter(Boolean),
            });
        }
    }
    return out.sort((a, b) => (a.startAt < b.startAt ? -1 : a.startAt > b.startAt ? 1 : a.bookingId < b.bookingId ? -1 : 1));
}

/**
 * The entries that actually exclude a booking: the full-day closures on a closed day; otherwise
 * the modified hours and the partial closures that overlap it — not every entry that day.
 */
function causingEntries(day: ResolvedCalendarDay | undefined, startMin: number, endMin: number): CalendarDayEntry[] {
    if (!day) return [];
    const closed = day.applied.filter((e) => e.effect === "closed");
    if (closed.length > 0) return closed;
    const hits = day.applied.filter((e) => {
        if (e.effect === "modified_hours") return true;
        if (e.effect !== "partial_closure" || !e.startTime || !e.endTime) return false;
        const s = wallMinutes(e.startTime) ?? 0;
        const t = wallMinutes(e.endTime, { allowEndOfDay: true }) ?? 1440;
        return startMin < t && s < endMin;
    });
    return hits.length > 0 ? hits : day.applied;
}

/**
 * Active bookings starting in [fromUtc, toUtc) at the given sites (or every site) that the
 * calendar — as it stands, or with an unwritten act added — puts outside operating time.
 */
export async function listCalendarAffectedTourBookings(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        /** Null = every site in the org. */
        siteIds: readonly string[] | null;
        fromUtc: Date;
        toUtc: Date;
        hypotheticalRows?: readonly ExpectationQueryRow[];
    },
): Promise<CalendarAffectedTourBooking[]> {
    const { data, error } = await supabase
        .from("tour_bookings")
        .select("id, opportunity_id, primary_person_id, location_id, start_at, end_at, timezone, status_key")
        .eq("org_id", params.orgId)
        .in("status_key", [...TOUR_BOOKING_ACTIVE_NON_TERMINAL_STATUS_KEYS])
        .gte("start_at", params.fromUtc.toISOString())
        .lte("start_at", params.toUtc.toISOString())
        .order("start_at", { ascending: true })
        .limit(TOUR_ATTENTION_BOOKING_LIMIT);
    if (error) throw new Error(`tour calendar attention: bookings read failed: ${error.message}`);
    let rows = (data ?? []) as BookingRow[];
    if (params.siteIds) {
        const wanted = new Set(params.siteIds);
        const siteOf = new Map<string, string>();
        for (const loc of new Set(rows.map((r) => r.location_id))) {
            siteOf.set(loc, await calendarSiteFor(supabase, params.orgId, loc));
        }
        rows = rows.filter((r) => wanted.has(siteOf.get(r.location_id) ?? ""));
    }
    return judgeTourBookingsAgainstCalendar(supabase, {
        orgId: params.orgId,
        bookings: rows,
        hypotheticalRows: params.hypotheticalRows,
    });
}

export function describeTourAttention(b: Pick<CalendarAffectedTourBooking, "reason" | "entryNames">): string {
    const names = b.entryNames.length > 0 ? ` (${b.entryNames.join(", ")})` : "";
    if (b.reason === "closed") return `The location is closed at this time${names}.`;
    if (b.reason === "outside_hours") return `This time is outside the location's hours that day${names}.`;
    return "The location's calendar for this day cannot be determined.";
}
