"use client";

/**
 * Presentation Runtime V2 — FP.SURFACE.
 *
 * Adaptive Workspace corrective pass: queue stays a condensed selection rail beside the
 * Focus Panel through common laptop widths. Below the true two-pane floor the queue becomes
 * a temporary slide-over selector — never a permanent full-width stack above Focus.
 */

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from "react";
import { useOperationalSubject } from "./OperationalSubjectContext";
import type { QueueRowModel } from "@/lib/presentation/runtime";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";
import { BUILD_SHA } from "@/lib/runtime/buildInfo";
import { FocusPanelOpenContext, type FocusPanelOpenContextValue } from "./FocusPanelOpenContext";
import { InlineOpportunityFocusPanel } from "./InlineOpportunityFocusPanel";
import {
    deriveWorkUnitSelectionMode,
    type WorkUnitSelectionMode,
} from "@/lib/presentation/adaptiveWorkspacePresentation";
import { adaptiveRegionDomAttrs } from "@/lib/presentation/adaptiveWorkspaceRegions";

/*
 * The context and its hook moved to `FocusPanelOpenContext` so the QUEUE can import them without
 * importing this file — this one reaches `InlineOpportunityFocusPanel` and the whole card/drawer
 * graph. Re-exported here so existing importers (including the barrel) are unchanged.
 */
export { useFocusPanelOpen, type FocusPanelOpenContextValue } from "./FocusPanelOpenContext";

function FocusPanelPlaceholder() {
    return (
        <section
            data-inline-focus-panel="empty"
            aria-label="Focus Panel"
            className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 py-10 text-center"
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
    openRecord: (row: QueueRowModel) => void;
    prefetchRecord: (row: QueueRowModel) => void;
    children: ReactNode;
}) {
    const { subjectId } = useOperationalSubject();
    const isOpen = subjectId != null;
    const inlineRecordSelected = subjectId != null;

    const rootRef = useRef<HTMLDivElement | null>(null);
    const [selectionMode, setSelectionMode] = useState<WorkUnitSelectionMode>("rail");
    const [temporaryOpen, setTemporaryOpen] = useState(false);

    useEffect(() => {
        const el = rootRef.current;
        if (!el) return;
        const measure = () => {
            const next = deriveWorkUnitSelectionMode(el.getBoundingClientRect().width);
            setSelectionMode((prev) => (prev === next ? prev : next));
            if (next === "rail") setTemporaryOpen(false);
        };
        measure();
        const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
        ro?.observe(el);
        return () => ro?.disconnect();
    }, []);

    const closeTemporary = useCallback(() => setTemporaryOpen(false), []);

    const value = useMemo<FocusPanelOpenContextValue>(
        () => ({
            openRecord: (row) => {
                openRecord(row);
                setTemporaryOpen(false);
            },
            prefetchRecord,
        }),
        [openRecord, prefetchRecord],
    );

    const railMode = selectionMode === "rail";

    return (
        <div
            ref={rootRef}
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.focusPanelSurface)}
            className="relative flex min-h-0 flex-1 flex-col"
            data-alloy-section="FP.SURFACE"
            data-focus-panel-open={isOpen ? "true" : "false"}
            data-work-unit-selection-mode={selectionMode}
        >
            <FocusPanelOpenContext.Provider value={value}>
                {!railMode ? (
                    <div className="mb-2 flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            data-work-unit-queue-toggle
                            aria-expanded={temporaryOpen}
                            onClick={() => setTemporaryOpen((v) => !v)}
                            className="inline-flex items-center rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight/80 shadow-sm hover:bg-alloy-stone/5"
                        >
                            {temporaryOpen ? "Hide records" : "Show records"}
                        </button>
                    </div>
                ) : null}

                <div
                    className={
                        railMode
                            ? "flex min-h-0 flex-1 flex-row items-stretch gap-4"
                            : "flex min-h-0 flex-1 flex-row items-stretch"
                    }
                >
                    {railMode ? (
                        <div
                            data-adaptive-queue-column
                            {...adaptiveRegionDomAttrs("selection")}
                            className="flex min-h-0 min-w-0 shrink-0 flex-col"
                        >
                            {children}
                        </div>
                    ) : null}

                    <div
                        {...adaptiveRegionDomAttrs("primary")}
                        className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-midnight/20 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.05)]"
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

                {!railMode && temporaryOpen ? (
                    <>
                        <button
                            type="button"
                            aria-label="Dismiss record list"
                            className="absolute inset-0 z-[40] cursor-default bg-alloy-midnight/10"
                            onClick={closeTemporary}
                        />
                        <div
                            data-adaptive-queue-column
                            data-work-unit-queue-temporary="true"
                            {...adaptiveRegionDomAttrs("selection")}
                            className="absolute bottom-0 left-0 top-0 z-[41] flex w-[min(18rem,85%)] min-w-[14rem] flex-col border-r border-alloy-stone/25 bg-white shadow-[8px_0_24px_rgba(15,23,42,0.12)]"
                        >
                            {children}
                        </div>
                    </>
                ) : null}
            </FocusPanelOpenContext.Provider>
        </div>
    );
}
