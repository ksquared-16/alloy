import type {
    AdminDrawerState,
    DrawerStackItem,
} from "@/contexts/AdminDrawerContext";
import { isDrawerTransitionPhase, type DrawerRuntimePhaseState } from "@/lib/adminV2/viewModel/drawer/drawerRuntimePhase";
import { resolveDrawerVmRenderDrawer as resolveAtomicRenderDrawer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerAtomicSwap";
import {
    coerceAdminV2VmDrawerRoute,
    resolveVmDrawerRuntimeRoute,
    type VmDrawerRuntimeRoute,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";

export { resolveDrawerVmRenderDrawer } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerAtomicSwap";
export {
    canCommitDrawerVmSwap,
    drawerVmSwapCommitKey,
    resolvePendingDrawerVmSwapTarget,
} from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerAtomicSwap";

/** Reconstruct drawer state from stack for goBack / preload restore. */
export function drawerStackItemToAdminDrawerState(item: DrawerStackItem): AdminDrawerState {
    return {
        type: item.type,
        id: item.id,
        defaultWorkflowEntityType: item.defaultWorkflowEntityType,
        defaultCustomerId: item.defaultCustomerId,
        defaultVendorId: item.defaultVendorId,
        defaultSchedulePrefill: item.defaultSchedulePrefill,
        defaultJobPrefill: item.defaultJobPrefill,
        jobRecordSurface: item.jobRecordSurface,
        operationalVisualContext: item.operationalVisualContext,
        defaultOpportunitySurface: item.defaultOpportunitySurface,
        opportunityWorkspaceContext: item.opportunityWorkspaceContext ?? null,
        opportunityQueuePreviewSeed: item.opportunityQueuePreviewSeed ?? null,
        opportunityQueueNavigator: item.opportunityQueueNavigator ?? null,
        openSource: item.openSource ?? null,
        personDrawerOpenSeed: item.personDrawerOpenSeed ?? null,
    };
}

/** Which VM runtime component to mount — follows visible drawer (source until atomic commit). */
export function resolveVmDrawerDisplayRoute(
    drawer: AdminDrawerState,
    pathname: string | null | undefined,
    phase: DrawerRuntimePhaseState,
    _previousDrawer: DrawerStackItem | null
): VmDrawerRuntimeRoute {
    const renderDrawer = resolveAtomicRenderDrawer(drawer, phase);
    const route = resolveVmDrawerRuntimeRoute(renderDrawer, pathname);
    return coerceAdminV2VmDrawerRoute(route, renderDrawer, pathname);
}

export function isVmDrawerTransitionHoldingSource(phase: DrawerRuntimePhaseState): boolean {
    return phase.phase === "swap_preparing";
}

export function vmPayloadMatchesRenderDrawer(
    displayEntityId: string | null | undefined,
    renderDrawer: AdminDrawerState
): boolean {
    const renderId = String(renderDrawer.id ?? "").trim();
    if (!renderId || !displayEntityId) return false;
    return String(displayEntityId) === renderId;
}

export function shouldShowVmDrawerColdShell(params: {
    coldLoading: boolean;
    hasDisplayVm: boolean;
    suppressFullDrawerLoading: boolean;
    renderDrawer: AdminDrawerState;
    targetDrawer: AdminDrawerState;
}): boolean {
    if (params.suppressFullDrawerLoading) return false;
    if (!params.coldLoading || params.hasDisplayVm) return false;
    return (
        params.renderDrawer.type === params.targetDrawer.type &&
        String(params.renderDrawer.id) === String(params.targetDrawer.id)
    );
}

export function isDrawerVmTransitionActive(phase: DrawerRuntimePhaseState): boolean {
    return isDrawerTransitionPhase(phase.phase);
}
