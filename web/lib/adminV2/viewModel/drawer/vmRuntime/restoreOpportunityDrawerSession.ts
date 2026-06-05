import type { AdminDrawerState, DrawerStackItem } from "@/contexts/AdminDrawerContext";
import { DRAWER_BACK_TO_LEAD_OPEN_SOURCE } from "@/contexts/AdminDrawerContext";
import type { OpportunityDrawerOpenPreload } from "@/lib/admin/opportunityDrawerOpenCoordinator";
import { isOpportunityDrawerViewModelPreload } from "@/lib/adminV2/viewModel/drawer/opportunity/buildOpportunityDrawerOpenPreloadFromViewModel";
import { scheduleWarmRelatedDrawerTargetsAfterVmApply } from "@/lib/adminV2/viewModel/drawer/vmRuntime/drawerVmPayloadWarmRelated";

/** Active opportunity open source — not the back-navigation peek source. */
export function restoredOpportunityDrawerOpenSource(
    lead: Pick<DrawerStackItem, "openSource">
): string | null {
    const src = lead.openSource?.trim();
    if (!src || src === DRAWER_BACK_TO_LEAD_OPEN_SOURCE) return null;
    return src;
}

export function buildRestoredOpportunityDrawerState(
    lead: DrawerStackItem,
    fallbackWorkspace: AdminDrawerState["opportunityWorkspaceContext"]
): AdminDrawerState {
    return {
        type: "opportunities",
        id: lead.id,
        defaultWorkflowEntityType: lead.defaultWorkflowEntityType,
        defaultCustomerId: lead.defaultCustomerId,
        defaultVendorId: lead.defaultVendorId,
        defaultSchedulePrefill: lead.defaultSchedulePrefill,
        defaultJobPrefill: lead.defaultJobPrefill,
        jobRecordSurface: lead.jobRecordSurface,
        operationalVisualContext: lead.operationalVisualContext,
        defaultOpportunitySurface: lead.defaultOpportunitySurface,
        opportunityWorkspaceContext:
            lead.opportunityWorkspaceContext ?? fallbackWorkspace ?? null,
        opportunityQueuePreviewSeed: lead.opportunityQueuePreviewSeed ?? null,
        opportunityQueueNavigator: lead.opportunityQueueNavigator ?? null,
        openSource: restoredOpportunityDrawerOpenSource(lead),
        personDrawerOpenSeed: null,
    };
}

/** Re-warm Person/Child/back-to-lead targets after restoring Opportunity from cache. */
export function scheduleOpportunityDrawerGraphRewarmAfterRestore(params: {
    drawer: AdminDrawerState;
    preload: OpportunityDrawerOpenPreload | null | undefined;
    stack: DrawerStackItem[];
}): void {
    if (!params.preload || !isOpportunityDrawerViewModelPreload(params.preload)) return;
    const vm = params.preload.viewModel;
    queueMicrotask(() => {
        scheduleWarmRelatedDrawerTargetsAfterVmApply({
            drawer: params.drawer,
            entityType: "opportunities",
            record: vm.above_fold.record,
            runtime: "opportunity",
            generation: vm.generation,
            previousDrawer: null,
            stack: params.stack,
        });
    });
}
