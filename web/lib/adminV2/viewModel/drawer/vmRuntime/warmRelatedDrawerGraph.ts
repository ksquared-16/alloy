import type { AdminDrawerEntityType } from "@/contexts/AdminDrawerContext";
import type { AdminDrawerState, DrawerStackItem } from "@/contexts/AdminDrawerContext";
import {
    buildPrepareParamsFromOpenDrawer,
    drawerViewModelCacheKeyForOpenParams,
} from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { prepareDrawerViewModelDeduped } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { logDrawerVmRuntimeDiagnostic } from "@/lib/adminV2/viewModel/drawer/drawerVmRuntimeDiagnostics";
import type { DrawerViewModelCacheContext } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { warmRelatedDrawerViewModels } from "@/lib/adminV2/viewModel/drawer/drawerModelSwapNavigation";
import { resolveRelatedDrawerGraph } from "@/lib/adminV2/viewModel/drawer/vmRuntime/resolveRelatedDrawerGraph";

/**
 * Bound the linked-graph warm. Each warm target composes a FULL drawer VM (a sibling/back-to-lead
 * opportunity compose is ~1.4s deployed); an uncapped fan-out off a single auto-opened record was
 * the multi-VM storm on Work Unit entry. Cap the eager composes so linked navigation stays warm for
 * the nearest neighbours without a wall of heavy composes competing with the primary reveal.
 */
const RELATED_DRAWER_WARM_TARGET_CAP = 3;

function trimId(v: unknown): string | null {
    if (v == null) return null;
    const s = String(v).trim();
    return s || null;
}

function warmGraphTarget(
    ctx: DrawerViewModelCacheContext | null,
    ws: { work_unit_id: string; department_id: string } | null,
    target: ReturnType<typeof resolveRelatedDrawerGraph>["warmTargets"][number]
): { entity_type: string; entity_id: string; open_source: string; cache_key: string | null } {
    const params = buildPrepareParamsFromOpenDrawer({
        type: target.entityType,
        id: target.entityId,
        source: target.openSource,
        personDrawerOpenSeed: target.personDrawerOpenSeed ?? null,
        opportunityWorkspaceContext: ws,
        context: ctx,
    });
    void prepareDrawerViewModelDeduped(params).catch(() => {
        /* graph warm is best-effort */
    });
    return {
        entity_type: target.entityType,
        entity_id: target.entityId,
        open_source: target.openSource,
        cache_key: drawerViewModelCacheKeyForOpenParams({
            type: target.entityType,
            id: target.entityId,
            source: target.openSource,
            personDrawerOpenSeed: target.personDrawerOpenSeed ?? null,
            opportunityWorkspaceContext: ws,
        }),
    };
}

/**
 * Warm the full linked drawer graph (Person/Child/Opportunity) after VM first paint.
 */
export function warmRelatedDrawerGraph(params: {
    drawer: AdminDrawerState;
    entityType: AdminDrawerEntityType;
    record: Record<string, unknown>;
    runtime: "opportunity" | "person" | "child";
    previousDrawer?: DrawerStackItem | null;
    stack?: DrawerStackItem[];
}): void {
    const ctx: DrawerViewModelCacheContext = {
        departmentId: params.drawer.opportunityWorkspaceContext?.department_id ?? null,
        workUnitId: params.drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
    };
    const ws = params.drawer.opportunityWorkspaceContext ?? null;

    try {
        const graph = resolveRelatedDrawerGraph({
            drawer: params.drawer,
            entityType: params.entityType,
            record: params.record,
            runtime: params.runtime,
            previousDrawer: params.previousDrawer ?? null,
            stack: params.stack ?? [],
        });

        logDrawerVmRuntimeDiagnostic("related_graph_warm_start", {
            runtime: params.runtime,
            entity_type: params.entityType,
            entity_id: trimId(params.record.id) ?? params.drawer.id,
            back_to_lead_opportunity_id: graph.backToLeadOpportunityId,
            related_person_count: graph.relatedPersonTargets.length,
            related_child_count: graph.relatedChildTargets.length,
            sibling_child_count: graph.siblingChildTargets.length,
        });

        warmRelatedDrawerViewModels({
            entityType: params.entityType,
            record: params.record,
            context: ctx,
            opportunityWorkspaceContext: ws,
        });

        const cappedTargets = graph.warmTargets.slice(0, RELATED_DRAWER_WARM_TARGET_CAP);
        const targets = cappedTargets.map((t) => warmGraphTarget(ctx, ws, t));

        logDrawerVmRuntimeDiagnostic("related_graph_warm_ready", {
            runtime: params.runtime,
            entity_type: params.entityType,
            entity_id: trimId(params.record.id) ?? params.drawer.id,
            back_to_lead_opportunity_id: graph.backToLeadOpportunityId,
            warm_target_count: targets.length,
            warm_targets_available: graph.warmTargets.length,
            warm_targets_dropped: Math.max(0, graph.warmTargets.length - targets.length),
            warm_targets: targets,
        });
    } catch (err) {
        logDrawerVmRuntimeDiagnostic("related_graph_warm_error", {
            runtime: params.runtime,
            entity_type: params.entityType,
            entity_id: trimId(params.record.id) ?? params.drawer.id,
            error: err instanceof Error ? err.message : String(err),
        });
    }
}
