"use client";

/**
 * Presentation Runtime V2 — FP.SURFACE.
 *
 * The SINGLE owner of "where does the Focus Panel open". On the Work Unit surface the
 * selected record renders INLINE — `InlineOpportunityFocusPanel` in the right column of
 * this region — never as the drawer/modal overlay (AdminEntityDrawer suppresses the modal
 * for opportunity subjects on work-unit paths). Selection state stays in
 * AdminDrawerContext; this component:
 *   (a) stamps the FP.SURFACE runtime label on the region root,
 *   (b) provides `useFocusPanelOpen()` so queue rows open records through one seam,
 *   (c) mirrors drawer state as `data-focus-panel-open` for acceptance/choreography, and
 *   (d) owns the queue↔panel two-column layout as a PERMANENT structure: the queue is
 *       always the FIXED-width left column and the Focus Panel is always the right region,
 *       so the operational model never collapses to a bare canvas. With a record selected
 *       the inline panel renders; otherwise a calm "Select a record to begin" placeholder
 *       holds the structure. Layout-only — no animated widths, no section that disappears.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { InlineOpportunityFocusPanel } from "./InlineOpportunityFocusPanel";

type FocusPanelOpenContextValue = {
    /** Open the Focus Panel for a queue row — the runtime's `intents.openRecord`. */
    openRecord: (row: QueueRowModel) => void;
    /** Warm a row's Focus Panel record VM on hover/focus — the runtime's `intents.prefetchRecord`. */
    prefetchRecord: (row: QueueRowModel) => void;
};

const FocusPanelOpenContext = createContext<FocusPanelOpenContextValue | null>(null);

/** Record-open seam for descendants of FocusPanelSurface (QueueRegion → CondensedQueueRow). */
export function useFocusPanelOpen(): FocusPanelOpenContextValue {
    const ctx = useContext(FocusPanelOpenContext);
    if (!ctx) {
        throw new Error("useFocusPanelOpen must be used within FocusPanelSurface");
    }
    return ctx;
}

/**
 * Stable Focus Panel empty state — holds the right column of the permanent structure when no
 * record is selected (queue empty, or the operator has not opened a record). Reserves height so
 * the layout does not jump when a record opens into it.
 */
function FocusPanelPlaceholder() {
    return (
        <section
            data-inline-focus-panel="empty"
            aria-label="Focus Panel"
            // Borderless: the FocusPanelSurface boundary owns the outer panel border in every state.
            className="flex min-h-[24rem] flex-col items-center justify-center gap-1.5 px-6 py-10 text-center"
        >
            <p className="text-sm font-medium text-alloy-midnight/55">Select a record to begin</p>
            <p className="text-xs text-alloy-midnight/40">The record you open appears here.</p>
        </section>
    );
}

export function FocusPanelSurface({
    openRecord,
    prefetchRecord,
    children,
}: {
    /** `intents.openRecord` from the Work Unit surface runtime. */
    openRecord: (row: QueueRowModel) => void;
    /** `intents.prefetchRecord` — hover/focus warm of the row's Focus Panel record VM. */
    prefetchRecord: (row: QueueRowModel) => void;
    children: ReactNode;
}) {
    const drawerCtx = useAdminDrawerOptional();
    const isOpen = drawerCtx != null && drawerCtx.drawer.type != null && drawerCtx.drawer.id != null;
    // The inline record region renders ONLY for opportunity subjects — other drawer types
    // (person/child contact cards, jobs, schedules) keep the global modal host.
    const inlineRecordSelected =
        drawerCtx != null &&
        drawerCtx.drawer.type === "opportunities" &&
        drawerCtx.drawer.id != null;

    const value = useMemo<FocusPanelOpenContextValue>(
        () => ({ openRecord, prefetchRecord }),
        [openRecord, prefetchRecord],
    );

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.focusPanelSurface)}
            data-alloy-section="FP.SURFACE"
            data-focus-panel-open={isOpen ? "true" : "false"}
        >
            <FocusPanelOpenContext.Provider value={value}>
                {/* Permanent two-column structure: fixed-width queue column on the left, the
                    Focus Panel region always on the right. Engages at xl; below that the queue
                    stacks above the panel so the composition never renders in a squeezed column.
                    The right column shows the inline record when selected, else the stable
                    placeholder — the structure itself never disappears. */}
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                    <div className="min-w-0 xl:w-[24rem] xl:shrink-0">{children}</div>
                    {/* The active Focus Panel render boundary OWNS the outer panel border — a single
                        unmistakable container in both the selected and empty states, never dependent
                        on a nested card's border. */}
                    <div
                        className="min-w-0 flex-1 overflow-hidden rounded-xl border border-alloy-midnight/20 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
                        data-focus-panel-boundary
                        data-component="FocusPanelSurface.boundary"
                        data-build-sha={BUILD_SHA}
                        data-focus-panel-state={inlineRecordSelected ? "record" : "empty"}
                    >
                        {inlineRecordSelected ? (
                            <InlineOpportunityFocusPanel />
                        ) : (
                            <FocusPanelPlaceholder />
                        )}
                    </div>
                </div>
            </FocusPanelOpenContext.Provider>
        </div>
    );
}
