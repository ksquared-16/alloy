import {
    normalizeToCanonicalAdminPath,
} from "@/lib/admin/canonicalAdminRoutes";
import {
    normalizeOperatorPathname,
    operatorWorkUnitHrefFromKey,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

/** Base operator work-unit path without optional record segment. */
export function operatorWorkUnitRouteBase(pathname: string): string | null {
    const canonical = normalizeOperatorPathname(normalizeToCanonicalAdminPath(pathname));
    const { workUnitSlug } = parseOperatorWorkUnitPath(canonical);
    if (!workUnitSlug) return null;
    return operatorWorkUnitHrefFromKey(workUnitRouteSlugToKey(workUnitSlug));
}

/** True when navigation only adds/removes `:recordId` on the same work-unit slug route. */
export function isOperatorWorkUnitRecordIdOnlyPathChange(prevPathname: string, nextPathname: string): boolean {
    const prevBase = operatorWorkUnitRouteBase(prevPathname);
    const nextBase = operatorWorkUnitRouteBase(nextPathname);
    return prevBase != null && prevBase === nextBase;
}

/**
 * Shallow drawer URL sync — updates the browser bar without a Next.js route transition.
 * Keeps the work-unit page, sidebar, and queue shell mounted.
 */
export function syncOperatorWorkUnitUrlInBrowser(slugKey: string, recordId: string | null): void {
    if (typeof window === "undefined") return;
    const href = operatorWorkUnitHrefFromKey(slugKey, recordId);
    const current = normalizeOperatorPathname(window.location.pathname);
    if (current === href) return;
    window.history.replaceState(window.history.state, "", href);
}
