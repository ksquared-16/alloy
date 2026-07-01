import type { DrawerTabKey } from "@/lib/entityPresentation";
import { OPPORTUNITY_DRAWER_WORKFLOW_TABS_PREMOUNT } from "@/lib/admin/drawer/opportunityDrawerTabSession";

export type AdminV2DrawerTabsContractInput = {
    inquiryWorkflow: boolean;
    drawerSurfaceReady: boolean;
    activeTab: DrawerTabKey;
};

/**
 * Header/actions chrome is independent of active tab for inquiry workflow drawers.
 * Tabs pre-mount when the drawer surface is ready (no visible load-in on first click).
 */
export function adminV2DrawerHeaderActionsTabIndependent(input: {
    inquiryWorkflow: boolean;
}): boolean {
    return input.inquiryWorkflow;
}

export function adminV2DrawerTabsPremountWhenSurfaceReady(input: AdminV2DrawerTabsContractInput): boolean {
    if (!input.inquiryWorkflow) return false;
    return input.drawerSurfaceReady;
}

export function adminV2DrawerWorkflowTabsToPremount(): readonly DrawerTabKey[] {
    return OPPORTUNITY_DRAWER_WORKFLOW_TABS_PREMOUNT;
}

export function adminV2DrawerCanRevealActiveTab(input: AdminV2DrawerTabsContractInput): boolean {
    if (!input.inquiryWorkflow) return true;
    return input.drawerSurfaceReady;
}
