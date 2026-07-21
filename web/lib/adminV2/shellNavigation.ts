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
import { warmOperatorWorkUnitNavEntry } from "@/lib/admin/warmOperatorWorkUnitNavEntry";
import {
    appendWorkspaceSiteToPath,
    isWorkspaceAreaPath,
    normalizeAdminV2Path,
    readStickyWorkspaceSiteIdForNavigation,
} from "@/lib/adminV2/workspaceSiteFilterClient";
import {
    isConfigurationSoftNavEligibleHref,
    markConfigurationContinuity,
    prepareConfigurationSoftNavTarget,
    resolveConfigurationSoftNavVariant,
} from "@/lib/configRuntime/configurationContinuity";

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

/**
 * Soft navigation kill switch. When `NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV=0`, every shell
 * link hard-reloads (`window.location.assign`). Default ON for:
 * - Operator Workspace ↔ Work Unit (NAV-1 / Surface Host)
 * - Organization / Settings Configuration Continuity (Checkpoint A)
 *
 * Workflows / forms remain hard-nav only (not soft-eligible).
 * Hard reload remains the recovery floor via the soft-nav reload-floor watchdog.
 */
export function adminV2OperatorSoftNavEnabled(): boolean {
    return !(
        typeof process !== "undefined" &&
        process.env.NEXT_PUBLIC_ADMIN_V2_SOFT_SIDEBAR_NAV === "0"
    );
}

function normalizeShellNavPath(href: string): string {
    const pathOnly = href.split(/[?#]/)[0] ?? href;
    const withSlash = pathOnly.startsWith("/") ? pathOnly : `/${pathOnly}`;
    return normalizeOperatorPathname(withSlash);
}

/**
 * Routes safe for orchestrated soft nav (shell stays mounted):
 * - Operator: `/workspace`, work-unit, dept
 * - Configuration Continuity: `/organization`, `/settings/*`
 *
 * Not eligible: workflows, forms, legacy-admin (hard reload retained).
 */
export function isAdminV2SoftNavEligibleHref(href: string): boolean {
    if (isConfigurationSoftNavEligibleHref(href)) return true;
    const normalized = normalizeShellNavPath(href);
    if (!isOperatorWorkspacePath(normalized)) return false;
    if (normalized === CANONICAL_OPERATOR_BASE) return true;
    if (normalized.startsWith(`${CANONICAL_OPERATOR_WORK_UNIT_PREFIX}/`)) return true;
    if (/^\/workspace\/dept\/[^/]+/.test(normalized)) return true;
    return false;
}

export function resolveAdminV2SoftNavVariant(href: string): AdminV2RouteLoadingVariant {
    if (isConfigurationSoftNavEligibleHref(href)) {
        return resolveConfigurationSoftNavVariant(href);
    }
    const normalized = normalizeShellNavPath(href);
    if (parseOperatorWorkUnitPath(normalized).workUnitSlug) return "work_unit";
    if (/^\/workspace\/dept\/[^/]+/.test(normalized)) return "department";
    return "workspace";
}

export function adminV2SoftNavClickedKey(href: string): string {
    return `nav:${normalizeShellNavPath(href)}`;
}

/**
 * Soft-nav for Configuration Continuity commits immediately (acknowledge first), then warms.
 * Work Unit paths keep prepare-before-commit for provisioning warm-up.
 */
export function adminV2SoftNavShouldCommitFirst(href: string): boolean {
    return isConfigurationSoftNavEligibleHref(href);
}

/** Optional warm-up before soft route commit — mirrors workspace tile / sidebar hover intent. */
export function prepareAdminV2SoftNavTarget(href: string): void | Promise<void> {
    if (isConfigurationSoftNavEligibleHref(href)) {
        markConfigurationContinuity("intent", { href });
        markConfigurationContinuity("acknowledge", { href });
        return prepareConfigurationSoftNavTarget(href);
    }
    const normalized = normalizeShellNavPath(href);
    if (parseOperatorWorkUnitPath(normalized).workUnitSlug) {
        warmOperatorWorkUnitNavEntry(href, null, "soft_nav_prepare");
        return;
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
 * Resolve the final href for a navigation, applying the sticky workspace site filter.
 * Returns `null` when the prepared href is the same as the current URL (no-op navigation).
 * Use this when the caller controls how navigation is committed (e.g. router.push for soft nav).
 */
export function adminV2PrepareNavHref(
    href: string,
    opts?: Pick<AdminV2CommitNavigationOpts, "workspaceSiteId">
): string | null {
    if (typeof window === "undefined") return null;
    const target = href.trim();
    if (!target) return null;
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
    if (!target.startsWith("http") && current === next.split("#")[0]) return null;
    return next;
}

/**
 * Guaranteed navigation — full document load. Use when App Router soft navigations
 * are cancelled by in-flight RSC work (Vercel logs show `---` on GET).
 */
export function adminV2CommitNavigation(href: string, opts?: AdminV2CommitNavigationOpts): void {
    if (typeof window === "undefined") return;
    const next = adminV2PrepareNavHref(href, opts);
    if (!next) {
        clearDeptOperNavClickAck();
        return;
    }
    adminV2BeforeRouteNavigation(opts);
    window.location.assign(next);
}
