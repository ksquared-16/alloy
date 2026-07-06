"use client";

import { useMemo } from "react";
import { PresentationRuntime } from "@/components/presentation/PresentationRuntime";
import { WorkUnitWorkspaceColdShell } from "@/components/admin/workspace/WorkUnitWorkspaceColdShell";
import { WorkUnitSlugRouteProvider } from "@/contexts/WorkUnitSlugRouteContext";
import type { WorkUnitSurfaceControllerState } from "@/lib/experience/surfaceHost/workUnitSurfaceController";
import {
    putWorkUnitSlugRouteCache,
    type WorkUnitSlugRouteCacheEntry,
} from "@/lib/admin/workUnitSlugRouteCache";

/**
 * Route host for `/workspace/work-unit/:slug` (+ optional `:recordId`) — canonically SEED-ONLY.
 *
 * The Surface Host is the one renderer of the work-unit surface (Step 3). This route only writes the
 * server-resolved identity into the module cache — synchronously (via useMemo, so it is written
 * before the Host's sibling mount reads it), removing the cold-shell / slug-resolution waterfall.
 * It runs NO controller effects, so exactly one controller (the Host's) owns identity / record
 * deep-link opening / URL sync — never doubled. Renders nothing itself; the Host renders the surface.
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

/** Pure render of a controller state — reused by the Surface Host (Step 3). */
export function WorkUnitSurfaceView({ controller }: { controller: WorkUnitSurfaceControllerState }) {
    if (controller.phase === "loading") {
        // Outbound transition: the URL has already left this work unit — hold instead of flashing
        // this work unit's cold shell at a foreign path (Continuity, Law 2).
        if (controller.isLeaving) return null;
        return (
            <WorkUnitWorkspaceColdShell
                workUnitTitle={controller.coldShell.workUnitTitle}
                departmentId={controller.coldShell.departmentId}
                reserveActionsRail
            />
        );
    }

    if (controller.phase === "error") {
        return (
            <div
                className="rounded-md border border-alloy-ember/30 bg-alloy-ember/5 px-4 py-3 text-sm text-alloy-ember"
                role="alert"
            >
                {controller.message}
            </div>
        );
    }

    return (
        <WorkUnitSlugRouteProvider value={controller.providerValue}>
            <PresentationRuntime surface="work-unit" />
        </WorkUnitSlugRouteProvider>
    );
}
