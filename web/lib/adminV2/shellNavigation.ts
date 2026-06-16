import { clearDeptOperNavClickAck } from "@/lib/adminV2/navigation/deptOperNavClickAck";
import type { AdminV2RouteLoadingVariant } from "@/lib/adminV2/navigation/adminV2RouteLoadingVocabulary";
import { markWorkUnitNavigationStart } from "@/lib/perf/markWorkUnitNavigationStart";
import {
    CANONICAL_OPERATOR_BASE,
    CANONICAL_OPERATOR_WORK_UNIT_PREFIX,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    isOperatorWorkspacePath,
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import { warmOperatorWorkUnitEntryFromHref } from "@/lib/admin/operatorWorkUnitEntryWarm";
import { prefetchDeptAboveFoldBundle } from "@/lib/adminV2/prefetchAdminV2AboveFold";
import {
    appendWorkspaceSiteToPath,
    isWorkspaceAreaPath,
    normalizeAdminV2Path,
    readStickyWorkspaceSiteIdForNavigation,
} from "@/lib/adminV2/workspaceSiteFilterClient";

/**
 * Soft sidebar/workspace navigation — opt-in via `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV=1`.
 * Hard `adminV2CommitNavigation` remains the default fallback.
 */
export function adminV2SoftSidebarNavEnabled(): boolean {
    if (typeof process !== "undefined" && process.env.NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV === "0") {
        return false;
    }
    return process.env.NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV === "1";
}

function normalizeShellNavPath(href: string): string {
    const pathOnly = href.split(/[?#]/)[0] ?? href;
    const withSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    return normalizeOperatorPathname(withSlash);
}

/** Workspace operator routes safe for orchestrated soft nav (not settings/workflows/forms). */
export function isAdminV2SoftNavEligibleHref(href: string): boolean {
    const normalized = normalizeShellNavPath(href);
    if (!isOperatorWorkspacePath(normalized)) return false;
    if (normalized === CANONICAL_OPERATOR_BASE) return true;
    if (normalized.startsWith(`${CANONICAL_OPERATOR_WORK_UNIT_PREFIX}/`)) return true;
    if (/^\/workspace\/dept\/[^/]+/.test(normalized)) return true;
    return false;
}

export function resolveAdminV2SoftNavVariant(href: string): AdminV2RouteLoadingVariant {
    const normalized = normalizeShellNavPath(href);
    if (parseOperatorWorkUnitPath(normalized).workUnitSlug) return "work_unit";
    if (/^\/workspace\/dept\/[^/]+/.test(normalized)) return "department";
    return "workspace";
}

export function adminV2SoftNavClickedKey(href: string): string {
    return `nav:${normalizeShellNavPath(href)}`;
}

/** Optional warm-up before soft route commit — mirrors workspace tile / sidebar hover intent. */
export function prepareAdminV2SoftNavTarget(href: string): void | Promise<void> {
    const normalized = normalizeShellNavPath(href);
    if (parseOperatorWorkUnitPath(normalized).workUnitSlug) {
        warmOperatorWorkUnitEntryFromHref(href, null, "soft_nav_prepare");
        return;
    }
    const deptMatch = normalized.match(/^\/workspace\/dept\/([^/]+)/);
    if (deptMatch?.[1]) {
        return prefetchDeptAboveFoldBundle({
            departmentId: decodeURIComponent(deptMatch[1]),
            selectedSiteId: readStickyWorkspaceSiteIdForNavigation({ href }),
            reason: "click_prepare",
        });
    }
}

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
