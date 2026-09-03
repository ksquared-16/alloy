/**
 * Canonical location of a configured Work View — THE single definition of where a view's
 * count and rows come from.
 *
 * Product rule: "Workspace tile Work View count, Work Unit pill count, and rendered row
 * count must agree for the same Work View." That only holds if every consumer resolves the
 * view to the SAME (host work unit, base lane) pair:
 *
 *   host work unit — the unit owning the view's bound lane (`compat_queue_key`) when one
 *                    exists, else the department's pipeline/stage work unit
 *                    (`pickDeptWorkViewHostWorkUnit`) — the same host the by-slug resolver
 *                    lands the view's URL on.
 *   base lane      — the view's `compat_queue_key` when it exists on the host's
 *                    queue_definition, else the host's all-records lane
 *                    (`findAllRecordsQueueKey`); the server applies the view's predicates
 *                    via `work_view_id` on top.
 *   route key      — the LABEL-derived slug key (`workViewRouteKeyFromLabel`); renames
 *                    rename the URL, internal ids never route outward.
 *
 * The Workspace tile counts, the Work Unit pill counts, the left-nav entries, and the
 * `/workspace/work-unit/:slug` resolver (`resolveWorkUnitByRouteSlug`) all read this module,
 * so they cannot diverge: navigating to a view renders it ON its canonical location, and the
 * rendered rows-response total IS the count every badge showed.
 */

import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { operatorStageKeysForPipelineQueueKey } from "@/lib/lifecycle/enrollmentProcessStageQueueKeys";
import { lifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import type { WorkViewConfigV1Stored } from "@/lib/lifecycle/workViewsConfigV1";
import {
    extractDrawerLifecycleExecutionLanes,
    extractPipelineExecutionLanes,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import { findAllRecordsQueueKey } from "@/lib/workspace/workUnitQueueDerived";
import { pickDeptWorkViewHostWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import { workViewRouteKeyFromLabel } from "@/lib/admin/workUnitRouteSlug";

/**
 * Work-unit row shape shared by every caller: `/api/admin/work-units?department_id=`
 * response items, the landing builder's `OperatorLifecycleWorkUnitRow`, and the slug
 * resolver's `WorkUnitRouteSlugRow` all satisfy it.
 */
export type WorkViewCanonicalLocationWorkUnitRow = {
    id: string;
    key?: string | null;
    name?: string | null;
    department_id?: string | null;
    is_active?: boolean | null;
    sort_order?: number | null;
    queue_definition?: unknown;
    /**
     * The unit's own config layer. Carried so a caller that resolved a view's CANONICAL HOST can read
     * that host's configuration instead of the surface unit's — see the placement layer in the
     * provisioning answer.
     */
    metadata?: unknown;
};

export type WorkViewCanonicalLocation = {
    /** Host work unit the view's count/rows are defined on. */
    workUnitId: string;
    /** Base lane on the host — `work_view_id` predicates apply on top of this lane. */
    baseQueueKey: string;
    /** Label-derived route key (platform `_` form; dashes in the URL). Null = not navigable. */
    routeKey: string | null;
};

function rowSortOrder(row: WorkViewCanonicalLocationWorkUnitRow): number {
    return typeof row.sort_order === "number" ? row.sort_order : 0;
}

function sortRowsForOwnership<T extends WorkViewCanonicalLocationWorkUnitRow>(rows: T[]): T[] {
    return [...rows].sort((a, b) => {
        const orderCmp = rowSortOrder(a) - rowSortOrder(b);
        if (orderCmp !== 0) return orderCmp;
        return String(a.name ?? a.id).localeCompare(String(b.name ?? b.id));
    });
}

/** First work unit (sort_order, name) whose pipeline/lifecycle execution lanes include `laneKey`. */
export function findQueueLaneOwnerWorkUnit<T extends WorkViewCanonicalLocationWorkUnitRow>(
    rows: readonly T[],
    laneKey: string,
): T | null {
    const normalizedLane = laneKey.trim().toLowerCase();
    if (!normalizedLane) return null;

    for (const row of sortRowsForOwnership([...rows])) {
        const bundle = tryLoadWorkUnitQueueDefinitionBundle(row.queue_definition);
        if (!bundle) continue;
        const primary = extractPipelineExecutionLanes(bundle.def);
        const lanes =
            primary.length > 0 ? primary : extractDrawerLifecycleExecutionLanes(bundle.def);
        if (lanes.some((lane) => lane.key.trim().toLowerCase() === normalizedLane)) {
            return row;
        }
    }
    return null;
}

/**
 * Lifecycle-stage work unit that maps to a pipeline queue lane (builder-owned stage units).
 * Department-scoped: candidates tied on sort_order stay ambiguous → null (no arbitrary host).
 */
function findLifecycleStageHostForLane<T extends WorkViewCanonicalLocationWorkUnitRow>(
    rows: readonly T[],
    laneKey: string,
): T | null {
    const stageKeys = operatorStageKeysForPipelineQueueKey(laneKey);
    if (!stageKeys.length) return null;

    const candidates: T[] = [];
    for (const stageKey of stageKeys) {
        const wuKey = lifecycleStageWorkUnitKey(stageKey).toLowerCase();
        for (const row of rows) {
            if (String(row.key ?? "").trim().toLowerCase() === wuKey) candidates.push(row);
        }
    }
    if (!candidates.length) return null;

    const sorted = sortRowsForOwnership(candidates);
    if (sorted.length === 1) return sorted[0]!;
    const top = sorted[0]!;
    const tied = sorted.filter((row) => rowSortOrder(row) === rowSortOrder(top));
    return tied.length === 1 ? tied[0]! : null;
}

/**
 * Host work unit for a configured Work View: the unit owning the view's bound lane
 * (`compat_queue_key`) when one exists, else the department's pipeline/stage work unit.
 * SHARED by the by-slug resolver (`resolveWorkUnitByRouteSlug`), the landing nav builder,
 * and the surface runtimes — the one host precedence, so tile/nav/pill/URL can never
 * resolve a view to different units.
 */
export function hostWorkUnitForConfiguredWorkView<
    T extends WorkViewCanonicalLocationWorkUnitRow,
>(
    view: Pick<WorkViewConfigV1Stored, "compat_queue_key">,
    workUnits: readonly T[],
    departmentId: string,
): T | null {
    const deptRows = workUnits.filter(
        (row) =>
            String(row.department_id ?? "").trim() === departmentId && row.is_active !== false,
    );
    const compat = view.compat_queue_key?.trim();
    if (compat) {
        const laneOwner =
            findQueueLaneOwnerWorkUnit(deptRows, compat) ??
            findLifecycleStageHostForLane(deptRows, compat);
        if (laneOwner) return laneOwner;
    }
    return pickDeptWorkViewHostWorkUnit(deptRows, departmentId);
}

/**
 * Base lane for a view ON a given host: the view's `compat_queue_key` when the host's
 * queue_definition has that lane, else the host's all-records lane. Predicate-only views
 * (no bound lane) always resolve to all-records so `work_view_id` filters the full scope.
 */
export function workViewBaseQueueKeyForHost(
    view: Pick<WorkViewConfigV1Stored, "compat_queue_key">,
    hostQueueDefinition: unknown,
): string | null {
    const compat = view.compat_queue_key?.trim() || null;
    const bundle =
        hostQueueDefinition != null
            ? tryLoadWorkUnitQueueDefinitionBundle(hostQueueDefinition)
            : null;
    // Same canonical contract as the runtime resolver (resolveWorkViewBaseQueueKey): a compat lane is
    // only usable when it exists on THIS host's definition. A stale/deleted key (e.g.
    // `lifecycle_qualification`, or an aggregate `pipeline_total` living on a sibling unit) must NEVER
    // be emitted — the grouped-totals fan-out would request it and 404. Degrade to the host's
    // all-records lane; null only when there is no lane and no definition to derive one.
    if (bundle) {
        if (compat && bundle.def.queues.some((q) => q.key === compat)) return compat;
        if (compat && typeof console !== "undefined") {
            console.warn("[work-view-resolver] dropped stale compat_queue_key not present on host def", {
                compat_queue_key: compat,
            });
        }
        return findAllRecordsQueueKey(bundle.def, getQueueUiConfig(bundle.def)) ?? null;
    }
    // No definition to validate against — cannot safely emit a possibly-stale key (would 404).
    return null;
}

/**
 * Resolve a configured Work View's canonical location within its department. Null when no
 * host work unit exists (no pipeline/stage unit configured) or no base lane resolves —
 * such a view has no defined count/rows anywhere, so consumers render no badge.
 */
export function resolveWorkViewCanonicalLocation(
    view: Pick<WorkViewConfigV1Stored, "id" | "label" | "compat_queue_key">,
    deptWorkUnits: readonly WorkViewCanonicalLocationWorkUnitRow[],
    departmentId: string,
): WorkViewCanonicalLocation | null {
    const host = hostWorkUnitForConfiguredWorkView(view, deptWorkUnits, departmentId);
    if (!host) return null;
    const baseQueueKey = workViewBaseQueueKeyForHost(view, host.queue_definition);
    if (!baseQueueKey) return null;
    return {
        workUnitId: String(host.id),
        baseQueueKey,
        routeKey: workViewRouteKeyFromLabel(view.label),
    };
}
