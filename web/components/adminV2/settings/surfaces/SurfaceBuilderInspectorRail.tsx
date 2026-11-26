"use client";

/**
 * Collapsible right-rail configuration / inspector for Surface builders.
 * Default collapsed so the builder canvas owns the full workspace width.
 */

import { useState, type ReactNode } from "react";
import { PanelRightOpen, PanelRightClose } from "lucide-react";

export function SurfaceBuilderInspectorRail({
    children,
    defaultCollapsed = true,
    widthClassName = "w-[360px]",
    testId = "surface-builder-inspector-rail",
    "aria-label": ariaLabel = "Configuration panel",
}: {
    children: ReactNode;
    /** When true (default), the rail starts collapsed and the canvas fills the workspace. */
    defaultCollapsed?: boolean;
    widthClassName?: string;
    testId?: string;
    "aria-label"?: string;
}) {
    const [collapsed, setCollapsed] = useState(defaultCollapsed);

    if (collapsed) {
        return (
            <div
                className="flex w-10 shrink-0 flex-col items-center border-l border-alloy-stone/15 bg-white py-2"
                data-testid={testId}
                data-collapsed="true"
                data-surface-inspector-rail="collapsed"
            >
                <button
                    type="button"
                    onClick={() => setCollapsed(false)}
                    className="rounded-md p-2 text-alloy-midnight/55 hover:bg-alloy-stone/10 hover:text-alloy-midnight focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35"
                    aria-expanded={false}
                    aria-label={`Expand ${ariaLabel}`}
                    title={`Show ${ariaLabel}`}
                    data-testid={`${testId}-expand`}
                >
                    <PanelRightOpen className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
            </div>
        );
    }

    return (
        <div
            className={[
                "relative flex shrink-0 flex-col overflow-hidden border-l border-alloy-stone/15 bg-white",
                widthClassName,
            ].join(" ")}
            data-testid={testId}
            data-collapsed="false"
            data-surface-inspector-rail="expanded"
        >
            <div className="flex items-center justify-between gap-2 border-b border-alloy-stone/10 px-3 py-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-alloy-forge/55">
                    Configuration
                </p>
                <button
                    type="button"
                    onClick={() => setCollapsed(true)}
                    className="rounded-md p-1.5 text-alloy-midnight/55 hover:bg-alloy-stone/10 hover:text-alloy-midnight focus:outline-none focus-visible:ring-2 focus-visible:ring-alloy-bend-pine/35"
                    aria-expanded={true}
                    aria-label={`Collapse ${ariaLabel}`}
                    title={`Hide ${ariaLabel}`}
                    data-testid={`${testId}-collapse`}
                >
                    <PanelRightClose className="h-4 w-4" strokeWidth={2} aria-hidden />
                </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
        </div>
    );
}
