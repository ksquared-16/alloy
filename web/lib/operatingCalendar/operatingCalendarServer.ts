/**
 * Server reads of the Operating Calendar: load a site's candidate ledger rows,
 * resolve them with the ONE resolver, and answer the questions consumers ask.
 *
 * Every read fails LOUD. A calendar that could not be read is not a calendar
 * with nothing on it: Tours would offer slots on a closed day, and the roster
 * would show a closed day as a hundred missing children.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveEffectiveSiteLocationId } from "@/lib/admin/accessScope";
import { resolveLocationTimezone } from "@/lib/location/timezoneResolution";
import type { ExpectationQueryRow } from "@/lib/operationalExpectations/query/effectiveExpectationsForWindow";
import { expectationSubjectRefMatches } from "@/lib/operationalExpectations/query/expectationSubjectRef";
import {
    completeExpectationLineages,
    EXPECTATION_SELECT,
} from "@/lib/operationalExpectations/query/supabaseExpectationQueryGateway";
import { ATTENDANCE_EXPECTATION_PURPOSE, ATTENDANCE_SUBJECT_KINDS } from "@/lib/childcareOperational/attendance/serviceDayExpectations";
import { OPERATING_CALENDAR_PURPOSE, OPERATING_CALENDAR_SUBJECT_KINDS } from "@/lib/operatingCalendar/operatingCalendarVocabulary";
import {
    isInstantIntervalOperating,
    resolveOperatingCalendar,
    type ResolvedCalendarDay,
} from "@/lib/operatingCalendar/resolveOperatingCalendar";
import { addCalendarDays, isValidIanaTimeZone, localDateOf } from "@/lib/operatingCalendar/operatingCalendarTime";

const READ_PURPOSES = new Set<string>([OPERATING_CALENDAR_PURPOSE, ATTENDANCE_EXPECTATION_PURPOSE]);

function purposeOf(row: ExpectationQueryRow): string {
    const c = (row.condition ?? {}) as Record<string, unknown>;
    const t = c.typeKey ?? c.type_key;
    return typeof t === "string" ? t : "";
}

/**
 * Candidate rows for one site: the organization's calendar entries, the site's
 * calendar entries, Attendance's closures of the site (and, when asked, of its
 * rooms) — each with its whole lineage.
 */
export async function loadOperatingCalendarRows(
    supabase: SupabaseClient,
    params: { orgId: string; siteId: string; roomIds?: readonly string[]; fromDate: string; toDate: string },
): Promise<ExpectationQueryRow[]> {
    // Two days of margin either side covers every zone offset; the resolver decides.
    const fromIso = `${addCalendarDays(params.fromDate, -2)}T00:00:00.000Z`;
    const toIso = `${addCalendarDays(params.toDate, 3)}T00:00:00.000Z`;
    const kinds = [
        OPERATING_CALENDAR_SUBJECT_KINDS.organization,
        OPERATING_CALENDAR_SUBJECT_KINDS.location,
        ...(params.roomIds && params.roomIds.length > 0 ? [ATTENDANCE_SUBJECT_KINDS.operationalGroup] : []),
    ];
    const { data, error } = await supabase
        .from("operational_expectations")
        .select(EXPECTATION_SELECT)
        .eq("org_id", params.orgId)
        .in("subject_kind", kinds)
        .lte("valid_from", toIso)
        .or(`valid_to.is.null,valid_to.gt.${fromIso}`);
    if (error) throw new Error(`operating calendar query failed: ${error.message}`);

    const wanted = new Set([params.orgId, params.siteId, ...(params.roomIds ?? [])]);
    const touching = ((data ?? []) as unknown as ExpectationQueryRow[]).filter(
        (row) => READ_PURPOSES.has(purposeOf(row)) && expectationSubjectRefMatches(row.subject_ref, wanted),
    );
    const complete = await completeExpectationLineages(supabase, params.orgId, touching);
    return complete.filter((row) => READ_PURPOSES.has(purposeOf(row)));
}

export type SiteOperatingCalendar = {
    siteId: string;
    timezone: string;
    /** False when neither the location nor the organization names a zone and a fallback was used. */
    timezoneResolved: boolean;
    days: Map<string, ResolvedCalendarDay>;
    rows: ExpectationQueryRow[];
};

/** The site a location belongs to (itself when it is a site or has no site above it). */
export async function calendarSiteFor(supabase: SupabaseClient, orgId: string, locationId: string): Promise<string> {
    return (await resolveEffectiveSiteLocationId(supabase, orgId, locationId)) ?? locationId;
}

/** The zone a site's calendar is read in: location → organization → caller's fallback. */
export async function calendarTimezoneFor(
    supabase: SupabaseClient,
    orgId: string,
    siteId: string,
    fallbackTimezone?: string | null,
): Promise<{ timezone: string; resolved: boolean }> {
    const tz = await resolveLocationTimezone(supabase, orgId, siteId);
    if (tz.status === "resolved" && tz.timezone) return { timezone: tz.timezone, resolved: true };
    const fb = String(fallbackTimezone ?? "").trim();
    if (fb && isValidIanaTimeZone(fb)) return { timezone: fb, resolved: true };
    return { timezone: "UTC", resolved: false };
}

export async function loadSiteOperatingCalendar(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        locationId: string;
        fromDate: string;
        toDate: string;
        fallbackTimezone?: string | null;
        roomIds?: readonly string[];
        /** Extra rows to resolve as if authored (an impact preview). Never written. */
        hypotheticalRows?: readonly ExpectationQueryRow[];
    },
): Promise<SiteOperatingCalendar> {
    const siteId = await calendarSiteFor(supabase, params.orgId, params.locationId);
    const { timezone, resolved } = await calendarTimezoneFor(supabase, params.orgId, siteId, params.fallbackTimezone);
    const rows = await loadOperatingCalendarRows(supabase, {
        orgId: params.orgId,
        siteId,
        roomIds: params.roomIds,
        fromDate: params.fromDate,
        toDate: params.toDate,
    });
    const all = [...rows, ...(params.hypotheticalRows ?? [])];
    const days = resolveOperatingCalendar({
        orgId: params.orgId,
        siteId,
        timezone,
        fromDate: params.fromDate,
        toDate: params.toDate,
        rows: all,
    });
    return { siteId, timezone, timezoneResolved: resolved, days, rows: all };
}

/**
 * The calendar for a span of INSTANTS at a tour location: resolved one local day
 * wider on both sides so no slot near midnight falls outside it.
 */
export async function loadOperatingCalendarForInstants(
    supabase: SupabaseClient,
    params: {
        orgId: string;
        locationId: string;
        fromUtc: Date;
        toUtc: Date;
        fallbackTimezone?: string | null;
        hypotheticalRows?: readonly ExpectationQueryRow[];
    },
): Promise<SiteOperatingCalendar & { isOperating: (startUtc: Date, endUtc: Date) => boolean }> {
    const siteId = await calendarSiteFor(supabase, params.orgId, params.locationId);
    const { timezone } = await calendarTimezoneFor(supabase, params.orgId, siteId, params.fallbackTimezone);
    const fromDate = addCalendarDays(localDateOf(params.fromUtc, timezone), -1);
    const toDate = addCalendarDays(localDateOf(params.toUtc, timezone), 1);
    const cal = await loadSiteOperatingCalendar(supabase, {
        orgId: params.orgId,
        locationId: siteId,
        fromDate,
        toDate,
        fallbackTimezone: timezone,
        hypotheticalRows: params.hypotheticalRows,
    });
    return {
        ...cal,
        isOperating: (startUtc: Date, endUtc: Date) => isInstantIntervalOperating(cal.days, cal.timezone, startUtc, endUtc),
    };
}

/** Thrown when a tour write names a time the location is not operating. */
export const TOUR_CALENDAR_CLOSED_MESSAGE =
    "tour_bookings: the location is not operating at that time (operating calendar)";

/**
 * The calendar check for a tour write that does not go through slot validation
 * (a `requested` booking). Every other writer already reads slots, and slots
 * already exclude what the calendar closes.
 */
export async function assertTourIntervalOperating(
    supabase: SupabaseClient,
    params: { orgId: string; locationId: string; startAt: Date; endAt: Date; timezone: string | null },
): Promise<void> {
    const cal = await loadOperatingCalendarForInstants(supabase, {
        orgId: params.orgId,
        locationId: params.locationId,
        fromUtc: params.startAt,
        toUtc: params.endAt,
        fallbackTimezone: params.timezone,
    });
    if (!cal.isOperating(params.startAt, params.endAt)) throw new Error(TOUR_CALENDAR_CLOSED_MESSAGE);
}

/**
 * The calendar's answer for Attendance on one service date: a full-day closure
 * of the site by a CALENDAR entry (organization default or location), or null.
 *
 * Attendance's own closures are not returned — the roster and kiosk already read
 * them on their existing path, unchanged. Partial closures and modified hours are
 * not returned either: they do not change who is expected, so they must not turn
 * a child's day into `closed` (recorded as a future Attendance contract).
 */
export async function loadCalendarSiteClosureForServiceDay(
    supabase: SupabaseClient,
    params: { orgId: string; siteLocationId: string; serviceDate: string },
): Promise<{ expectationId: string; reasonKey: string | null } | null> {
    const cal = await loadSiteOperatingCalendar(supabase, {
        orgId: params.orgId,
        locationId: params.siteLocationId,
        fromDate: params.serviceDate,
        toDate: params.serviceDate,
    });
    const day = cal.days.get(params.serviceDate);
    if (!day || day.status !== "closed" || !day.closedAllDay) return null;
    const entry = day.applied.find((e) => e.source === "calendar" && e.effect === "closed");
    return entry ? { expectationId: entry.expectationId, reasonKey: entry.reasonKey } : null;
}
