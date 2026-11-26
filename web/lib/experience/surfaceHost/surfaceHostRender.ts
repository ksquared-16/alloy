/**
 * Surface Host render decision (canonical).
 *
 * The Surface Host is the ONE renderer of the work-unit surface, committed from focus: whenever the
 * current surface is a work unit, the Host mounts it, and `WorkUnitSlugRouteHost` is the seed-only
 * route. No flag, no parallel route-render/host-render modes — one execution path. The selected record
 * is the Operational Subject carried by `?subject_id`; there is no path-`:recordId` deep-link owner.
 */

import type { SurfaceRef } from "@/lib/experience/surfaceHost/surfaceRef";

/** The Host renders the work-unit surface whenever the current URL is a work unit. */
export function surfaceHostShouldRenderWorkUnit(ref: SurfaceRef): boolean {
    return ref.kind === "work-unit" && ref.workUnitSlug != null;
}
