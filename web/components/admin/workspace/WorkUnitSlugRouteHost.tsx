"use client";

import { PresentationRuntime } from "@/components/presentation/PresentationRuntime";
import { WorkUnitWorkspaceColdShell } from "@/components/admin/workspace/WorkUnitWorkspaceColdShell";
import { WorkUnitSlugRouteProvider } from "@/contexts/WorkUnitSlugRouteContext";
import {
    useWorkUnitSurfaceController,
    type WorkUnitSurfaceControllerState,
} from "@/lib/experience/surfaceHost/workUnitSurfaceController";
import type { WorkUnitSlugRouteCacheEntry } from "@/lib/admin/workUnitSlugRouteCache";

/**
 * Route host for `/workspace/work-unit/:slug` (+ optional `:recordId`). Identity resolution, record
 * deep-link opening, and URL sync now live in the reusable `useWorkUnitSurfaceController` (Surface
 * Host, Phase 2B Step 1) — this component only renders from its state, so behavior is unchanged. The
 * Surface Host drives the SAME controller when it mounts the work-unit surface (Step 3).
 */
export default function WorkUnitSlugRouteHost({
    workUnitSlug,
    initialRouteMeta = null,
}: {
    workUnitSlug: string;
    /** Server-resolved route identity (Doctrine §1/5) — present → no cold shell; null → client resolves. */
    initialRouteMeta?: WorkUnitSlugRouteCacheEntry | null;
}) {
    const controller = useWorkUnitSurfaceController({ workUnitSlug, initialRouteMeta });
    return <WorkUnitSurfaceView controller={controller} />;
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
