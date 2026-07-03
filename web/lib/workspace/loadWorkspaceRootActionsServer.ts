import { createAdminClient } from "@/lib/supabaseAdmin";
import { resolveActionsForContext } from "@/lib/admin/actions/resolveActionsForContext";
import type { ActionSurface, ResolvedActionForClient, ResolvedActionsBySlot } from "@/lib/admin/actions/types";
import { mergeResolvedActionsBySlot } from "@/lib/workspace/mergeResolvedActionsBySlot";
import { rightRailResolvedFromActionsPayload } from "@/lib/workspace/rightRailResolvedFromActionsPayload";

/**
 * Placement surfaces resolved for the /workspace command rail:
 * `workspace` (root-scoped) plus the shared `right_rail` surface operators use to configure side-panel actions.
 * Without `right_rail` here, actions configured on the "Workspace (side panel)" surface never reach /workspace.
 */
const WORKSPACE_ROOT_SURFACES: readonly ActionSurface[] = ["workspace", "right_rail"];

/** Resolve org-level /workspace root actions (`surface=workspace` + shared `right_rail`) for the command rail. */
export async function loadWorkspaceRootActionsServer(params: {
    orgId: string;
}): Promise<ResolvedActionForClient[]> {
    const supabase = createAdminClient();
    const parts: ResolvedActionsBySlot[] = await Promise.all(
        WORKSPACE_ROOT_SURFACES.map((surface) =>
            resolveActionsForContext(supabase, {
                orgId: params.orgId,
                surface,
                entityType: "opportunity",
                entityId: null,
                departmentId: null,
                workUnitId: null,
                sectionKey: null,
                hintOpportunityStatusKey: null,
                hintOpportunityMetadata: null,
                lifecycleViewStageKey: null,
            })
        )
    );
    // mergeResolvedActionsBySlot de-dupes by slot::key; rightRailResolvedFromActionsPayload de-dupes by key —
    // an action placed on both `workspace` and `right_rail` appears once.
    return rightRailResolvedFromActionsPayload(mergeResolvedActionsBySlot(...parts));
}
