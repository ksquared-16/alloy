"use client";

/**
 * Presentation Runtime V2 — WU.SURFACE.
 *
 * The Work Unit surface: the expanded state of a process. The ONLY component in this
 * tree that calls the runtime hook — subcomponents receive resolved models + intents as
 * props and never fetch (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Composition (doctrine order): WorkUnitHeader (WU.HEADER + WU.HEADER_CALCULATIONS)
 * → WorkViewPillStrip → QueueRegion inside FocusPanelSurface, with RightRailSurface as the
 * right column. Header KPIs and pills commit under the single `model.ready` reveal.
 */

import { useEffect, useRef } from "react";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { RightRailSurface } from "@/components/presentation/rightRail/RightRailSurface";
import { WorkUnitRightRailActions } from "@/components/presentation/rightRail/WorkUnitRightRailActions";
import { CreateLeadEventHost } from "@/components/presentation/rightRail/CreateLeadEventHost";
import { BosWorkspaceScopeSync } from "@/components/presentation/rightRail/BosWorkspaceScopeSync";
import { WorkUnitHeader } from "./WorkUnitHeader";
import { WorkViewPillStrip } from "./WorkViewPillStrip";
import type {
    WorkUnitSurfaceModel,
    WorkUnitSurfaceIntents,
    WorkViewLinkModel,
} from "@/lib/presentation/runtime/types";
import { QueueRegion } from "./QueueRegion";
import { FocusPanelSurface } from "./FocusPanelSurface";

/**
 * The established Work Unit surface, rendered from ONE resolved model + intents. Pure
 * presentation — extracted so the surface can render either the live model or a held prior
 * model (Surface Hold) through the same body.
 */
/**
 * The canonical Work Unit body. Exported so the provisioned (committed-Focus) surface renders THE
 * SAME tree — there is exactly one Work Unit presentation tree, fed from one committed model.
 */
export function WorkUnitSurfaceBodyFromModel({
    model,
    intents,
}: {
    model: WorkUnitSurfaceModel;
    intents: WorkUnitSurfaceIntents;
}) {
    // Queue Region title tracks the SELECTED work-view pill (Excel-tab semantics) — not the Work
    // Unit header subtitle. Match by `isActive` first, then by the active id, so the title swaps
    // in step with the pill the operator is on.
    const activeWorkView =
        model.workViews.find((view) => view.isActive) ??
        model.workViews.find((view) => view.id === model.activeWorkViewId) ??
        null;
    // Workspace shell anatomy is STABLE across Work Views and grains (family / child / candidate).
    // Selected subject identity belongs in the Focus Panel — never demote Enrollment/Pipeline chrome
    // into "focus" density when a row is selected (that made Waitlist look like a different page).
    const headerDensity = "browse" as const;
    return (
        <>
            <BosWorkspaceScopeSync
                departmentId={model.departmentId}
                workUnitId={model.workUnitId}
                workUnitName={model.header?.title ?? null}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
                <div className="shrink-0 space-y-1">
                    <WorkUnitHeader
                        model={model.header}
                        density={headerDensity}
                        actionsSlot={
                            <WorkUnitRightRailActions
                                actions={model.rightRailActions}
                                departmentId={model.departmentId}
                                workUnitId={model.workUnitId}
                            />
                        }
                    />
                    <WorkViewPillStrip
                        workViews={model.workViews}
                        onSelect={intents.selectWorkView}
                        onPrefetch={intents.prefetchWorkView}
                    />
                </div>
                <FocusPanelSurface
                    openRecord={intents.openRecord}
                    prefetchRecord={intents.prefetchRecord}
                >
                    <QueueRegion
                        queue={model.queue}
                        title={activeWorkView?.label ?? null}
                        selectedRecordId={model.selectedRecordId}
                        workViewId={model.activeWorkViewId}
                        workUnitId={model.workUnitId}
                    />
                </FocusPanelSurface>
            </div>
            {/* RR.SURFACE stays as the label anchor (single-ownership). Actions live in the
                Work Unit header control band — independent of BOS closed/floating/pinned. */}
            <RightRailSurface />
            {/* Page-level Create Lead modal host — stable, outside the actions floating menu. */}
            <CreateLeadEventHost />
        </>
    );
}


