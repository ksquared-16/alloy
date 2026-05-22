import type { DrawerTabKey } from "@/lib/entityPresentation";

/** Stable min-height for AdminV2 opportunity workflow drawer tab body (prevents shell jump). */
export const ADMINV2_DRAWER_TAB_PANEL_MIN_H = "22rem";

export function adminV2DrawerTabPanelHostStyle(): { minHeight: string } {
    return { minHeight: ADMINV2_DRAWER_TAB_PANEL_MIN_H };
}

/** Fresh visit set per opportunity drawer open. */
export function createOpportunityDrawerTabVisitSet(): Set<DrawerTabKey> {
    return new Set<DrawerTabKey>(["overview"]);
}

export function markOpportunityDrawerTabVisited(visited: Set<DrawerTabKey>, tab: DrawerTabKey): void {
    visited.add(tab);
}

export function opportunityDrawerWorkflowTabMountEnabled(
    workflowTabs: boolean,
    visited: ReadonlySet<DrawerTabKey>,
    tab: DrawerTabKey
): boolean {
    if (!workflowTabs) return false;
    return visited.has(tab);
}

export function opportunityDrawerWorkflowTabPaneClass(activeTab: DrawerTabKey, tab: DrawerTabKey): string {
    return activeTab === tab ? "block min-w-0" : "hidden min-w-0";
}
