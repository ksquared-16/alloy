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
import {
    useWorkUnitSurfaceRuntime,
    type WorkUnitSurfaceIntents,
    type WorkUnitSurfaceModel,
} from "@/lib/presentation/runtime";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { markPerceived } from "@/lib/perf/perceivedPerf";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { RightRailSurface } from "@/components/presentation/rightRail/RightRailSurface";
import { WorkUnitRightRailActions } from "@/components/presentation/rightRail/WorkUnitRightRailActions";
import { CreateLeadEventHost } from "@/components/presentation/rightRail/CreateLeadEventHost";
import { WorkUnitHeader } from "./WorkUnitHeader";
import { WorkViewPillStrip } from "./WorkViewPillStrip";
import { QueueRegion } from "./QueueRegion";
import { FocusPanelSurface } from "./FocusPanelSurface";

export type WorkUnitSurfaceRenderMode = "cold" | "held" | "live";

/**
 * Surface Hold decision (the surface-level twin of the queue-lane hold). A Work View switch
 * that changes the host work unit re-settles config, so `model.ready` briefly drops to false.
 * Rather than replace the whole surface with a skeleton ("a skeleton replaces existing
 * layouts"), we HOLD the previously-established surface until the destination establishes:
 *  - `"cold"`  — first arrival, nothing to hold → the establish skeleton is correct;
 *  - `"held"`  — re-establishing after a prior surface → keep the prior surface visible;
 *  - `"live"`  — destination is ready → it is primary.
 * Same-host switches never drop `ready`, so they stay `"live"` (the queue-lane hold swaps rows
 * in place). This keeps loading INSIDE a surface, never a blank canvas between surfaces.
 */
export function resolveWorkUnitSurfaceRenderMode(input: {
    ready: boolean;
    hasPriorEstablished: boolean;
}): WorkUnitSurfaceRenderMode {
    if (input.ready) return "live";
    if (input.hasPriorEstablished) return "held";
    return "cold";
}

/** Minimal neutral skeleton while surface identity/config resolves (above-fold only). */
function WorkUnitSurfaceSkeleton() {
    return (
        <div aria-busy="true" aria-label="Loading work unit" className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2">
                    <span className="block h-7 w-[min(60%,18rem)] animate-pulse rounded bg-alloy-stone/40" aria-hidden />
                    <span className="block h-4 w-32 animate-pulse rounded bg-alloy-stone/30" aria-hidden />
                </div>
                <div className="flex gap-6">
                    {Array.from({ length: 3 }, (_, i) => (
                        <span
                            key={`wu-kpi-skeleton-${i}`}
                            className="block h-12 w-20 animate-pulse rounded bg-alloy-stone/25"
                            aria-hidden
                        />
                    ))}
                </div>
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

/**
 * The established Work Unit surface, rendered from ONE resolved model + intents. Pure
 * presentation — extracted so the surface can render either the live model or a held prior
 * model (Surface Hold) through the same body.
 */
function WorkUnitSurfaceBody({
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
    return (
        <>
            <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-1">
                <div className="shrink-0 space-y-1">
                    <WorkUnitHeader model={model.header} />
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
            {/* Page-level Create Lead modal host — stable, outside the command-rail
                floating menu, so its outside-click dismissal can't unmount the modal. */}
            <CreateLeadEventHost />
        </>
    );
}

export function WorkUnitSurface() {
    const { model, intents } = useWorkUnitSurfaceRuntime();

    // One-line deploy marker so the running build's SHA is visible in the console (staleness proof).
    useEffect(() => {
        // eslint-disable-next-line no-console
        console.info(`[alloy] WorkUnitSurface · build ${BUILD_SHA}`);
    }, []);

    // Reveal on the atomic composition (cold) OR on a retained composition seeded from the session
    // cache (return navigation). A seeded return shows its prior config + rows immediately — header
    // KPIs settle into their reserved slots without holding the boundary — so it never flashes the
    // cold skeleton just because OIP metrics are not yet warm.
    const revealReady = model.readiness.coldCompositionReady || model.readiness.retainedCompositionReady;

    // Surface Hold: remember the last-established model so a Work Unit re-establish (config
    // re-settle on a host change) can keep the prior surface visible instead of a full skeleton.
    const lastEstablishedRef = useRef<WorkUnitSurfaceModel | null>(null);
    if (revealReady) lastEstablishedRef.current = model;

    const mode = resolveWorkUnitSurfaceRenderMode({
        ready: revealReady,
        hasPriorEstablished: lastEstablishedRef.current != null,
    });
    const shownModel = mode === "live" ? model : lastEstablishedRef.current;

    const lastMarkedModeRef = useRef<WorkUnitSurfaceRenderMode | null>(null);
    useEffect(() => {
        if (lastMarkedModeRef.current === mode) return;
        lastMarkedModeRef.current = mode;
        const signal = mode === "held" ? "hold_start" : mode === "live" ? "reveal" : "intent";
        markPerceived("work_unit_establish", signal, {
            mode,
            work_unit_id: model.workUnitId ?? undefined,
        });
    }, [mode, model.workUnitId]);

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.workUnitSurface)}
            className="flex min-h-0 flex-1 flex-col"
            data-component="WorkUnitSurface"
            data-build-sha={BUILD_SHA}
            data-surface-ready={model.ready ? "true" : "false"}
            data-surface-mode={mode}
        >
            {mode === "cold" || !shownModel ? (
                <WorkUnitSurfaceSkeleton />
            ) : (
                // Keyed by the host work unit so a work-unit CHANGE remounts + establishes with
                // the `surface-enter` choreography (the Work Unit surface slides in FROM THE RIGHT
                // — drilling into detail), while a same-host view switch keeps the key stable (no
                // remount — the queue-lane hold swaps rows in place). While `"held"`, the prior
                // surface stays visible but yields focus: non-interactive + aria-busy until the
                // destination establishes. Loading stays inside the surface.
                <div
                    key={shownModel.workUnitId ?? "wu-surface"}
                    className={`motion-surface-enter-forward flex min-h-0 flex-1 flex-col gap-5 lg:flex-row lg:items-stretch${
                        mode === "held" ? " pointer-events-none" : ""
                    }`}
                    aria-busy={mode === "held" ? true : undefined}
                    data-surface-held={mode === "held" ? "true" : undefined}
                >
                    <WorkUnitSurfaceBody model={shownModel} intents={intents} />
                </div>
            )}
        </div>
    );
}
