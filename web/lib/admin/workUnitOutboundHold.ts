import {
    normalizeOperatorPathname,
    parseOperatorWorkUnitPath,
} from "@/lib/admin/canonicalOperatorRoutes";
import { workUnitRouteSlugToKey } from "@/lib/admin/workUnitRouteSlug";

/**
 * True when the browser pathname has already left this work unit's surface — the operator
 * is navigating away (back to Workspace, to a department, or to a different work unit).
 *
 * The App Router updates `usePathname()` synchronously at navigation start while the prior
 * route subtree is still mounted, so a slug host that is mid-warm can otherwise paint a
 * "Loading work unit" cold shell at a URL that is no longer this work unit. That is an
 * outbound skeleton: loading belongs to arrival, never departure (Operational Experience
 * Doctrine — Law 2, Continuity).
 *
 * When this returns true the slug host must HOLD (yield to the prior stable surface / the
 * destination) rather than render its cold shell.
 */
export function isLeavingWorkUnitSurface(
    pathname: string | null | undefined,
    hostWorkUnitSlug: string,
): boolean {
    if (!pathname) return false;
    const activeSlug = parseOperatorWorkUnitPath(normalizeOperatorPathname(pathname)).workUnitSlug;
    // Pathname is not a work-unit surface at all (e.g. /workspace, a department) → leaving.
    if (!activeSlug) return true;
    // A different work unit owns the URL now → this host's surface is being left; the
    // incoming host (whose slug matches) owns the arrival cold shell, not this one.
    return workUnitRouteSlugToKey(activeSlug) !== workUnitRouteSlugToKey(hostWorkUnitSlug);
}
