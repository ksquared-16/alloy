import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { WorkUnitRouteSlugRow } from "@/lib/admin/resolveWorkUnitByRouteSlug";

const SLUG_WU_SELECT =
    "id, org_id, department_id, key, name, sort_order, is_active, queue_definition";

/** Avoid PostgrestFilterBuilder deep-instantiation (matches accessScope query helpers). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function applyDepartmentScope(query: any, dim: AdminAccessScopeDimensions): any {
    if (dim.departmentScope === "restricted") {
        const allowed = dim.allowedDepartmentIds ?? [];
        if (!allowed.length) return query;
        return query.in("department_id", allowed);
    }
    return query;
}

function mapRows(data: unknown[] | null): WorkUnitRouteSlugRow[] {
    return (data ?? []).map((row) => {
        const r = row as {
            id: string;
            department_id: string;
            key: string;
            name: string;
            queue_definition: unknown;
            sort_order?: number | null;
            is_active?: boolean | null;
        };
        return {
            id: r.id,
            department_id: r.department_id,
            key: r.key,
            name: r.name,
            queue_definition: r.queue_definition,
            sort_order: r.sort_order,
            is_active: r.is_active,
        };
    });
}

function dedupeRows(rows: WorkUnitRouteSlugRow[]): WorkUnitRouteSlugRow[] {
    const seen = new Set<string>();
    const out: WorkUnitRouteSlugRow[] = [];
    for (const row of rows) {
        if (seen.has(row.id)) continue;
        seen.add(row.id);
        out.push(row);
    }
    return out;
}

/**
 * Bounded work-unit fetch for slug resolution.
 * 1) Direct key match  2) Lifecycle stage keys  3) Org-wide fallback (queue-lane slugs only).
 */
export async function fetchWorkUnitsForSlugResolution(params: {
    supabase: SupabaseClient;
    orgId: string;
    dim: AdminAccessScopeDimensions;
    platformKey: string;
}): Promise<{ rows: WorkUnitRouteSlugRow[]; strategy: "direct" | "lifecycle" | "org_scan" }> {
    const { supabase, orgId, dim, platformKey } = params;
    const base = () =>
        applyDepartmentScope(
            supabase
                .from("work_units")
                .select(SLUG_WU_SELECT)
                .eq("org_id", orgId)
                .eq("is_active", true),
            dim
        );

    // Direct + lifecycle are two `key`-equality reads on the SAME table — merge them into ONE `.in(key)`
    // read and split by priority in-memory (direct exact-key wins, else lifecycle). Removes one serial
    // round-trip from the commit-critical route-identity resolve (measured: fetchWorkUnits was ~1150 ms /
    // 3 serial reads on a lifecycle slug that misses both targeted reads). org_scan stays a MISS-ONLY
    // fallback, so this is never more reads than before and preserves scalability (no always-org scan).
    const stageKeys = operatorStageKeysForPipelineQueueKey(platformKey);
    const lifecycleWuKeys = [
        ...new Set(stageKeys.map((stage) => lifecycleStageWorkUnitKey(stage).toLowerCase())),
    ];
    const candidateKeys = [...new Set([platformKey, ...lifecycleWuKeys])];
    const { data: candidateData, error: candidateErr } = await base().in("key", candidateKeys);
    if (candidateErr) throw candidateErr;
    const candidateRows = mapRows(candidateData);

    const directRows = candidateRows.filter((r) => r.key === platformKey);
    if (directRows.length) {
        return { rows: directRows, strategy: "direct" };
    }
    if (lifecycleWuKeys.length) {
        const lifecycleRows = candidateRows.filter(
            (r) => typeof r.key === "string" && lifecycleWuKeys.includes(r.key.toLowerCase()),
        );
        if (lifecycleRows.length) {
            return { rows: lifecycleRows, strategy: "lifecycle" };
        }
    }

    /** Queue-lane slugs require scanning queue_definition across candidates — fallback only. */
    const { data: allData, error: allErr } = await base();
    if (allErr) throw allErr;
    return { rows: dedupeRows(mapRows(allData)), strategy: "org_scan" };
}

export type SlugResolutionDepartmentRow = {
    id: string;
    key: string | null;
    name: string | null;
    /** `departments.metadata` — carries `work_views_v1` for `work_view` slug resolution. */
    metadata: unknown;
};

/**
 * Department hints for slug resolution — identity + metadata (configured Work Views) for the
 * candidate work units' departments ONLY (kept lean: never an org-wide department scan).
 */
export async function fetchDepartmentsForSlugResolution(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentIds: readonly string[];
}): Promise<SlugResolutionDepartmentRow[]> {
    const ids = [...new Set(params.departmentIds.filter(Boolean))];
    if (!ids.length) return [];
    const { data, error } = await params.supabase
        .from("departments")
        .select("id, key, name, metadata")
        .eq("org_id", params.orgId)
        .in("id", ids);
    if (error) throw error;
    return (data ?? []).map((d) => ({
        id: d.id as string,
        key: (d.key as string | null) ?? null,
        name: (d.name as string | null) ?? null,
        metadata: (d as { metadata?: unknown }).metadata ?? null,
    }));
}
