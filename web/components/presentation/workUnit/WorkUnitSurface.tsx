"use client";

/**
 * Presentation Runtime V2 — WU.SURFACE.
 *
 * The Work Unit surface: the expanded state of a process. The ONLY component in this
 * tree that calls the runtime hook — subcomponents receive resolved models + intents as
 * props and never fetch (docs/platform/experience/presentation-runtime-v2.md).
 *
 * Composition (doctrine order): WorkUnitHeader → OperationalAnswersRow (WU.ANSWERS) →
 * WorkViewPillStrip → QueueRegion inside FocusPanelSurface, with RightRailSurface as the
 * right column (rail collapses under the main column on narrow widths).
 */

import { useWorkUnitSurfaceRuntime } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { OperationalAnswersRow } from "@/components/presentation/shared/OperationalAnswersRow";
import { RightRailSurface } from "@/components/presentation/rightRail/RightRailSurface";
import { WorkUnitHeader } from "./WorkUnitHeader";
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
                <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
                    <div className="min-w-0 flex-1 space-y-4">
                        <WorkUnitHeader
                            processLabel={model.header.processLabel}
                            workViewLabel={model.header.workViewLabel}
                        />
                        <OperationalAnswersRow
                            answers={model.answers}
                            label={PRESENTATION_RUNTIME_LABELS.workUnitAnswers}
                        />
                        <WorkViewPillStrip workViews={model.workViews} onSelect={intents.selectWorkView} />
                        <FocusPanelSurface openRecord={intents.openRecord}>
                            <QueueRegion queue={model.queue} />
                        </FocusPanelSurface>
                    </div>
                    <RightRailSurface />
                </div>
            )}
        </div>
    );
}
