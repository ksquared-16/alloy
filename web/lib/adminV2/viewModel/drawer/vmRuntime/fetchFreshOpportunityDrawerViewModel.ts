import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { loadOpportunityDrawerViaViewModel } from "@/lib/adminV2/viewModel/drawer/opportunity/loadOpportunityDrawerViaViewModel";
import { invalidateDrawerViewModelCacheForEntity } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { dispatchDrawerLayoutRuntimeBodyInvalidate } from "@/lib/layout/runtime/drawerLayoutRuntimeBodyInvalidate";
import { invalidateDrawerLayoutRuntimeBodyCacheForEntity } from "@/lib/layout/runtime/drawerLayoutRuntimeBodySessionCache";
import type { OpportunityDrawerViewModel } from "@/lib/adminV2/viewModel/drawer/types";
import { workspaceDataFetchInit } from "@/lib/workspace/workspaceDataFetch";

/** Invalidate caches and load a fresh opportunity drawer VM (shared reload seam). */
export async function fetchFreshOpportunityDrawerViewModel(
    drawer: AdminDrawerState,
): Promise<OpportunityDrawerViewModel | null> {
    if (drawer.type !== "opportunities" || !drawer.id || drawer.id === "new") return null;
    const expectedId = drawer.id.trim();

    invalidateDrawerViewModelCacheForEntity("opportunities", expectedId, {
        departmentId: drawer.opportunityWorkspaceContext?.department_id ?? null,
        workUnitId: drawer.opportunityWorkspaceContext?.work_unit_id ?? null,
    });
    invalidateDrawerLayoutRuntimeBodyCacheForEntity(
        "/api/admin/layout-runtime/opportunity-drawer-body",
        expectedId,
    );
    dispatchDrawerLayoutRuntimeBodyInvalidate({
        entityType: "opportunities",
        entityId: expectedId,
    });

    const result = await loadOpportunityDrawerViaViewModel(
        expectedId,
        drawer.opportunityWorkspaceContext ?? null,
        workspaceDataFetchInit(),
    );
    if (!result.ok || !isOpportunityDrawerViewModelPreload(result.preload)) return null;
    if (String(result.preload.viewModel.entity.id) !== expectedId) return null;
    return result.preload.viewModel;
}
