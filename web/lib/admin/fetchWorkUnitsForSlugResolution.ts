import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    ENROLLMENT_PIPELINE_WORK_UNIT_KEY,
    operatorStageKeysForPipelineQueueKey,
} from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
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

    const { data: directData, error: directErr } = await base().eq("key", platformKey);
    if (directErr) throw directErr;
    const directRows = mapRows(directData);
    if (directRows.length) {
        return { rows: directRows, strategy: "direct" };
    }

    const stageKeys = operatorStageKeysForPipelineQueueKey(platformKey);
    const lifecycleWuKeys = [
        ...new Set([
            ...stageKeys.map((stage) => lifecycleStageWorkUnitKey(stage).toLowerCase()),
            // Include the pipeline aggregate so findQueueLaneOwner can prefer it over
            // per-stage lifecycle WUs when the queue key belongs to the enrollment pipeline.
            ...(stageKeys.length > 0 ? [ENROLLMENT_PIPELINE_WORK_UNIT_KEY] : []),
        ]),
    ];
    if (lifecycleWuKeys.length) {
        const { data: lifecycleData, error: lifecycleErr } = await base().in("key", lifecycleWuKeys);
        if (lifecycleErr) throw lifecycleErr;
        const lifecycleRows = mapRows(lifecycleData);
        if (lifecycleRows.length) {
            return { rows: lifecycleRows, strategy: "lifecycle" };
        }
    }

    /** Queue-lane slugs require scanning queue_definition across candidates — fallback only. */
    const { data: allData, error: allErr } = await base();
    if (allErr) throw allErr;
    return { rows: dedupeRows(mapRows(allData)), strategy: "org_scan" };
}
