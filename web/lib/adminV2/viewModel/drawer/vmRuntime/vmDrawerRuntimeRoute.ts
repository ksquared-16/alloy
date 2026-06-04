import type { AdminDrawerState } from "@/contexts/AdminDrawerContext";
import { isVmBackedDrawerEntityType } from "@/lib/adminV2/viewModel/drawer/drawerShellPinnedModelSwap";
import { isChildDrawerVmOpen } from "@/lib/adminV2/viewModel/drawer/child/childDrawerFirstViewportContract";
import { childDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/child/childDrawerHardCutoverGate";
import { opportunityDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/opportunity/opportunityDrawerHardCutoverGate";
import { personDrawerHardCutoverEnabled } from "@/lib/adminV2/viewModel/drawer/person/personDrawerHardCutoverGate";

export type VmDrawerRuntimeRoute = "opportunity" | "person" | "child" | "legacy";

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

    if (drawer.type === "opportunities") {
        if (opportunityDrawerHardCutoverEnabled()) {
            return "opportunity";
        }
        return "legacy";
    }

    if (drawer.type === "persons") {
        const childOpen = isChildDrawerVmOpen({
            openSource: drawer.openSource ?? null,
            presentationEmphasis: drawer.personDrawerOpenSeed?.presentation_emphasis ?? null,
        });
        if (childOpen && childDrawerHardCutoverEnabled()) {
            return "child";
        }
        if (personDrawerHardCutoverEnabled()) {
            return "person";
        }
    }

    return "legacy";
}

export function shouldBlockLegacyPersonDrawerBranch(route: VmDrawerRuntimeRoute): boolean {
    return route === "person" || route === "child";
}

export function shouldBlockLegacyOpportunityDrawerBranch(route: VmDrawerRuntimeRoute): boolean {
    return route === "opportunity";
}
