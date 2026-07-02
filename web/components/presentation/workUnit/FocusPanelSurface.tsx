"use client";

/**
 * Presentation Runtime V2 — FP.SURFACE.
 *
 * The SINGLE owner of "where does the Focus Panel open". The drawer internals render via
 * the existing global host (AdminEntityDrawer, mounted by AdminV2WorkspaceClientProviders)
 * — this component never mounts or imports them. It:
 *   (a) stamps the FP.SURFACE runtime label on a wrapper around its children,
 *   (b) provides `useFocusPanelOpen()` so queue rows open records through one seam, and
 *   (c) mirrors current drawer state as data attributes for acceptance/choreography.
 */

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAdminDrawerOptional } from "@/contexts/AdminDrawerContext";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

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

    const value = useMemo<FocusPanelOpenContextValue>(() => ({ openRecord }), [openRecord]);

    return (
        <div
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.focusPanelSurface)}
            data-focus-panel-open={isOpen ? "true" : "false"}
        >
            <FocusPanelOpenContext.Provider value={value}>{children}</FocusPanelOpenContext.Provider>
        </div>
    );
}
