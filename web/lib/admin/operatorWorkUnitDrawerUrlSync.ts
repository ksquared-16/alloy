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

/**
 * True when navigation stays on the same work-unit slug base (so an open drawer must NOT auto-close).
 *
 * Guards the legacy `AdminDrawerContext` auto-close: a same-base pathname change (historically a
 * `:recordId`-only change; now any non-slug-changing move) is not a real surface exit. RA-2 retired the
 * `/:recordId` path form, but this same-base check remains the correct auto-close guard for the drawer.
 */
export function isOperatorWorkUnitRecordIdOnlyPathChange(prevPathname: string, nextPathname: string): boolean {
    const prevBase = operatorWorkUnitRouteBase(prevPathname);
    const nextBase = operatorWorkUnitRouteBase(nextPathname);
    return prevBase != null && prevBase === nextBase;
}
