import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";

/**
 * Run before shell / dept drill-in navigation.
 */
export function adminV2BeforeRouteNavigation(opts?: { closeDrawer?: () => void }): void {
    markWorkUnitNavigationStart();
    opts?.closeDrawer?.();
}

/**
 * Guaranteed navigation — full document load. Use when App Router soft navigations
 * are cancelled by in-flight RSC work (Vercel logs show `---` on GET).
 */
export function adminV2CommitNavigation(href: string, opts?: { closeDrawer?: () => void }): void {
    if (typeof window === "undefined") return;
    const target = href.trim();
    if (!target) return;
    adminV2BeforeRouteNavigation(opts);
    const current = `${window.location.pathname}${window.location.search}`;
    const next = target.startsWith("http")
        ? target
        : target.startsWith("/")
          ? target
          : `/${target}`;
    if (!target.startsWith("http") && current === next.split("#")[0]) {
        return;
    }
    window.location.assign(next);
}
