"use client";

import { useEffect, useMemo } from "react";
import {
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";
import {
    declareWorkUnitSurfaceMounted,
    releaseWorkUnitSurface,
} from "@/lib/adminV2/runtime/preload/drawerVmPrewarmScheduler";

/**
 * Route host for `/workspace/work-unit/:slug` — canonically SEED-ONLY.
 *
 * The Surface Host is the one renderer of the work-unit surface, committed from focus. This route only
 * writes the server-resolved identity into the module cache — synchronously (via useMemo, so it is
 * written before the Host's sibling mount reads it), removing the cold-shell / slug-resolution
 * waterfall. It owns NO record-open behavior: the selected record is the Operational Subject carried
 * by `?subject_id` (RA-2 retired the legacy `/:recordId` path-drawer duality). Renders nothing
 * itself; the Host renders the surface.
 *
 * It also DECLARES the Work Unit reveal lifecycle. This is the earliest client moment at which the
 * document is known to be a Work Unit — the surface runtime does not mount until much later (4,464 ms
 * on a cold direct boot, measured), and before it does, "no reveal is active" is indistinguishable
 * from "this surface has no Work Unit". Consumers that must not act on provisional layout need that
 * distinction. `initialRouteMeta === null` means the server could not resolve the route, so there is
 * no reveal to wait for and the lifecycle goes straight to a terminal outcome.
 *
 * The declaration is one-way: nothing here waits for a consumer, and no reveal timing changes.
 */
export default function WorkUnitSlugRouteHost({
    workUnitSlug,
    initialRouteMeta = null,
}: {
    workUnitSlug: string;
    /** Server-resolved route identity (Doctrine §1/5) — seeded into the module cache for the Host. */
    initialRouteMeta?: WorkUnitSlugRouteCacheEntry | null;
}) {
    useMemo(() => {
        if (initialRouteMeta) putWorkUnitSlugRouteCache(workUnitSlug, initialRouteMeta);
    }, [workUnitSlug, initialRouteMeta]);

    const resolved = Boolean(initialRouteMeta);
    /*
     * DECLARED DURING RENDER, NOT IN AN EFFECT.
     *
     * An effect runs after paint. Measured on a cold direct boot, the rail painted at 765 ms and the
     * effect declared at 1,482 ms — so for that window the lifecycle read `idle`, which is terminal,
     * and a consumer waiting for "no reveal outstanding" was told the truth for the wrong reason.
     * Declaring in render closes that window; the paired release still belongs in an effect, because
     * only an effect has an unmount.
     */
    const declaredEpoch = useMemo(
        () => declareWorkUnitSurfaceMounted(resolved),
        [workUnitSlug, resolved],
    );
    useEffect(() => () => releaseWorkUnitSurface(declaredEpoch), [declaredEpoch]);

    return null;
}
