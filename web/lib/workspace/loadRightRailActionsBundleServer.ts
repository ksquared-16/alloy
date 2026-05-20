import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";

const RIGHT_RAIL_SURFACES = ["right_rail", "work_unit", "department"] as const;

/**
 * Resolve workspace right-rail actions for all placement surfaces in one server pass (no 3× HTTP/auth).
 */
export async function loadRightRailActionsBundleServer(params: {
    orgId: string;
    departmentId: string;
    workUnitId: string;
    entityType?: string;
}): Promise<ResolvedActionForClient[]> {
    const { orgId, departmentId, workUnitId, entityType = "opportunity" } = params;
    const supabase = createAdminClient();

    const parts: ResolvedActionsBySlot[] = await Promise.all(
        RIGHT_RAIL_SURFACES.map((surface) =>
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
            })
        )
    );

    const merged = mergeResolvedActionsBySlot(...parts);
    return rightRailResolvedFromActionsPayload(merged);
}
