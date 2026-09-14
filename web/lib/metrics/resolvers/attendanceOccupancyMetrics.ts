/**
 * Current physical occupancy — where children actually ARE, this instant.
 *
 * ── WHY THIS IS NOT THE SERVICE-DAY COUNT ──
 *
 * "Here now" answers how many children are in the building. This answers where
 * they are standing, and the two diverge the moment anybody moves: a child
 * placed in Toddler 1 who walks to the playground is still on Toddler 1's
 * roster and is no longer in Toddler 1. `attendanceOverviewModel` records the
 * bug that came from conflating them — the overview used roster presence to
 * answer occupancy, "which is only correct on a day when nobody moves".
 *
 * So this reads `occupancyAt`, the certified point-in-time fold, and never a
 * daily summary. `summarizeAttendanceByDay` returns the SET of rooms a child
 * appeared in, so a child who moved twice would be counted three times.
 *
 * ── PLACEMENT IS NOT TOUCHED ──
 *
 * Movement changes whereabouts. It does not change which group owns the child's
 * committed roster, and nothing here reads or writes placement.
 *
 * ── WHAT IS DEFERRED, AND WHY ──
 *
 * A per-location breakdown is real and useful, and the platform cannot express
 * it as a metric dimension today: `MetricDimensionKey` is
 * `lifecycle_stage | status_key`, with no location member, and the snapshot
 * dimension columns follow that vocabulary. Rather than invent an
 * Attendance-specific response shape, the scalar is the metric and the breakdown
 * rides in `meta` as context. A true dimensional occupancy metric needs a
 * location dimension in the platform first.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricResolveContext, OipMetricKey, ResolvedMetricValue } from "@/lib/metrics/types";
import { getMetricDefinition } from "@/lib/metrics/registry";
import { formatMetricValue } from "@/lib/metrics/formatMetricValue";
import { resolveReadableSiteIds } from "@/lib/metrics/resolvers/attendanceMetricScope";
import { resolveRoomsForLocation } from "@/lib/location/canonicalRoomProvider";
import {
    occupancyAt,
    occupancyByPhysicalSpaceAt,
} from "@/lib/childcareOperational/attendance/attendanceWhereabouts";
import type { ChildAttendanceEventRow } from "@/lib/childcareOperational/attendance/attendanceTypes";
import { resolveOperationalEnrollmentTodayYmd } from "@/lib/childcareOperational/operationalEnrollmentApi";

const EVENT_COLUMNS =
    "id, org_id, enrollment_agreement_id, customer_member_id, site_location_id, event_kind, " +
    "entry_type, corrects_event_id, event_at, service_date, room_location_id, " +
    "from_room_location_id, to_room_location_id, actor_type, source_type, source_key, created_at";

export type OccupancySnapshot = {
    at: string;
    serviceDate: string;
    siteCount: number;
    /** Children physically present across every readable site. */
    total: number;
    /** Occupancy at the grain children are actually located in. */
    byLocation: { locationId: string; childCount: number }[];
    /** The same children rolled up to containing physical spaces. */
    byPhysicalSpace: { locationId: string; childCount: number }[];
};

/**
 * Sum occupancy entries.
 *
 * Safe precisely because `occupancyAt` gives each present child exactly ONE
 * location — the invariant its own comment calls out as the thing day-level
 * aggregation breaks. Summing a day summary here would over-count every child
 * who moved.
 */
export function totalOccupancy(entries: readonly { childCount: number }[]): number {
    return entries.reduce((sum, e) => sum + e.childCount, 0);
}

const BY_CONTEXT = new WeakMap<MetricResolveContext, Promise<OccupancySnapshot | null>>();

async function loadOccupancy(ctx: MetricResolveContext): Promise<OccupancySnapshot | null> {
    const cached = BY_CONTEXT.get(ctx);
    if (cached) return cached;

    const promise = (async (): Promise<OccupancySnapshot | null> => {
        const siteIds = await resolveReadableSiteIds(ctx);
        if (siteIds === null) return null;

        const supabase = ctx.supabase as SupabaseClient;
        const serviceDate = await resolveOperationalEnrollmentTodayYmd(supabase, ctx.orgId);
        const at = new Date().toISOString();

        if (siteIds.length === 0) {
            return { at, serviceDate, siteCount: 0, total: 0, byLocation: [], byPhysicalSpace: [] };
        }

        const byLocation: { locationId: string; childCount: number }[] = [];
        const byPhysicalSpace: { locationId: string; childCount: number }[] = [];

        for (const siteLocationId of siteIds) {
            const { data, error } = await supabase
                .from("child_attendance_events")
                .select(EVENT_COLUMNS)
                .eq("org_id", ctx.orgId)
                .eq("site_location_id", siteLocationId)
                .eq("service_date", serviceDate);
            if (error) return null;
            const events = (data ?? []) as unknown as ChildAttendanceEventRow[];

            for (const entry of occupancyAt(events, at)) {
                byLocation.push({ locationId: entry.locationId, childCount: entry.childCount });
            }

            // The containing space comes from the canonical room provider, never
            // from a parent lookup — resolving hierarchy is that provider's job.
            const rooms = await resolveRoomsForLocation(supabase, ctx.orgId, siteLocationId, {
                includeInactive: true,
            });
            const spaceByGroupId = new Map(rooms.map((r) => [r.id, r.containingSpaceLocationId]));
            for (const entry of occupancyByPhysicalSpaceAt(events, at, spaceByGroupId)) {
                byPhysicalSpace.push({ locationId: entry.locationId, childCount: entry.childCount });
            }
        }

        return {
            at,
            serviceDate,
            siteCount: siteIds.length,
            total: totalOccupancy(byLocation),
            byLocation,
            byPhysicalSpace,
        };
    })();

    BY_CONTEXT.set(ctx, promise);
    return promise;
}

export async function resolveAttendanceOccupancyCount(
    ctx: MetricResolveContext,
): Promise<ResolvedMetricValue> {
    const key: OipMetricKey = "attendance.occupancy_count";
    const def = getMetricDefinition(key);
    const snap = await loadOccupancy(ctx);
    const nowIso = snap?.at ?? new Date().toISOString();

    return {
        key,
        label: def.label,
        format: def.format,
        // null, not zero: an unreadable scope has no answer, and zero would read
        // as an empty building.
        value: snap ? snap.total : null,
        formattedValue: formatMetricValue(def.format, snap ? snap.total : null),
        window: ctx.window,
        windowStartIso: nowIso,
        windowEndIso: nowIso,
        computedAtIso: nowIso,
        sources: def.sources,
        resolveMode: "live",
        meta: snap
            ? {
                  service_date: snap.serviceDate,
                  site_count: snap.siteCount,
                  // Context, not a dimension. See the module header.
                  occupancy_by_location: snap.byLocation,
                  occupancy_by_physical_space: snap.byPhysicalSpace,
              }
            : { unsupported_scope: true },
    };
}
