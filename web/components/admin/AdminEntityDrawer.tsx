"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import EnrollmentSubjectSurfaceRuntime from "@/components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime";
import PersonSubjectSurfaceRuntime from "@/components/admin/subjectSurface/PersonSubjectSurfaceRuntime";
import { isWorkUnitQueueSurfacePath } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
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
        // Presentation Runtime V2 (docs/platform/experience/presentation-runtime-v2.md):
        // on work-unit surfaces the INLINE Focus Panel region (FP.SURFACE →
        // InlineOpportunityFocusPanel) owns the record surface — the modal/drawer chrome
        // must never mount there. Selection state stays in AdminDrawerContext; the inline
        // region renders the same record runtime (VM payload, reveal, cards, save
        // coordinator). Suppression also guarantees the module-singleton save coordinator
        // never sees modal + inline editable sections mounted simultaneously. Person /
        // child / legacy routes below keep the modal (e.g. contact cards opened from
        // within the inline panel).
        if (isWorkUnitQueueSurfacePath(pathname)) {
            return null;
        }
        return <EnrollmentSubjectSurfaceRuntime />;
    }
    if (route === "person" || route === "child") {
        return <PersonSubjectSurfaceRuntime />;
    }

    if (legacyDrawerMustNotRenderVmBackedEntity(drawer, pathname)) {
        return null;
    }

    return <AdminEntityDrawerLegacy />;
}
