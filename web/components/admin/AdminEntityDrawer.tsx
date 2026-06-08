"use client";

import { usePathname } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { AdminEntityDrawerLegacy } from "@/components/admin/AdminEntityDrawerLegacy";
import OpportunityDrawerVmRuntime from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime";
import PersonsDrawerVmRuntime from "@/components/admin/vmDrawer/PersonsDrawerVmRuntime";
import { resolveVmDrawerDisplayRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";

/**
 * Drawer entry router — VM cutover entities use isolated runtimes;
 * all other entity types / flags use the legacy drawer implementation.
 * During VM drawer-to-drawer swaps, keeps the source runtime mounted until target VM is ready.
 */
export default function AdminEntityDrawer() {
    const pathname = usePathname();
    const { drawer, drawerRuntimePhase, previousDrawer } = useAdminDrawer();
    const route = resolveVmDrawerDisplayRoute(drawer, pathname, drawerRuntimePhase, previousDrawer);

    if (route === "opportunity") {
        return <OpportunityDrawerVmRuntime />;
    }
    if (route === "person" || route === "child") {
        return <PersonsDrawerVmRuntime />;
    }

    return <AdminEntityDrawerLegacy />;
}
