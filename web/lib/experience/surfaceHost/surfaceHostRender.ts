/**
 * Surface Host render decision (Phase 2B Step 3 — canonical).
 *
 * The Surface Host is now the ONE renderer of the work-unit surface: whenever the URL is a work
 * unit, the Host mounts it via `useWorkUnitSurfaceController`, and `WorkUnitSlugRouteHost` is the
 * seed-only route. No flag, no parallel route-render/host-render modes — one execution path, so
 * exactly one controller runs the identity / deep-link / URL-sync effects.
 */

import type { SurfaceRef } from "@/lib/experience/surfaceHost/surfaceRef";

/** The Host renders the work-unit surface whenever the current URL is a work unit. */
export function surfaceHostShouldRenderWorkUnit(ref: SurfaceRef): boolean {
    return ref.kind === "work-unit" && ref.workUnitSlug != null;
}
