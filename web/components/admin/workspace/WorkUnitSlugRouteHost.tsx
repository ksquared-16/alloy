"use client";

import { useMemo } from "react";
import {
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";

/**
 * Route host for `/workspace/work-unit/:slug` — canonically SEED-ONLY.
 *
 * The Surface Host is the one renderer of the work-unit surface, committed from focus. This route only
 * writes the server-resolved identity into the module cache — synchronously (via useMemo, so it is
 * written before the Host's sibling mount reads it), removing the cold-shell / slug-resolution
 * waterfall. It runs NO effects and owns NO record-open behavior: the selected record is the
 * Operational Subject carried by `?subject_id` (RA-2 retired the legacy `/:recordId` path-drawer
 * duality). Renders nothing itself; the Host renders the surface.
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
    return null;
}
