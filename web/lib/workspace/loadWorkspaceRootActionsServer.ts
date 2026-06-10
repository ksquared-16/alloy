import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";

/** Resolve org-level workspace root (`surface=workspace`) actions for /workspace command rail. */
export async function loadWorkspaceRootActionsServer(params: {
    orgId: string;
}): Promise<ResolvedActionForClient[]> {
    const supabase = createAdminClient();
    const merged = await resolveActionsForContext(supabase, {
        orgId: params.orgId,
        surface: "workspace",
        entityType: "opportunity",
        entityId: null,
        departmentId: null,
        workUnitId: null,
        sectionKey: null,
        hintOpportunityStatusKey: null,
        hintOpportunityMetadata: null,
        lifecycleViewStageKey: null,
    });
    return rightRailResolvedFromActionsPayload(merged);
}
