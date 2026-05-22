export {
    ADMIN_V2_ROUTE_LOADING_VOCABULARY,
    adminV2RouteLoadingVocabulary,
    type AdminV2RouteLoadingVariant,
    type AdminV2RouteLoadingVocabulary,
} from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";

export {
    DEFAULT_ADMIN_V2_NAVIGATION_TRANSITION_TIMEOUT_MS,
    adminV2NavigationClickedItemProps,
    getAdminV2NavigationTransitionSnapshot,
    isAdminV2NavigationItemPending,
    resetAdminV2NavigationTransitionForTests,
    runAdminV2NavigationTransition,
    subscribeAdminV2NavigationTransition,
    type AdminV2NavigationTransitionActiveSnapshot,
    type AdminV2NavigationTransitionCommitReason,
    type AdminV2NavigationTransitionIdleSnapshot,
    type AdminV2NavigationTransitionSnapshot,
    type RunAdminV2NavigationTransitionOpts,
} from "@/lib/adminV2/navigation/adminV2NavigationTransition";

export { useAdminV2NavigationTransition } from "@/lib/adminV2/navigation/useAdminV2NavigationTransition";

export {
    buildDepartmentOperationalBootstrapUrl,
    prefetchDepartmentOperationalBootstrap,
} from "@/lib/adminV2/navigation/prefetchDepartmentOperationalBootstrap";

export {
    buildWorkUnitOperationalBootstrapUrl,
    parseWorkUnitNavFromDeptOperHref,
    prefetchWorkUnitOperationalBootstrap,
    type WorkUnitOperationalBootstrapPrefetchOpts,
} from "@/lib/adminV2/navigation/prefetchWorkUnitOperationalBootstrap";

export {
    deptOperNavClickAckProps,
    deptOperNavClickedKey,
    getDeptOperNavClickAckSnapshot,
    isDeptOperNavClickPending,
    markDeptOperNavClickAck,
    resetDeptOperNavClickAckForTests,
    subscribeDeptOperNavClickAck,
} from "@/lib/adminV2/navigation/deptOperNavClickAck";
