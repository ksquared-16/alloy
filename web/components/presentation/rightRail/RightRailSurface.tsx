"use client";

/**
 * Presentation Runtime V2 — RR.SURFACE.
 *
 * The right-rail shell — owns the single RR runtime label. Action content is a later
 * slice; for now the shell renders children when provided, otherwise a quiet empty state.
 */

import type { ReactNode } from "react";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function RightRailSurface({ children }: { children?: ReactNode }) {
    return (
        <aside
            {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.rightRailSurface)}
            aria-label="Actions"
            className="w-full lg:w-72 lg:shrink-0"
        >
            <div className="rounded-lg border border-alloy-stone/18 bg-white px-3 py-3">
                <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                    Actions
                </span>
                {children != null ? (
                    <div className="mt-2 space-y-2">{children}</div>
                ) : (
                    <p className="mt-2 text-sm text-alloy-midnight/60">No actions for this view</p>
                )}
            </div>
        </aside>
    );
}
