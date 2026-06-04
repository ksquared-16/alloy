import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import { isVmBackedDrawerEntityType } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";

export type VmDrawerRuntimeRoute = "opportunity" | "person" | "legacy";

function isAdminV2DrawerSurface(pathname: string | null | undefined): boolean {
    return (
        pathname?.startsWith("/adminV2") === true || pathname?.startsWith("/admin/workspace") === true
    );
}

export function resolveVmDrawerRuntimeRoute(
    drawer: AdminDrawerState,
    pathname: string | null | undefined
): VmDrawerRuntimeRoute {
    if (!drawer.type || !drawer.id || drawer.id === "new") return "legacy";
    if (!isVmBackedDrawerEntityType(drawer.type)) return "legacy";
    if (!isAdminV2DrawerSurface(pathname)) return "legacy";

    if (drawer.type === "opportunities" && opportunityDrawerHardCutoverEnabled()) {
        return "opportunity";
    }

    /* Person/child VM runtime shell is a follow-up; keep legacy drawer until VmPersonRuntime ships. */
    return "legacy";
}

export function shouldBlockLegacyOpportunityDrawerBranch(route: VmDrawerRuntimeRoute): boolean {
    return route === "opportunity";
}
