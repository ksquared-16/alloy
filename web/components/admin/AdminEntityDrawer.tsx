"use client";

import { usePathname } from "next/navigation";
import { useAdminDrawer } from "@/contexts/AdminDrawerContext";
import EnrollmentSubjectSurfaceRuntime from "@/components/admin/subjectSurface/EnrollmentSubjectSurfaceRuntime";
import PersonSubjectSurfaceRuntime from "@/components/admin/subjectSurface/PersonSubjectSurfaceRuntime";
import { isWorkUnitQueueSurfacePath } from "@/lib/adminV2/runtime/alloyOsRuntimeFlag";
import { resolveVmDrawerDisplayRoute } from "@/lib/adminV2/viewModel/drawer/vmRuntime/vmDrawerTransitionCoordinator";

/**
 * Canonical drawer router — VM-backed entities only.
 * Unsupported entity types fail closed (no legacy fallback runtime).
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
        // child routes below keep the modal (e.g. contact cards opened from
        // within the inline panel).
        if (isWorkUnitQueueSurfacePath(pathname)) {
            return null;
        }
        return <EnrollmentSubjectSurfaceRuntime />;
    }
    if (route === "person" || route === "child") {
        return <PersonSubjectSurfaceRuntime />;
    }

    return null;
}
