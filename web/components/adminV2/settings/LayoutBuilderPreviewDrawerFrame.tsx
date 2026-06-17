"use client";

import type { ReactNode } from "react";
import { DRAWER_OVERVIEW_PANEL_SURFACE } from "@/lib/layout/runtime/drawerOverviewCompositionStandard";

const PREVIEW_LOCKED_SHELL_REGIONS = [
    { slot: "header", label: "Drawer header" },
    { slot: "lifecycle_rail_container", label: "Lifecycle rail" },
    { slot: "tabs_container", label: "Overview tabs" },
] as const;

type Props = {
    children: ReactNode;
};

/**
 * Preview-only drawer chrome — visual fidelity without platform internals noise.
 */
export default function LayoutBuilderPreviewDrawerFrame({ children }: Props) {
    return (
        <div
            className="overflow-hidden rounded-xl border border-alloy-stone/15 bg-[#F4F7FB] shadow-[0_2px_12px_rgba(24,39,58,0.06)]"
            data-testid="layout-builder-preview-drawer-frame"
        >
            <div className="border-b border-alloy-stone/10 bg-white px-4 py-3" data-testid="visual-editor-preview-shell">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <p className="text-[10px] font-medium uppercase tracking-wide text-alloy-midnight/40">Preview</p>
                        <h3 className="truncate text-base font-semibold text-alloy-midnight">Rivera Family — New inquiry</h3>
                        <p className="mt-0.5 text-xs text-alloy-midnight/50">Tour scheduled · Primary contact on file</p>
                    </div>
                    <span
                        slot="header"
                        className="sr-only"
                        data-testid="visual-editor-locked-shell-header"
                        data-visual-editor-locked="true"
                    >
                        Drawer header
                    </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-alloy-pine/10 px-2.5 py-0.5 text-[10px] font-medium text-alloy-pine">
                        Inquiry
                    </span>
                    <span className="rounded-full bg-alloy-stone/30 px-2.5 py-0.5 text-[10px] text-alloy-midnight/55">
                        Tour booked
                    </span>
                    <span
                        slot="lifecycle_rail_container"
                        className="sr-only"
                        data-testid="visual-editor-locked-shell-lifecycle_rail_container"
                        data-visual-editor-locked="true"
                    >
                        Lifecycle rail
                    </span>
                </div>
                <div className="mt-3 flex gap-4 border-b border-alloy-stone/10 pb-0">
                    <span className="border-b-2 border-alloy-pine px-1 pb-2 text-xs font-semibold text-alloy-midnight">
                        Overview
                    </span>
                    <span className="pb-2 text-xs text-alloy-midnight/40">Details</span>
                    <span className="pb-2 text-xs text-alloy-midnight/40">Activity</span>
                    <span
                        slot="tabs_container"
                        className="sr-only"
                        data-testid="visual-editor-locked-shell-tabs_container"
                        data-visual-editor-locked="true"
                    >
                        Overview tabs
                    </span>
                </div>
            </div>

            <div className={`${DRAWER_OVERVIEW_PANEL_SURFACE} m-3 min-h-[320px] bg-white p-1`}>{children}</div>
        </div>
    );
}

export { PREVIEW_LOCKED_SHELL_REGIONS };
