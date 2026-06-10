"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import OpportunityDrawerVmRuntime from "@/components/admin/vmDrawer/OpportunityDrawerVmRuntime";
import PersonsDrawerVmRuntime from "@/components/admin/vmDrawer/PersonsDrawerVmRuntime";
import { legacyDrawerMustNotRenderVmBackedEntity } from "@/lib/adminV2/viewModel/drawer/vmRuntime/legacyDrawerVmEntityQuarantine";
import { resolveVmDrawerDisplayRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";

const AdminEntityDrawerLegacy = dynamic(
    () =>
        import("@/components/admin/AdminEntityDrawerLegacy").then((m) => ({
            default: m.AdminEntityDrawerLegacy,
        })),
    { ssr: false }
);

/**
 * Drawer entry router — VM cutover entities use isolated runtimes;
 * legacy drawer loads on demand only when the VM path is not active.
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

    if (legacyDrawerMustNotRenderVmBackedEntity(drawer, pathname)) {
        return null;
    }

    return <AdminEntityDrawerLegacy />;
}
