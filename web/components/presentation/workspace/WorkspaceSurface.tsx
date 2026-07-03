"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE: the one render site for the Workspace.
 *
 * The only component in this tree that touches the runtime: it calls
 * `useWorkspaceSurfaceRuntime()` and hands resolved models down as props
 * (docs/platform/experience/presentation-runtime-v2.md). Subcomponents never fetch.
 */

import { useWorkspaceSurfaceRuntime } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { WorkspaceHeaderCalculations } from "./WorkspaceHeaderCalculations";
import { ProcessGrid } from "./ProcessGrid";
import { WorkspaceRightRailActions } from "@/components/presentation/rightRail/WorkspaceRightRailActions";

/** House loading style: neutral blocks, no spinners. */
function WorkspaceSurfaceSkeleton() {
    return (
        <div className="flex flex-col gap-5" aria-busy="true" aria-label="Loading workspace">
            <div className="space-y-1.5">
                <span className="block h-3 w-20 animate-pulse rounded bg-alloy-stone/12" aria-hidden />
                <span className="block h-6 w-56 animate-pulse rounded bg-alloy-stone/16" aria-hidden />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {Array.from({ length: 3 }, (_, i) => (
                    <span
                        key={`ws-tile-skel-${i}`}
                        className="block min-h-[10rem] animate-pulse rounded-lg border border-alloy-stone/18 bg-alloy-stone/8"
                        aria-hidden
                    />
                ))}
            </div>
        </div>
    );
}

export function WorkspaceSurface() {
    const model = useWorkspaceSurfaceRuntime();

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceSurface)}
            className="flex flex-col gap-5"
        >
            {!model.ready ? (
                <WorkspaceSurfaceSkeleton />
            ) : (
                <>
                    {/* ONE header section: title + published calculation cards commit together
                        (the Route VM seed makes the cards data-complete at first commit — no
                        strip skeleton, no pop-in, no layout shift). */}
                    <section className="flex flex-col gap-3">
                        <WorkspaceHeader orgName={model.header.orgName} />
                        <WorkspaceHeaderCalculations cards={model.header.calculations} />
                    </section>
                    <ProcessGrid processes={model.processes} />
                    {/* Registers the configured Workspace actions into the persistent command
                        rail's "Actions (N)" section — same path as the Work Unit. Renders null. */}
                    <WorkspaceRightRailActions
                        actions={model.rightRailActions}
                        defaultDepartmentId={model.defaultDepartmentId}
                    />
                </>
            )}
        </div>
    );
}
