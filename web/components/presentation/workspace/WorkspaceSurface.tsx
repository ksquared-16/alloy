"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE: the one render site for the Workspace.
 *
 * The only component in this tree that touches the runtime: it calls
 * `useWorkspaceSurfaceRuntime()` and hands resolved models down as props
 * (docs/platform/experience/presentation-runtime-v2.md). Subcomponents never fetch.
 */

import { useWorkspaceSurfaceRuntime } from "@/lib/presentation/runtime";
import { useWorkspaceProcessSurfaceConfig } from "@/lib/presentation/runtime/useWorkspaceProcessSurfaceConfig";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { ProcessGrid } from "./ProcessGrid";
import { WorkspaceRightRailActions } from "@/components/presentation/rightRail/WorkspaceRightRailActions";
import { CreateLeadEventHost } from "@/components/presentation/rightRail/CreateLeadEventHost";

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
    // The one Workspace Process Surface config (Today's Work behavior), authored in
    // /settings/surfaces. Defaults until the published config loads. The process cards ARE
    // the workspace surface — there is no separate header metric strip.
    const processConfig = useWorkspaceProcessSurfaceConfig();

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceSurface)}
            // `surface-enter` choreography: when `model.ready` clears the gate the class is added
            // to this container, sliding the Workspace surface in FROM THE LEFT — returning to the
            // process overview (spatially opposite the Work Unit's drill-in from the right). The
            // skeleton state carries no enter.
            className={`flex flex-col gap-5${model.ready ? " motion-surface-enter-back" : ""}`}
        >
            {!model.ready ? (
                <WorkspaceSurfaceSkeleton />
            ) : (
                <>
                    {/* Workspace Process Surface: org identity header (no metric strip) + one
                        ProcessSummaryCard per process. The header metric strip is retired. */}
                    <WorkspaceHeader orgName={model.header.orgName} />
                    <ProcessGrid processes={model.processes} config={processConfig} />
                    {/* Registers the configured Workspace actions into the persistent command
                        rail's "Actions (N)" section — same path as the Work Unit. Renders null. */}
                    <WorkspaceRightRailActions
                        actions={model.rightRailActions}
                        defaultDepartmentId={model.defaultDepartmentId}
                    />
                    {/* Page-level Create Lead modal host — stable, outside the command-rail
                        floating menu, so its outside-click dismissal can't unmount the modal. */}
                    <CreateLeadEventHost />
                </>
            )}
        </div>
    );
}
