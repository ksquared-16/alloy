import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";

/**
 * Run before shell / dept drill-in navigation. Never calls preventDefault —
 * Next.js <Link> must receive the native click to navigate.
 */
export function adminV2BeforeRouteNavigation(opts?: { closeDrawer?: () => void }): void {
    markWorkUnitNavigationStart();
    opts?.closeDrawer?.();
}
