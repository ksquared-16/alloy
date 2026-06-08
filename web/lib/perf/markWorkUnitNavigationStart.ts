import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";
import { setAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";

/** Marks intentional drill-in from department / work-unit links (sidebar, tiles, queue cards). */
export function markWorkUnitNavigationStart(): void {
    setAdminV2PrimarySurfacePending(true, "work_unit_navigation");
    if (typeof window !== "undefined" && typeof performance !== "undefined") {
        const now = performance.now();
        alloyPerfSet("route_nav_start", now);
        alloyPerfSet("work_unit_navigation_start", now);
    }
}
