import { alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

/** Marks intentional drill-in from department / work-unit links (sidebar, tiles, queue cards). */
export function markWorkUnitNavigationStart(): void {
    if (typeof window !== "undefined" && typeof performance !== "undefined") {
        const now = performance.now();
        alloyPerfSet("route_nav_start", now);
        alloyPerfSet("work_unit_navigation_start", now);
    }
}
