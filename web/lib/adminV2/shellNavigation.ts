import { clearDeptOperNavClickAck } from "@/lib/adminV2/navigation/deptOperNavClickAck";
import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";
import {
    appendWorkspaceSiteToPath,
    isWorkspaceAreaPath,
    normalizeAdminV2Path,
    readStickyWorkspaceSiteIdForNavigation,
} from "@/lib/adminV2/workspaceSiteFilterClient";

/**
 * Run before shell / dept drill-in navigation.
 */
export function adminV2BeforeRouteNavigation(opts?: { closeDrawer?: () => void }): void {
    markWorkUnitNavigationStart();
    opts?.closeDrawer?.();
}

export type AdminV2CommitNavigationOpts = {
    closeDrawer?: () => void;
    /** When set (including `null`), overrides sticky site for this navigation. */
    workspaceSiteId?: string | null;
};

/**
 * Guaranteed navigation — full document load. Use when App Router soft navigations
 * are cancelled by in-flight RSC work (Vercel logs show `---` on GET).
 */
export function adminV2CommitNavigation(href: string, opts?: AdminV2CommitNavigationOpts): void {
    if (typeof window === "undefined") return;
    const target = href.trim();
    if (!target) return;
    adminV2BeforeRouteNavigation(opts);
    let next = target.startsWith("http")
        ? target
        : target.startsWith("/")
          ? target
          : `/${target}`;

    if (!target.startsWith("http")) {
        const pathOnly = next.split(/[?#]/)[0] ?? next;
        if (isWorkspaceAreaPath(normalizeAdminV2Path(pathOnly))) {
            const stickySiteId = readStickyWorkspaceSiteIdForNavigation({
                href: next,
                explicitSiteId: opts?.workspaceSiteId,
            });
            next = appendWorkspaceSiteToPath(next, stickySiteId);
        }
    }

    const current = `${window.location.pathname}${window.location.search}`;
    if (!target.startsWith("http") && current === next.split("#")[0]) {
        clearDeptOperNavClickAck();
        return;
    }
    window.location.assign(next);
}
