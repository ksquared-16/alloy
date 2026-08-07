/**
 * Resolve the operator Work View destination for Open Lead after Create Lead.
 *
 * Operator nav uses label-derived route slugs (`Leads` → `leads`) plus `?work_view_id=`,
 * not internal lifecycle stage work-unit keys (`lifecycle_wu_lead`).
 */

import { primaryQueueKeyForLifecycleStage } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { firstMatchingVisibleWorkView } from "@/lib/lifecycle/operationalProjection";
import {
    findWorkViewByCompatQueueKey,
    findWorkViewById,
    firstVisibleWorkView,
    savedWorkViewsFromDepartmentMetadata,
} from "@/lib/lifecycle/resolveWorkViewRuntimeContext";
import { workViewRouteKeyFromLabel } from "@/lib/admin/workUnitRouteSlug";

export type CreateLeadWorkViewHandoff = {
    workViewId: string;
    workViewRouteKey: string;
};

export function resolveCreateLeadWorkViewForHandoff(args: {
    departmentMetadata: unknown;
    statusKey?: string | null;
    stageKey?: string | null;
}): CreateLeadWorkViewHandoff | null {
    const views = savedWorkViewsFromDepartmentMetadata(args.departmentMetadata).filter(
        (view) => view.visible_in_runtime !== false,
    );
    if (!views.length) return null;

    const stageKey = (args.stageKey ?? "lead").trim() || "lead";
    const statusKey = args.statusKey?.trim() || null;

    const byCompat =
        findWorkViewByCompatQueueKey(views, "new_leads") ??
        findWorkViewByCompatQueueKey(views, primaryQueueKeyForLifecycleStage(stageKey));

    const byPredicate = firstMatchingVisibleWorkView(
        {
            status_key: statusKey,
            stage_key: stageKey,
            lifecycle_stage_key: stageKey,
        },
        views,
    );

    const byId = findWorkViewById(views, "new_leads");
    const view = byCompat ?? byPredicate ?? byId ?? firstVisibleWorkView(views);
    if (!view) return null;

    const workViewRouteKey = workViewRouteKeyFromLabel(view.label);
    if (!workViewRouteKey) return null;

    return {
        workViewId: view.id,
        workViewRouteKey,
    };
}
