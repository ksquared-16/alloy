import type { SupabaseClient } from "@supabase/supabase-js";

import {
    accessScopeRestrictsData,
    expandLocationIdsUnderSites,
    resolveRecordScopeConstraints,
    type AdminAccessScopeDimensions,
    type RecordScopeConstraints,
} from "@/lib/admin/accessScope";

export const WORKSPACE_SITE_QUERY_PARAM = "workspace_site_id";

export function parseWorkspaceSiteIdFromSearchParams(searchParams: URLSearchParams): string | null {
    const raw = (searchParams.get(WORKSPACE_SITE_QUERY_PARAM) ?? "").trim();
    return raw.length > 0 ? raw : null;
}

function intersectLocationIds(a: string[], b: string[]): string[] {
    const set = new Set(b.map(String));
    return a.filter((id) => set.has(String(id)));
}

/**
 * Permission scope ∩ optional header view-site selection.
 * When `workspaceSiteId` is set, narrows opportunity/job queue rows to that site subtree.
 */
export async function resolveQueueRecordScopeConstraints(
    supabase: SupabaseClient,
    orgId: string,
    dim: AdminAccessScopeDimensions,
    workspaceSiteId: string | null | undefined
): Promise<{ recordScopeImpossible: boolean; recordScopeConstraints: RecordScopeConstraints | null }> {
    let recordScopeImpossible = false;
    let recordScopeConstraints: RecordScopeConstraints | null = null;

    if (accessScopeRestrictsData(dim)) {
        const c = await resolveRecordScopeConstraints(supabase, orgId, dim);
        if (c.impossible) {
            return { recordScopeImpossible: true, recordScopeConstraints: null };
        }
        recordScopeConstraints = c;
    }

    const siteId = workspaceSiteId?.trim() || null;
    if (!siteId) {
        return { recordScopeImpossible, recordScopeConstraints };
    }

    if (dim.siteScope === "restricted") {
        const allowed = dim.allowedSiteLocationIds ?? [];
        if (!allowed.includes(siteId)) {
            return { recordScopeImpossible: true, recordScopeConstraints: null };
        }
    } else {
        const { data, error } = await supabase
            .from("locations")
            .select("id")
            .eq("org_id", orgId)
            .eq("id", siteId)
            .maybeSingle();
        if (error || !data) {
            return { recordScopeImpossible: true, recordScopeConstraints: null };
        }
    }

    const viewLocationIds = await expandLocationIdsUnderSites(supabase, orgId, [siteId]);
    if (!viewLocationIds.length) {
        return { recordScopeImpossible: true, recordScopeConstraints: null };
    }

    if (recordScopeConstraints?.locationIds?.length) {
        const narrowed = intersectLocationIds(recordScopeConstraints.locationIds, viewLocationIds);
        if (!narrowed.length) {
            return { recordScopeImpossible: true, recordScopeConstraints: null };
        }
        recordScopeConstraints = { ...recordScopeConstraints, locationIds: narrowed };
    } else {
        recordScopeConstraints = {
            workUnitIds: recordScopeConstraints?.workUnitIds ?? null,
            locationIds: viewLocationIds,
            impossible: false,
        };
    }

    return { recordScopeImpossible, recordScopeConstraints };
}
