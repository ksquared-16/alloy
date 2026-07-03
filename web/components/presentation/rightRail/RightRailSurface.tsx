"use client";

/**
 * Presentation Runtime V2 — RR.SURFACE.
 *
 * The right-rail shell — owns the single RR runtime label. Action content is a later
 * slice. With no children the rail has ZERO footprint: a hidden anchor keeps the
 * RR.SURFACE label in the DOM (single-ownership grep/spec still resolve exactly one
 * render site) but reserves no column — the main content fills the full width. With
 * children, the visible rail column renders.
 */

import type { ReactNode } from "react";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function RightRailSurface({ children }: { children?: ReactNode }) {
    if (children == null) {
        return (
            <aside
                hidden
                {...runtimeLabelProps(PRESENTATION_RUNTIME_LABELS.rightRailSurface)}
                aria-label="Actions"
                data-right-rail-empty="true"
            />
        );
    }

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
                <div className="mt-2 space-y-2">{children}</div>
            </div>
        </aside>
    );
}
