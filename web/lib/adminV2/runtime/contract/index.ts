/**
 * AdminV2 runtime contract — composer-owned reveal, not section-owned loading.
 *
 * New drawer sections must register in `registry/*` and pass `validateDrawerSectionRegistry`.
 */

export type {
    AdminV2DrawerEntityType,
    AdminV2DrawerRuntimePlan,
    AdminV2DrawerSurface,
    AdminV2QueueLaneRevealState,
    AdminV2RouteRevealMode,
    ComposeAdminV2DrawerRuntimeInput,
    DrawerSectionFallbackMode,
    DrawerSectionRenderContext,
    DrawerSectionReservedLayout,
} from "@/lib/adminV2/runtime/contract/types";

export type { AdminV2DrawerSectionContract } from "@/lib/adminV2/runtime/contract/drawerSectionContract";
export {
    evaluateDrawerSectionPlan,
    validateDrawerSectionContract,
    validateDrawerSectionRegistry,
} from "@/lib/adminV2/runtime/contract/drawerSectionContract";

export { composeAdminV2DrawerRuntime } from "@/lib/adminV2/runtime/contract/drawerComposerPolicy";

export {
    adminV2DrawerCanRevealActiveTab,
    adminV2DrawerHeaderActionsTabIndependent,
    adminV2DrawerTabsPremountWhenSurfaceReady,
    adminV2DrawerWorkflowTabsToPremount,
} from "@/lib/adminV2/runtime/contract/drawerTabsContract";

export {
    adminV2QueueLaneDisplayDecision,
    adminV2QueueMayShowRowSkeleton,
    adminV2QueueMustHoldLane,
    adminV2WorkUnitRouteRevealMode,
    workUnitKpiStripShowsPlaceholder,
    workUnitPageContentReady,
    workUnitPageShowsLoadingGate,
    resolveWorkUnitQueueLaneRevealState,
    workUnitQueueLaneMayPaintRows,
    workUnitQueueLaneRevealSettled,
} from "@/lib/adminV2/runtime/contract/routeRevealPolicy";

export {
    ALL_ADMINV2_DRAWER_SECTION_REGISTRY,
    CHILD_DRAWER_SECTION_REGISTRY,
    OPPORTUNITY_DRAWER_SECTION_REGISTRY,
    PARENT_DRAWER_SECTION_REGISTRY,
    drawerSectionRegistryForSurface,
} from "@/lib/adminV2/runtime/contract/registry";
