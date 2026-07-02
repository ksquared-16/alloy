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
 *   (d) owns the queue↔panel two-column layout: with a record selected the queue
 *       (children) compresses to a bounded left column and the inline panel fills the
 *       right; with nothing selected the queue is the single full-width column. The
 *       column change is layout-only — no animated widths.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { InlineOpportunityFocusPanel } from "./InlineOpportunityFocusPanel";

type FocusPanelOpenContextValue = {
    /** Open the Focus Panel for a queue row — the runtime's `intents.openRecord`. */
    openRecord: (row: QueueRowModel) => void;
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

export function FocusPanelSurface({
    openRecord,
    children,
}: {
    /** `intents.openRecord` from the Work Unit surface runtime. */
    openRecord: (row: QueueRowModel) => void;
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

    const value = useMemo<FocusPanelOpenContextValue>(() => ({ openRecord }), [openRecord]);

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.focusPanelSurface)}
            data-focus-panel-open={isOpen ? "true" : "false"}
        >
            <FocusPanelOpenContext.Provider value={value}>
                {inlineRecordSelected ? (
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
                        <div className="min-w-0 xl:w-[40%] xl:min-w-[20rem] xl:max-w-[34rem] xl:shrink-0">
                            {children}
                        </div>
                        <div className="min-w-0 flex-1">
                            <InlineOpportunityFocusPanel />
                        </div>
                    </div>
                ) : (
                    children
                )}
            </FocusPanelOpenContext.Provider>
        </div>
    );
}
