"use client";

/**
 * Presentation Runtime V2 — RR.SURFACE.
 *
 * The right-rail shell — owns the single RR runtime label and renders the "Actions (N)"
 * header + action content passed as children (the Work Unit surface supplies the resolved
 * configured actions via `WorkUnitRightRailActions`, which owns its own empty state so the
 * rail is a permanent part of the Work Unit structure). With NO children the rail keeps its
 * historical ZERO footprint: a hidden anchor keeps the RR.SURFACE label in the DOM
 * (single-ownership grep/spec still resolve exactly one render site) but reserves no column.
 */

import type { ReactNode } from "react";
import {
    PRESENTATION_RUNTIME_LABELS,
    runtimeLabelProps,
} from "@/components/presentation/runtimeLabels";

export function RightRailSurface({
    children,
    count = null,
}: {
    children?: ReactNode;
    /** Action count for the "Actions (N)" header; omit/0 → plain "Actions". */
    count?: number | null;
}) {
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
            // motion-reveal: the rail settles in when its actions resolve (progressive reveal,
            // reduced-motion collapses it to an opacity-only settle). Configured empty → the
            // hidden anchor branch above renders instead, so this never plays for an empty rail.
            className="motion-reveal w-full lg:w-72 lg:shrink-0"
        >
            <div className="rounded-lg border border-alloy-stone/18 bg-white px-3 py-3">
                <span className="block text-[10px] font-medium uppercase tracking-[0.1em] text-alloy-stone">
                    Actions{count != null && count > 0 ? ` (${count})` : ""}
                </span>
                <div className="mt-2 space-y-2">{children}</div>
            </div>
        </aside>
    );
}
