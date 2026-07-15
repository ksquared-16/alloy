/**
 * Resolve active Work View runtime context from department metadata + URL hints.
 */

import {
    activeLifecycleProcess,
    activeStagesForProcess,
    lifecycleBuilderFromDepartmentMetadata,
} from "@/lib/lifecycle/lifecycleBuilderConfig";
import { primaryQueueKeyForLifecycleStage } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { WorkViewConfigV1Stored, WorkViewFilterMatchV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { normalizeWorkViewsDisplayOrder, resolveWorkViewMatchV1 } from "@/lib/lifecycle/workViewsConfigV1";
import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";

/**
 * Base queue key a Work View draws rows from: its bound lane (`compat_queue_key`), else an explicit URL
 * `?queue=`, else the work unit's **all-records** queue (`primary_total_queue` / first lane without
 * status filters). Predicate-only Work Views (no bound lane) must fall back to all-records so their
 * predicates filter the full scope instead of resolving to no queue (which returned 0 rows/counts).
 */
export function resolveWorkViewBaseQueueKey(
    workView: Pick<WorkViewConfigV1Stored, "compat_queue_key"> | null | undefined,
    explicitQueueKey: string | null | undefined,
    queueDefinition: unknown,
): string | null {
    const bundle = queueDefinition != null ? tryLoadWorkUnitQueueDefinitionBundle(queueDefinition) : null;
    const existsOnUnit = (key: string): boolean =>
        !bundle || bundle.def.queues.some((q) => q.key === key);
    // A bound compat lane is only usable when it actually exists on THIS unit's definition. A stale
    // `compat_queue_key` — e.g. a deleted lifecycle stage like `lifecycle_qualification`, or an
    // aggregate key like `pipeline_total` that lives on a sibling unit — must NOT be returned: the
    // server throws "Unknown queue key" (404). When the def is loaded and the key is absent, degrade
    // to the unit's all-records lane; the server still applies the view's predicates via `work_view_id`.
    const compat = workView?.compat_queue_key?.trim();
    if (compat && existsOnUnit(compat)) return compat;
    const explicit = explicitQueueKey?.trim();
    if (explicit && existsOnUnit(explicit)) return explicit;
    if (bundle) return findAllRecordsQueueKey(bundle.def, getQueueUiConfig(bundle.def));
    // No definition to validate against — best-effort passthrough (runtime gates on config readiness).
    return compat || explicit || null;
}

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

/**
 * A Work View bound to a `lifecycle_<stage>` lane whose backing stage is no longer active is an
 * ORPHAN. The physical lane can still exist in the queue definition (stage deleted, lane not pruned),
 * so every "lane present in def" check passes and the ghost pill renders, prefetches (the residual
 * `…/lifecycle_qualification?caller_surface=work_unit_prewarm` warm GET), and counts against a stage
 * the operator removed. Only `lifecycle_*` keys absent from the live active-stage set are orphans —
 * predicate-only views (no `compat_queue_key`), all-records, and sibling aggregates are never touched.
 */
export function isOrphanedLifecycleWorkView(
    view: Pick<WorkViewConfigV1Stored, "compat_queue_key">,
    activeLifecycleQueueKeys: ReadonlySet<string>,
): boolean {
    const compat = view.compat_queue_key?.trim();
    if (!compat || !compat.startsWith("lifecycle_")) return false;
    return !activeLifecycleQueueKeys.has(compat);
}

/**
 * The single upstream owner of saved Work Views. Dropping an orphaned lifecycle view HERE removes the
 * ghost pill AND every downstream emission path in one place: the Work Unit pill strip, grouped-totals
 * targets, warm-prefetch href resolution, and Sidebar/tile nav all read through this resolver.
 */
export function savedWorkViewsFromDepartmentMetadata(
    departmentMetadata: unknown,
): WorkViewConfigV1Stored[] {
    const process = activeLifecycleProcess(lifecycleBuilderFromDepartmentMetadata(departmentMetadata));
    const ordered = normalizeWorkViewsDisplayOrder(process?.work_views_v1 ?? []);
    if (!process) return ordered;
    const activeLifecycleQueueKeys = new Set(
        activeStagesForProcess(process).map((s) => primaryQueueKeyForLifecycleStage(s.key)),
    );
    return ordered.filter((view) => !isOrphanedLifecycleWorkView(view, activeLifecycleQueueKeys));
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
    /** Host work unit's queue_definition — enables the all-records base-queue fallback. */
    queueDefinition?: unknown;
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

    // Base queue: bound lane, else explicit URL queue, else the work unit's all-records queue. The
    // all-records fallback is what makes a predicate-only view (e.g. "All Leads") resolve a real base to
    // filter — previously it resolved to null and the runtime fetched no rows (count/rows = 0).
    const queueKey = resolveWorkViewBaseQueueKey(workView, params.queueKey, params.queueDefinition);

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
