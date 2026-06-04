"use client";

import { usePathname } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import { AdminEntityDrawerLegacy } from "@/components/admin/AdminEntityDrawerLegacy";
import OpportunityDrawerVmRuntime from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime";
import { resolveVmDrawerRuntimeRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerRuntimeRoute";

/**
 * Drawer entry router — VM cutover opportunities use an isolated runtime;
 * all other entity types / flags use the legacy drawer implementation.
 */
export default function AdminEntityDrawer() {
    const pathname = usePathname();
    const { drawer } = useAdminDrawer();
    const route = resolveVmDrawerRuntimeRoute(drawer, pathname);

    if (route === "opportunity") {
        return <OpportunityDrawerVmRuntime />;
    }

    return <AdminEntityDrawerLegacy />;
}
