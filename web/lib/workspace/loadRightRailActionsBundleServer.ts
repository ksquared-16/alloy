import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ActionSurface, ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { stageKeyFromLifecycleWorkUnitMetadata } from "@/lib/lifecycle/lifecycleStageWorkUnit";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";

const DEFAULT_RIGHT_RAIL_SURFACES: ActionSurface[] = ["right_rail", "work_unit", "department"];

/**
 * Resolve workspace right-rail actions for selected placement surfaces only (no cross-surface leakage).
 */
export async function loadRightRailActionsBundleServer(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
    entityType?: string;
    /**
     * When set, only these surfaces are resolved. Defaults to `["right_rail", "work_unit", "department"]`
     * so the /work-unit rail includes operator-configured `right_rail` (side-panel) placements.
     */
    placementSurfaces?: readonly ActionSurface[];
}): Promise<ResolvedActionForClient[]> {
    const { orgId, departmentId, workUnitId, entityType = "opportunity" } = params;
    const surfaces = params.placementSurfaces?.length
        ? [...params.placementSurfaces]
        : DEFAULT_RIGHT_RAIL_SURFACES;
    const supabase = createAdminClient();

    const { data: wuRow } = await supabase
        .from("work_units")
        .select("metadata")
        .eq("id", workUnitId)
        .eq("org_id", orgId)
        .maybeSingle();
    const lifecycleViewStageKey = stageKeyFromLifecycleWorkUnitMetadata(
        (wuRow as { metadata?: unknown } | null)?.metadata ?? null
    );

    const parts: ResolvedActionsBySlot[] = await Promise.all(
        surfaces.map((surface) =>
            resolveActionsForContext(supabase, {
                orgId,
                surface,
                entityType,
                entityId: null,
                departmentId,
                workUnitId,
                sectionKey: null,
                hintOpportunityStatusKey: null,
                hintOpportunityMetadata: null,
                lifecycleViewStageKey,
            })
        )
    );

    const merged = mergeResolvedActionsBySlot(...parts);
    return rightRailResolvedFromActionsPayload(merged);
}
