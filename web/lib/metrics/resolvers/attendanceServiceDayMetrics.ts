/**
 * Current service-day Attendance metrics.
 *
 * ── THESE CONSUME MEANING; THEY DO NOT DEFINE IT ──
 *
 * Every state here comes from `buildCombinedRoster`, which applies
 * `interpretServiceDay` and `applyObservedPresence` — the Thread 3/4 owners. No
 * count below inspects `child_attendance_events` or decides what a silence means.
 *
 * That is the whole design constraint. The rules these metrics must honour are
 * subtle and already correct upstream:
 *
 *   - a known-away child is explained, so she must NOT appear as an unexplained
 *     missing arrival;
 *   - a closed day must not turn a whole cohort into missing children;
 *   - a child who attends despite an authored plan is PHYSICALLY PRESENT and
 *     still distinguishable as unplanned.
 *
 * Re-deriving any of that in a metric resolver would produce a second opinion
 * that drifts from the Workspace the moment either side changes. So the resolver
 * reads `serviceDay.raisesAttention` rather than testing for `not_arrived`
 * itself, and counts presence from the two states that mean "in the building"
 * rather than from a list of states it decided.
 *
 * ── WHY THESE ARE LIVE-ONLY ──
 *
 * They answer "right now". A stored value from an earlier hour is not a stale
 * version of that answer; it is a different answer to a different question. See
 * `snapshotPolicy` in the metric registry.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { resolveReadableSiteIds } from "@/lib/metrics/resolvers/attendanceMetricScope";
import { buildCombinedRoster } from "@/lib/roster/buildCombinedRoster";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";

export type ServiceDayCounts = {
    serviceDate: string;
    /** Sites actually read. Zero means the scope resolved to nothing. */
    siteCount: number;
    expected: number;
    hereNow: number;
    notArrived: number;
    checkedOut: number;
    knownAway: number;
    unknownState: number;
    attendedDespitePlan: number;
    /** Children on the roster carrying no service-day reading at all. */
    withoutServiceDay: number;
};

/**
 * One roster build per request, not one per metric.
 *
 * Six metrics resolve from the same reading, and `resolveMetrics` calls them in
 * sequence over one context object — so the context is the natural request
 * identity. A `WeakMap` keyed on it means the cache cannot outlive the request
 * or leak between them.
 */
const COUNTS_BY_CONTEXT = new WeakMap<MetricResolveContext, Promise<ServiceDayCounts | null>>();

export function computeServiceDayCounts(
    rosters: readonly { cells: readonly { children: readonly unknown[] }[] }[],
    serviceDate: string,
): ServiceDayCounts {
    const counts: ServiceDayCounts = {
        serviceDate,
        siteCount: rosters.length,
        expected: 0,
        hereNow: 0,
        notArrived: 0,
        checkedOut: 0,
        knownAway: 0,
        unknownState: 0,
        attendedDespitePlan: 0,
        withoutServiceDay: 0,
    };

    // A child sits in exactly one placement cell, but dedupe anyway: a future
    // roster that lists a visitor in two cells must not count her twice.
    const seen = new Set<string>();

    for (const roster of rosters) {
        for (const cell of roster.cells) {
            for (const raw of cell.children) {
                const child = raw as {
                    customerMemberId: string;
                    serviceDay?: { state: string; raisesAttention: boolean };
                };
                if (seen.has(child.customerMemberId)) continue;
                seen.add(child.customerMemberId);
                counts.expected += 1;

                const sd = child.serviceDay;
                if (!sd) {
                    counts.withoutServiceDay += 1;
                    continue;
                }

                // `raisesAttention` is the canonical predicate for an UNEXPLAINED
                // missing arrival. Testing `state === "not_arrived"` here would
                // duplicate a rule that already exists, and would silently
                // disagree the day that rule changes.
                if (sd.raisesAttention) counts.notArrived += 1;

                switch (sd.state) {
                    case "here_now":
                        counts.hereNow += 1;
                        break;
                    case "attended_despite_plan":
                        // Physically present AND still distinguishable. Counted in
                        // both, because "how many are in the building" and "who
                        // turned up unplanned" are different questions.
                        counts.hereNow += 1;
                        counts.attendedDespitePlan += 1;
                        break;
                    case "checked_out":
                        counts.checkedOut += 1;
                        break;
                    case "known_away":
                        counts.knownAway += 1;
                        break;
                    case "unknown":
                        counts.unknownState += 1;
                        break;
                    default:
                        break;
                }
            }
        }
    }

    return counts;
}

async function loadServiceDayCounts(ctx: MetricResolveContext): Promise<ServiceDayCounts | null> {
    const cached = COUNTS_BY_CONTEXT.get(ctx);
    if (cached) return cached;

    const promise = (async (): Promise<ServiceDayCounts | null> => {
        const siteIds = await resolveReadableSiteIds(ctx);
        if (siteIds === null) return null;

        const serviceDate = await resolveOperationalEnrollmentTodayYmd(
            ctx.supabase as SupabaseClient,
            ctx.orgId,
        );
        if (siteIds.length === 0) {
            return computeServiceDayCounts([], serviceDate);
        }

        const rosters = await Promise.all(
            siteIds.map((siteLocationId) =>
                buildCombinedRoster(ctx.supabase as SupabaseClient, {
                    orgId: ctx.orgId,
                    siteLocationId,
                    date: serviceDate,
                }),
            ),
        );
        return computeServiceDayCounts(rosters, serviceDate);
    })();

    COUNTS_BY_CONTEXT.set(ctx, promise);
    return promise;
}

function present(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    value: number | null,
    counts: ServiceDayCounts | null,
): ResolvedMetricValue {
    const def = getMetricDefinition(key);
    const nowIso = new Date().toISOString();
    return {
        key,
        label: def.label,
        format: def.format,
        value,
        formattedValue: formatMetricValue(def.format, value),
        window: ctx.window,
        // A current-state metric's window is the instant it was read. Reporting a
        // rolling range would invite a reader to treat it as a period figure.
        windowStartIso: nowIso,
        windowEndIso: nowIso,
        computedAtIso: nowIso,
        sources: def.sources,
        resolveMode: "live",
        meta: counts
            ? { service_date: counts.serviceDate, site_count: counts.siteCount }
            : { unsupported_scope: true },
    };
}

async function resolveCount(
    ctx: MetricResolveContext,
    key: OipMetricKey,
    pick: (c: ServiceDayCounts) => number,
): Promise<ResolvedMetricValue> {
    const counts = await loadServiceDayCounts(ctx);
    // `null` value, not 0: an unreadable scope has no answer, and zero is an
    // answer that reads as "nobody is here".
    return present(ctx, key, counts ? pick(counts) : null, counts);
}

export const resolveAttendanceExpectedCount = (ctx: MetricResolveContext) =>
    resolveCount(ctx, "attendance.expected_count", (c) => c.expected);

export const resolveAttendanceHereNowCount = (ctx: MetricResolveContext) =>
    resolveCount(ctx, "attendance.here_now_count", (c) => c.hereNow);

export const resolveAttendanceNotArrivedCount = (ctx: MetricResolveContext) =>
    resolveCount(ctx, "attendance.not_arrived_count", (c) => c.notArrived);

export const resolveAttendanceCheckedOutCount = (ctx: MetricResolveContext) =>
    resolveCount(ctx, "attendance.checked_out_count", (c) => c.checkedOut);

export const resolveAttendanceKnownAwayCount = (ctx: MetricResolveContext) =>
    resolveCount(ctx, "attendance.known_away_count", (c) => c.knownAway);

export const resolveAttendanceUnknownStateCount = (ctx: MetricResolveContext) =>
    resolveCount(ctx, "attendance.unknown_state_count", (c) => c.unknownState);
