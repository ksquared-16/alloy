/**
 * Enrollment event-window metrics.
 *
 * Authoritative tour scheduling truth: `tour_bookings` rows (not workflow_events).
 * Superseded reschedule rows (status_key = rescheduled) are excluded from aggregates.
 */

import type { MetricResolveContext, ResolvedMetricValue } from "@/lib/metrics/types";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { resolveMetricTimeWindowBounds } from "@/lib/metrics/timeWindow";
import {
    applyOpportunityScopeToQuery,
    applyTourBookingLocationScope,
    resolveMetricScopeFilter,
} from "@/lib/metrics/scopeFilter";
import { countWorkUnitLeadMembership } from "@/lib/queues/workUnitLeadMembership";

/** Status keys indicating a tour was scheduled (denominator-eligible). */
export const TOUR_SCHEDULED_STATUS_KEYS = ["confirmed", "completed", "no_show"] as const;

/** First confirmation: booking reached a scheduled state (excludes superseded rescheduled rows). */
export const TOUR_FIRST_CONFIRMED_STATUS_KEYS = ["confirmed", "completed", "no_show"] as const;

export type TourBookingMetricRow = {
    id: string;
    opportunity_id: string;
    status_key: string;
    created_at: string;
    rescheduled_from_booking_id: string | null;
};

export type OpportunityCreatedRow = {
    id: string;
    created_at: string;
};

export function isSupersededRescheduleRow(row: Pick<TourBookingMetricRow, "status_key">): boolean {
    return row.status_key === "rescheduled";
}

export function isScheduledTourBooking(row: Pick<TourBookingMetricRow, "status_key">): boolean {
    return (TOUR_SCHEDULED_STATUS_KEYS as readonly string[]).includes(row.status_key);
}

export function isFirstConfirmEligibleBooking(row: Pick<TourBookingMetricRow, "status_key">): boolean {
    if (isSupersededRescheduleRow(row)) return false;
    return (TOUR_FIRST_CONFIRMED_STATUS_KEYS as readonly string[]).includes(row.status_key);
}

/** Median of (firstConfirmedAt - opportunityCreatedAt) in hours. */
export function computeMedianTimeToScheduleTourHours(
    opportunities: OpportunityCreatedRow[],
    bookings: TourBookingMetricRow[]
): { medianHours: number | null; sampleSize: number } {
    const oppCreated = new Map(opportunities.map((o) => [o.id, o.created_at]));
    const firstConfirmByOpp = new Map<string, string>();

    const sortedBookings = [...bookings]
        .filter(isFirstConfirmEligibleBooking)
        .sort((a, b) => a.created_at.localeCompare(b.created_at));

    for (const b of sortedBookings) {
        if (!firstConfirmByOpp.has(b.opportunity_id)) {
            firstConfirmByOpp.set(b.opportunity_id, b.created_at);
        }
    }

    const durationsMs: number[] = [];
    for (const [oppId, confirmedAt] of firstConfirmByOpp) {
        const createdAt = oppCreated.get(oppId);
        if (!createdAt) continue;
        const delta = new Date(confirmedAt).getTime() - new Date(createdAt).getTime();
        if (delta >= 0) durationsMs.push(delta);
    }

    if (!durationsMs.length) return { medianHours: null, sampleSize: 0 };

    durationsMs.sort((a, b) => a - b);
    const mid = Math.floor(durationsMs.length / 2);
    const medianMs =
        durationsMs.length % 2 === 1
            ? durationsMs[mid]!
            : (durationsMs[mid - 1]! + durationsMs[mid]!) / 2;

    return { medianHours: medianMs / (1000 * 60 * 60), sampleSize: durationsMs.length };
}

export function computeTourConversionRate(
    bookings: TourBookingMetricRow[]
): { rate: number | null; completed: number; scheduled: number } {
    const eligible = bookings.filter((b) => !isSupersededRescheduleRow(b) && isScheduledTourBooking(b));
    const scheduled = eligible.length;
    const completed = eligible.filter((b) => b.status_key === "completed").length;
    if (scheduled === 0) return { rate: null, completed, scheduled };
    return { rate: completed / scheduled, completed, scheduled };
}

export function computeTourCompletedCount(bookings: TourBookingMetricRow[]): number {
    return bookings.filter((b) => !isSupersededRescheduleRow(b) && b.status_key === "completed").length;
}

export function computeLeadCount(opportunities: OpportunityCreatedRow[]): number {
    return opportunities.length;
}

export async function resolveEnrollmentLeadCount(
    ctx: MetricResolveContext
): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("enrollment.lead_count");
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    const base: Omit<ResolvedMetricValue, "value" | "formattedValue" | "meta"> = {
        key: def.key,
        label: def.label,
        format: def.format,
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
    };

    if (filter.impossible) {
        return { ...base, value: 0, formattedValue: formatMetricValue(def.format, 0), meta: { count: 0 } };
    }

    // WORK-UNIT context → the canonical membership count (= queue rows / work-view count). Scoped to
    // THIS work unit only: no department scope, no `work_unit_id IS NULL` orphans, no time window.
    // Department/workspace scope keeps the windowed department-wide rollup below.
    const workUnitId = ctx.workUnitId?.trim() || null;
    if (workUnitId) {
        const wuCount = await countWorkUnitLeadMembership(ctx.supabase, {
            orgId: ctx.orgId,
            workUnitId,
        });
        return {
            ...base,
            value: wuCount,
            formattedValue: formatMetricValue(def.format, wuCount),
            meta: { count: wuCount },
        };
    }

    let oppQ = ctx.supabase
        .from("opportunities")
        .select("id, created_at")
        .eq("org_id", ctx.orgId)
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString());
    oppQ = applyOpportunityScopeToQuery(oppQ, filter);

    const { data: opps, error } = await oppQ;
    if (error) throw new Error(error.message);

    const count = computeLeadCount((opps ?? []) as OpportunityCreatedRow[]);
    return {
        ...base,
        value: count,
        formattedValue: formatMetricValue(def.format, count),
        meta: { count },
    };
}

export async function resolveEnrollmentTimeToScheduleTour(
    ctx: MetricResolveContext
): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("enrollment.time_to_schedule_tour");
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    const base: Omit<ResolvedMetricValue, "value" | "formattedValue" | "meta"> = {
        key: def.key,
        label: def.label,
        format: def.format,
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
    };

    if (filter.impossible) {
        return { ...base, value: null, formattedValue: formatMetricValue(def.format, null), meta: { sample_size: 0 } };
    }

    let oppQ = ctx.supabase
        .from("opportunities")
        .select("id, created_at")
        .eq("org_id", ctx.orgId)
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString());
    oppQ = applyOpportunityScopeToQuery(oppQ, filter);

    const { data: opps, error: oppErr } = await oppQ;
    if (oppErr) throw new Error(oppErr.message);

    const opportunities = (opps ?? []) as OpportunityCreatedRow[];
    if (!opportunities.length) {
        return {
            ...base,
            value: null,
            formattedValue: formatMetricValue(def.format, null),
            meta: { sample_size: 0 },
        };
    }

    const oppIds = opportunities.map((o) => o.id);

    let bookQ = ctx.supabase
        .from("tour_bookings")
        .select("id, opportunity_id, status_key, created_at, rescheduled_from_booking_id")
        .eq("org_id", ctx.orgId)
        .in("opportunity_id", oppIds);
    bookQ = applyTourBookingLocationScope(bookQ, filter);

    const { data: bookings, error: bookErr } = await bookQ;
    if (bookErr) throw new Error(bookErr.message);

    const { medianHours, sampleSize } = computeMedianTimeToScheduleTourHours(
        opportunities,
        (bookings ?? []) as TourBookingMetricRow[]
    );

    return {
        ...base,
        value: medianHours,
        formattedValue: formatMetricValue(def.format, medianHours),
        meta: { sample_size: sampleSize, unit: "hours" },
    };
}

export async function resolveEnrollmentTourConversionRate(
    ctx: MetricResolveContext
): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("enrollment.tour_conversion_rate");
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    const base: Omit<ResolvedMetricValue, "value" | "formattedValue" | "meta"> = {
        key: def.key,
        label: def.label,
        format: def.format,
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
    };

    if (filter.impossible) {
        return {
            ...base,
            value: null,
            formattedValue: formatMetricValue(def.format, null),
            meta: { completed: 0, scheduled: 0 },
        };
    }

    let bookQ = ctx.supabase
        .from("tour_bookings")
        .select("id, opportunity_id, status_key, created_at, rescheduled_from_booking_id")
        .eq("org_id", ctx.orgId)
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString());
    bookQ = applyTourBookingLocationScope(bookQ, filter);

    const { data: bookings, error } = await bookQ;
    if (error) throw new Error(error.message);

    const { rate, completed, scheduled } = computeTourConversionRate((bookings ?? []) as TourBookingMetricRow[]);

    return {
        ...base,
        value: rate,
        formattedValue: formatMetricValue(def.format, rate),
        meta: { completed, scheduled },
    };
}

export async function resolveEnrollmentTourCompletedCount(
    ctx: MetricResolveContext
): Promise<ResolvedMetricValue> {
    const def = getMetricDefinition("enrollment.tour_completed_count");
    const now = ctx.now ?? new Date();
    const { windowStart, windowEnd } = resolveMetricTimeWindowBounds(ctx.window, now);
    const filter = await resolveMetricScopeFilter(ctx.supabase, ctx.orgId, ctx.scope, ctx.siteLocationId);

    const base: Omit<ResolvedMetricValue, "value" | "formattedValue" | "meta"> = {
        key: def.key,
        label: def.label,
        format: def.format,
        window: ctx.window,
        windowStartIso: windowStart.toISOString(),
        windowEndIso: windowEnd.toISOString(),
        computedAtIso: now.toISOString(),
        sources: def.sources,
        resolveMode: ctx.mode ?? "live",
    };

    if (filter.impossible) {
        return { ...base, value: 0, formattedValue: formatMetricValue(def.format, 0), meta: { completed: 0 } };
    }

    let bookQ = ctx.supabase
        .from("tour_bookings")
        .select("id, opportunity_id, status_key, created_at, rescheduled_from_booking_id")
        .eq("org_id", ctx.orgId)
        .gte("created_at", windowStart.toISOString())
        .lte("created_at", windowEnd.toISOString());
    bookQ = applyTourBookingLocationScope(bookQ, filter);

    const { data: bookings, error } = await bookQ;
    if (error) throw new Error(error.message);

    const completed = computeTourCompletedCount((bookings ?? []) as TourBookingMetricRow[]);
    return {
        ...base,
        value: completed,
        formattedValue: formatMetricValue(def.format, completed),
        meta: { completed },
    };
}
