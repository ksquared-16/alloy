import type { OpportunityWorkspaceContext } from "@/contexts/AdminDrawerContext";
import { invalidateDrawerViewModelCacheForEntity } from "@/lib/adminV2/viewModel/drawer/drawerViewModelSessionCache";
import { resolveOpportunityDrawerVmCacheContext } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerVmCacheScope";

/**
 * E2E-15 / E2E-23 — INVALIDATE THE SCOPE THE RUNTIME READS FROM.
 *
 * The record runtime reads its view model through `loadOpportunityDrawerViaViewModel(id,
 * transportContext)`, and that transport names an attention subject but no department or work unit —
 * so the session-cache entry it reads (and cold-writes) sits at `…:_:_:_:<attention>`. Its forced
 * reload invalidated only the scope named by the VM's own workspace (`…:_:<dept>:<wu>:`), which the
 * reader never consults. The reload then hit the surviving entry and re-applied the pre-mutation VM.
 *
 * Measured on deployed 50affaee: after Add Person succeeded, neither the explicit forced reload nor
 * the queue-updated work-lifecycle reload issued a request to the drawer view-model route; the
 * Household card kept its pre-mutation contacts until a cold load.
 *
 * Both scopes are dropped: the one the reader resolves (through the loader's own resolver, so the two
 * cannot drift) and the VM-workspace scope `applyVm` also files under, which other readers use.
 */
export function invalidateRecordRuntimeVmCache(params: {
    opportunityId: string;
    /** The transport context the runtime passes to the loader — the scope it actually reads. */
    readContext: OpportunityWorkspaceContext | null | undefined;
    /** The applied VM's own workspace scope. */
    vmWorkspace: { department_id?: string | null; work_unit_id?: string | null } | null | undefined;
}): void {
    const id = params.opportunityId.trim();
    if (!id) return;
    invalidateDrawerViewModelCacheForEntity(
        "opportunities",
        id,
        resolveOpportunityDrawerVmCacheContext({ workspaceContext: params.readContext ?? null }),
    );
    invalidateDrawerViewModelCacheForEntity("opportunities", id, {
        departmentId: params.vmWorkspace?.department_id ?? null,
        workUnitId: params.vmWorkspace?.work_unit_id ?? null,
    });
}
