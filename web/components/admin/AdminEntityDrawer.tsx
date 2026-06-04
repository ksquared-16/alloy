"use client";

import { usePathname } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { AdminEntityDrawerLegacy } from "@/components/admin/AdminEntityDrawerLegacy";
import OpportunityDrawerVmRuntime from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime";
import PersonsDrawerVmRuntime from "@/components/admin/vmDrawer/PersonsDrawerVmRuntime";
import { resolveVmDrawerRuntimeRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";

/**
 * Drawer entry router — VM cutover entities use isolated runtimes;
 * all other entity types / flags use the legacy drawer implementation.
 */
export default function AdminEntityDrawer() {
    const pathname = usePathname();
    const { drawer } = useAdminDrawer();
    const route = resolveVmDrawerRuntimeRoute(drawer, pathname);

    if (route === "opportunity") {
        return <OpportunityDrawerVmRuntime />;
    }
    if (route === "person" || route === "child") {
        return <PersonsDrawerVmRuntime />;
    }

    return <AdminEntityDrawerLegacy />;
}
