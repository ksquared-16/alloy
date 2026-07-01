import type { SupabaseClient } from "@supabase/supabase-js";
import {
    applyRecordScopeConstraintsToQuery,
    expandLocationIdsUnderSites,
    resolveRecordScopeConstraints,
    type AdminAccessScopeDimensions,
    type RecordScopeConstraints,
} from "@/lib/admin/accessScope";

export type MetricScopeFilter = {
    constraints: RecordScopeConstraints;
    /** When API passes site_id, narrowed location ids for tour/opportunity filters. */
    locationIds: string[] | null;
    impossible: boolean;
};

/**
 * Resolve org + access scope + optional site filter into query constraints.
 * siteLocationId expands to descendant location ids (same pattern as CRM list routes).
 */
export async function resolveMetricScopeFilter(
    supabase: SupabaseClient,
    orgId: string,
    scope: AdminAccessScopeDimensions,
    siteLocationId?: string | null
): Promise<MetricScopeFilter> {
    const constraints = await resolveRecordScopeConstraints(supabase, orgId, scope);
    if (constraints.impossible) {
        return { constraints, locationIds: null, impossible: true };
    }

    let locationIds = constraints.locationIds;

    if (siteLocationId?.trim()) {
        const siteIds = await expandLocationIdsUnderSites(supabase, orgId, [siteLocationId.trim()]);
        if (!siteIds.length) {
            return { constraints, locationIds: null, impossible: true };
        }
        if (locationIds?.length) {
            const allowed = new Set(locationIds);
            locationIds = siteIds.filter((id) => allowed.has(id));
            if (!locationIds.length) {
                return { constraints, locationIds: null, impossible: true };
            }
        } else {
            locationIds = siteIds;
        }
    }

    return { constraints, locationIds, impossible: false };
}

/** Apply opportunity row scope (work_unit + location) to a Supabase query builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOpportunityScopeToQuery(q: any, filter: MetricScopeFilter): any {
    if (filter.impossible) return q;
    return applyRecordScopeConstraintsToQuery(q, {
        workUnitIds: filter.constraints.workUnitIds,
        locationIds: filter.locationIds ?? filter.constraints.locationIds,
        impossible: false,
    });
}

/** Filter tour_bookings by location_id when site scope active. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyTourBookingLocationScope(q: any, filter: MetricScopeFilter): any {
    if (filter.impossible) return q;
    const locs = filter.locationIds ?? filter.constraints.locationIds;
    if (locs?.length) {
        return q.in("location_id", locs);
    }
    return q;
}

/**
 * When department scope restricts work units, filter operational_tasks via linked opportunities.
 */
export async function loadScopedOpportunityIds(
    supabase: SupabaseClient,
    orgId: string,
    filter: MetricScopeFilter
): Promise<string[] | null> {
    if (filter.impossible) return [];
    if (!filter.constraints.workUnitIds?.length && !filter.locationIds && !filter.constraints.locationIds) {
        return null;
    }

    let q = supabase.from("opportunities").select("id").eq("org_id", orgId);
    q = applyOpportunityScopeToQuery(q, filter);
    const { data, error } = await q;
    if (error) {
        console.error("[loadScopedOpportunityIds]", error.message);
        return [];
    }
    return (data ?? []).map((r) => (r as { id: string }).id).filter(Boolean);
}
