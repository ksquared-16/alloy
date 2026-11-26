/**
 * Which sites an Attendance metric may read, for one request.
 *
 * Shared by the service-day and occupancy resolvers so authorization cannot
 * drift between them: one place decides what "this caller's sites" means.
 *
 * The important property is what happens when a caller asks for a site they may
 * not see. It returns `null` — UNSUPPORTED — never an empty site list. An empty
 * list would resolve to a count of zero, and zero is an answer: it reads as
 * "nobody is here", which is a claim about a site the caller has no right to
 * know anything about.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricResolveContext } from "@/lib/metrics/types";
import { assertMetricSiteAccess } from "@/lib/metrics/resolveMetricSiteAccess";
import { resolveMetricScopeFilter } from "@/lib/metrics/scopeFilter";

/** Site ids to read, or `null` when the requested scope is not permitted. */
export async function resolveReadableSiteIds(
    ctx: MetricResolveContext,
): Promise<string[] | null> {
    if (ctx.siteLocationId) {
        const allowed = await assertMetricSiteAccess({
            supabase: ctx.supabase as SupabaseClient,
            orgId: ctx.orgId,
            scope: ctx.scope,
            siteId: ctx.siteLocationId,
        });
        return allowed ? [ctx.siteLocationId] : null;
    }

    const filter = await resolveMetricScopeFilter(
        ctx.supabase as SupabaseClient,
        ctx.orgId,
        ctx.scope,
        null,
    );
    if (filter.impossible) return null;

    const { data, error } = await ctx.supabase
        .from("locations")
        .select("id")
        .eq("org_id", ctx.orgId)
        .eq("location_type", "site")
        .eq("is_active", true);
    if (error) return null;

    const siteIds = ((data ?? []) as { id: string }[]).map((r) => r.id);
    const allowed = filter.constraints.locationIds;
    return allowed?.length ? siteIds.filter((id) => allowed.includes(id)) : siteIds;
}
