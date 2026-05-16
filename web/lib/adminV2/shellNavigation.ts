import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";

/**
 * Run before shell / dept drill-in navigation. Never calls preventDefault —
 * callers use explicit router.push after this returns.
 */
export function adminV2BeforeRouteNavigation(opts?: { closeDrawer?: () => void }): void {
    markWorkUnitNavigationStart();
    /** Close synchronously so fixed drawer layers cannot intercept the next paint. */
    opts?.closeDrawer?.();
}

/** Preferred drill-in path when Next `<Link>` soft navigation is cancelled by in-flight RSC work. */
export function adminV2HardNavigate(
    router: { push: (href: string) => void },
    href: string,
    opts?: { closeDrawer?: () => void }
): void {
    adminV2BeforeRouteNavigation(opts);
    router.push(href);
}
