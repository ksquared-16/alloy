"use client";

/**
 * Presentation Runtime V2 — WS.SURFACE: the one render site for the Workspace.
 *
 * The only component in this tree that touches the runtime: it calls
 * `useWorkspaceSurfaceRuntime()` and hands resolved models down as props
 * (docs/platform/experience/presentation-runtime-v2.md). Subcomponents never fetch.
 */

import { useWorkspaceSurfaceRuntime } from "@/lib/presentation/runtime";
import { useWorkspaceOrg } from "@/contexts/WorkspaceOrgContext";
import { useWorkspaceSiteFilter } from "@/contexts/WorkspaceSiteFilterContext";
import { useRetainedScroll } from "@/lib/presentation/runtime/useRetainedScroll";
import { workspaceScrollScope } from "@/lib/presentation/runtime/workUnitOperatorContext";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { WorkspaceHeader } from "./WorkspaceHeader";
import { ProcessGrid } from "./ProcessGrid";
import { WorkspaceRightRailActions } from "@/components/presentation/rightRail/WorkspaceRightRailActions";
import { CreateLeadEventHost } from "@/components/presentation/rightRail/CreateLeadEventHost";
import { AlloyOperationalBootShell } from "@/components/admin/workspace/AlloyOperationalBootShell";

export function WorkspaceSurface() {
    const model = useWorkspaceSurfaceRuntime();
    const { orgId } = useWorkspaceOrg();
    const siteFilter = useWorkspaceSiteFilter();
    const workspaceScrollRef = useRetainedScroll(workspaceScrollScope(orgId, siteFilter?.selectedSiteId ?? null));

    return (
        <div
            ref={workspaceScrollRef}
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workspaceSurface)}
            // `surface-enter` choreography: when `model.ready` clears the gate the class is added
            // to this container, sliding the Workspace surface in FROM THE LEFT — returning to the
            // process overview (spatially opposite the Work Unit's drill-in from the right). The
            // skeleton state carries no enter.
            // `min-h-0 flex-1 overflow-y-auto` makes this the retained workspace scrollport: a
            // scrollbar appears only when the process overview overflows, and the operator's scroll
            // position is restored on return (RETAINED-TRUTH §scroll).
            className={`flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto${model.ready ? " motion-surface-enter-back" : ""}`}
        >
            {!model.ready ? (
                // ONE canonical operational-canvas loading owner — the SAME centered enlarged
                // "Thinking…" the Work Unit uses (AlloyOperationalBootShell content mode), never a
                // faint skeleton that reads as an empty white canvas (Kelly Blocker 3). A VISITED
                // Workspace is `ready` immediately from its retained seed, so this shows ONLY on a
                // genuine cold Workspace, then the surface reveals atomically.
                <AlloyOperationalBootShell variant="workspace" chrome="content" />
            ) : (
                <>
                    {/* Workspace Header (title / subtitle / org KPIs) + one ProcessSummaryCard
                        per configured business process. */}
                    <WorkspaceHeader model={model.header} />
                    <ProcessGrid processes={model.processes} config={model.processConfig} />
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
