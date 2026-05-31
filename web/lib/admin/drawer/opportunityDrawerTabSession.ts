import type { DrawerTabKey } from "@/lib/entityPresentation";
import { OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP } from "@/lib/adminV2/shellContracts/opportunityInquiryWorkflowTabs";

/** Stable min-height for AdminV2 opportunity workflow drawer tab body (prevents shell jump). */
export const ADMINV2_DRAWER_TAB_PANEL_MIN_H = "22rem";

export function adminV2DrawerTabPanelHostStyle(): { minHeight: string } {
    return { minHeight: ADMINV2_DRAWER_TAB_PANEL_MIN_H };
}

/** Pre-mount workflow tabs when drawer surface is ready — avoids visible load-in on first click. */
export const OPPORTUNITY_DRAWER_WORKFLOW_TABS_PREMOUNT: readonly DrawerTabKey[] =
    OPPORTUNITY_INQUIRY_WORKFLOW_TAB_STRIP;

/** Fresh visit set per opportunity drawer open — all workflow tabs mounted once surface is ready. */
export function createOpportunityDrawerTabVisitSet(): Set<DrawerTabKey> {
    return new Set<DrawerTabKey>(OPPORTUNITY_DRAWER_WORKFLOW_TABS_PREMOUNT);
}

export function markOpportunityDrawerTabVisited(visited: Set<DrawerTabKey>, tab: DrawerTabKey): void {
    visited.add(tab);
}

export function opportunityDrawerWorkflowTabMountEnabled(
    workflowTabs: boolean,
    visited: ReadonlySet<DrawerTabKey>,
    tab: DrawerTabKey,
    drawerSurfaceReady = false
): boolean {
    if (!workflowTabs) return false;
    if (drawerSurfaceReady) return true;
    return visited.has(tab);
}

export function opportunityDrawerWorkflowTabPaneClass(activeTab: DrawerTabKey, tab: DrawerTabKey): string {
    return activeTab === tab ? "block min-w-0" : "hidden min-w-0";
}
