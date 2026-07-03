"use client";

/**
 * Presentation Runtime V2 — WU.SURFACE.
 *
 * The Work Unit surface: the expanded state of a process. The ONLY component in this
 * tree that calls the runtime hook — subcomponents receive resolved models + intents as
 * props and never fetch (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Composition (doctrine order): WorkUnitHeader + WorkUnitHeaderCalculations
 * (WU.HEADER_CALCULATIONS — the published Work Unit Header surface) inside one header
 * <section> → WorkViewPillStrip → QueueRegion inside FocusPanelSurface, with
 * RightRailSurface as the right column. Header title, cards, and pills all commit under the
 * single `model.ready` reveal, so they appear together (no pop-in/shift). An empty rail
 * renders as a hidden zero-footprint anchor, so the main column takes the full width
 * (display:none flex items reserve no column and no gap).
 */

import { useWorkUnitSurfaceRuntime } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { RightRailSurface } from "@/components/presentation/rightRail/RightRailSurface";
import { WorkUnitRightRailActions } from "@/components/presentation/rightRail/WorkUnitRightRailActions";
import { WorkUnitHeader } from "./WorkUnitHeader";
import { WorkUnitHeaderCalculations } from "./WorkUnitHeaderCalculations";
import { WorkViewPillStrip } from "./WorkViewPillStrip";
import { QueueRegion } from "./QueueRegion";
import { FocusPanelSurface } from "./FocusPanelSurface";

/** Minimal neutral skeleton while surface identity/config resolves (above-fold only). */
function WorkUnitSurfaceSkeleton() {
    return (
        <div aria-busy="true" aria-label="Loading work unit" className="space-y-4">
            <div className="space-y-1.5">
                <span className="block h-3 w-24 animate-pulse rounded bg-alloy-stone/30" aria-hidden />
                <span className="block h-6 w-[min(60%,18rem)] animate-pulse rounded bg-alloy-stone/40" aria-hidden />
            </div>
            <div className="flex gap-2">
                {Array.from({ length: 3 }, (_, i) => (
                    <span
                        key={`wu-pill-skeleton-${i}`}
                        className="block h-6 w-24 animate-pulse rounded-full bg-alloy-stone/30"
                        aria-hidden
                    />
                ))}
            </div>
            <div className="space-y-2 rounded-lg border border-alloy-stone/18 bg-white p-3">
                {Array.from({ length: 3 }, (_, i) => (
                    <span
                        key={`wu-row-skeleton-${i}`}
                        className="block h-3.5 w-[min(72%,20rem)] animate-pulse rounded bg-alloy-stone/30"
                        aria-hidden
                    />
                ))}
            </div>
        </div>
    );
}

export function WorkUnitSurface() {
    const { model, intents } = useWorkUnitSurfaceRuntime();

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitSurface)}
            data-surface-ready={model.ready ? "true" : "false"}
        >
            {!model.ready ? (
                <WorkUnitSurfaceSkeleton />
            ) : (
                <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1 space-y-3">
                        {/* Compact Work Unit Overview header — title + one-row metric strip. Kept
                            tight so the queue + Focus Panel stay high on screen (metric area
                            well under ~20% of the viewport). */}
                        <section className="space-y-2">
                            <WorkUnitHeader
                                processLabel={model.header.processLabel}
                                workViewLabel={model.header.workViewLabel}
                            />
                            <WorkUnitHeaderCalculations cards={model.header.calculations} />
                        </section>
                        <WorkViewPillStrip
                            workViews={model.workViews}
                            onSelect={intents.selectWorkView}
                            onPrefetch={intents.prefetchWorkView}
                        />
                        <FocusPanelSurface
                            openRecord={intents.openRecord}
                            prefetchRecord={intents.prefetchRecord}
                        >
                            <QueueRegion queue={model.queue} selectedRecordId={model.selectedRecordId} />
                        </FocusPanelSurface>
                    </div>
                    {/* RR.SURFACE stays as the label anchor (single-ownership); the operator's
                        actual right rail is the persistent shell command rail. The resolved actions
                        register INTO that rail via WorkUnitRightRailActions (renders null) — one
                        action presentation path, no center duplicate. */}
                    <RightRailSurface />
                    <WorkUnitRightRailActions
                        actions={model.rightRailActions}
                        departmentId={model.departmentId}
                        workUnitId={model.workUnitId}
                    />
                </div>
            )}
        </div>
    );
}
