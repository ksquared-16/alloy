/**
 * Resolve active Work View runtime context from department metadata + URL hints.
 */

import {
    activeLifecycleProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import type { WorkViewConfigV1Stored, WorkViewFilterMatchV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { normalizeWorkViewsDisplayOrder, resolveWorkViewMatchV1 } from "@/lib/lifecycle/workViewsConfigV1";

export type WorkViewRuntimeContext = {
    workView: WorkViewConfigV1Stored | null;
    workViewId: string | null;
    queueKey: string | null;
    queueLayoutId: string | null;
    focusPanelLayoutId: string | null;
    filters: WorkViewConfigV1Stored["filters_v1"];
    /** Condition combinator (AND/OR). Always resolved — defaults to `all` when the view omits it. */
    match: WorkViewFilterMatchV1;
    sort: WorkViewConfigV1Stored["sort_v1"];
};

export function savedWorkViewsFromDepartmentMetadata(
    departmentMetadata: unknown,
): WorkViewConfigV1Stored[] {
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(departmentMetadata));
    return normalizeWorkViewsDisplayOrder(process?.work_views_v1 ?? []);
}

/** Load department metadata for a work unit (queue API filter path). */
export async function fetchDepartmentMetadataForWorkUnit(
    supabase: import("@supabase/supabase-js").SupabaseClient,
    orgId: string,
    workUnitId: string,
): Promise<unknown | null> {
    const { data: wu, error: wuError } = await supabase
        .from("work_units")
        .select("department_id")
        .eq("id", workUnitId.trim())
        .eq("org_id", orgId)
        .maybeSingle();
    if (wuError || !wu?.department_id) return null;
    const { data: dept, error: deptError } = await supabase
        .from("departments")
        .select("metadata")
        .eq("id", wu.department_id)
        .eq("org_id", orgId)
        .maybeSingle();
    if (deptError) return null;
    return dept?.metadata ?? null;
}

export function findWorkViewById(
    views: readonly WorkViewConfigV1Stored[],
    workViewId: string | null | undefined,
): WorkViewConfigV1Stored | null {
    const id = workViewId?.trim();
    if (!id) return null;
    return views.find((row) => row.id === id) ?? null;
}

export function findWorkViewByCompatQueueKey(
    views: readonly WorkViewConfigV1Stored[],
    queueKey: string | null | undefined,
): WorkViewConfigV1Stored | null {
    const key = queueKey?.trim();
    if (!key) return null;
    return views.find((row) => row.compat_queue_key?.trim() === key) ?? null;
}

export function firstVisibleWorkView(
    views: readonly WorkViewConfigV1Stored[],
): WorkViewConfigV1Stored | null {
    const visible = views.filter((row) => row.visible_in_runtime !== false);
    return visible[0] ?? views[0] ?? null;
}

/** Resolve the active Work View for runtime — URL hints override stored layout ids. */
export function resolveActiveWorkViewRuntimeContext(params: {
    departmentMetadata: unknown;
    workViewId?: string | null;
    queueKey?: string | null;
    queueLayoutId?: string | null;
    focusLayoutId?: string | null;
}): WorkViewRuntimeContext {
    const views = savedWorkViewsFromDepartmentMetadata(params.departmentMetadata);
    const empty: WorkViewRuntimeContext = {
        workView: null,
        workViewId: null,
        queueKey: params.queueKey?.trim() || null,
        queueLayoutId: params.queueLayoutId?.trim() || null,
        focusPanelLayoutId: params.focusLayoutId?.trim() || null,
        filters: undefined,
        match: "all",
        sort: undefined,
    };

    if (!views.length) return empty;

    const byId = findWorkViewById(views, params.workViewId);
    const byQueue = findWorkViewByCompatQueueKey(views, params.queueKey);
    const workView = byId ?? byQueue ?? firstVisibleWorkView(views);

    if (!workView) return empty;

    const queueKey =
        workView.compat_queue_key?.trim()
        || params.queueKey?.trim()
        || null;

    return {
        workView,
        workViewId: workView.id,
        queueKey,
        queueLayoutId: params.queueLayoutId?.trim() || workView.queue_layout_id?.trim() || null,
        focusPanelLayoutId: params.focusLayoutId?.trim() || workView.focus_panel_layout_id?.trim() || null,
        filters: workView.filters_v1,
        match: resolveWorkViewMatchV1(workView.match),
        sort: workView.sort_v1,
    };
}

/** Lane URL sync params derived from active Work View for a queue pill. */
export function workViewRuntimeUrlParamsFromQueueKey(
    departmentMetadata: unknown,
    queueKey: string,
): {
    workViewId: string | null;
    queueLayoutId: string | null;
    focusLayoutId: string | null;
} {
    const ctx = resolveActiveWorkViewRuntimeContext({ departmentMetadata, queueKey });
    return {
        workViewId: ctx.workViewId,
        queueLayoutId: ctx.queueLayoutId,
        focusLayoutId: ctx.focusPanelLayoutId,
    };
}
