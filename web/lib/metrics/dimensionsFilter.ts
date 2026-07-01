import type { SupabaseClient } from "@supabase/supabase-js";
import type { MetricDimensions } from "@/lib/metrics/types";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { resolveEffectiveOpportunityLifecycleStage } from "@/lib/admin/opportunityLifecyclePresentation";

/** Apply status_key dimension filter on opportunities query. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyStatusKeyDimension(q: any, dimensions?: MetricDimensions): any {
    const sk = dimensions?.status_key?.trim();
    if (!sk) return q;
    return q.eq("status_key", sk);
}

/**
 * Filter opportunity rows by lifecycle_stage dimension (post-fetch).
 * Requires status definitions for stage resolution.
 */
export function filterOpportunitiesByLifecycleStage<
    T extends { status_key?: string | null; quote_total?: number | string | null },
>(rows: T[], lifecycleStage: string | undefined, statusDefs: Awaited<ReturnType<typeof fetchEffectiveStatusDefinitions>>): T[] {
    const stage = lifecycleStage?.trim().toLowerCase();
    if (!stage) return rows;
    return rows.filter((row) => {
        const q = row.quote_total != null ? Number(row.quote_total) : null;
        const effective = resolveEffectiveOpportunityLifecycleStage({
            statusKey: row.status_key,
            quoteTotalDollars: q,
            defs: statusDefs,
        });
        return effective?.toLowerCase() === stage;
    });
}

export async function loadStatusDefsForOrg(supabase: SupabaseClient, orgId: string) {
    return fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities");
}
