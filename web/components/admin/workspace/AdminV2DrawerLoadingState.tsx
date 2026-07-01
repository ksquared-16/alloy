import type { ReactNode } from "react";

import { BosExecutionLoader } from "@/components/admin/actions/BosExecutionLoader";

type DrawerLoadingDensity = "panel" | "inline" | "micro";
type DrawerLoadingTone = "default" | "record";

/**
 * Drawer-local BOS preparing surface — delegates to {@link BosExecutionLoader}.
 * No top ribbon (drawer provides chrome).
 */
export function AdminV2DrawerLoadingState({
    title,
    description,
    density = "panel",
    tone: _tone = "default",
    showTrack: _showTrack = true,
    children,
    className = "",
}: {
    title: string;
    description?: string;
    density?: DrawerLoadingDensity;
    /** Record drawer — stronger contrast on modal white. */
    tone?: DrawerLoadingTone;
    showTrack?: boolean;
    children?: ReactNode;
    className?: string;
}) {
    const variant = density === "inline" || density === "micro" ? "inline" : "drawer";
    return (
        <div
            className={`rounded-xl border border-alloy-stone/12 bg-gradient-to-b from-alloy-stone/[0.04] via-white to-alloy-stone/[0.03] shadow-sm ring-1 ring-alloy-stone/[0.06] ${
                density === "micro" ? "px-3 py-3" : density === "inline" ? "px-4 py-4" : "px-5 py-6"
            } ${className}`}
        >
            <BosExecutionLoader variant={variant} title={title} subtitle={description} data-testid="adminv2-drawer-loading-state" />
            {children ? <div className={density === "micro" ? "mt-0 min-w-0" : "mt-3 min-w-0"}>{children}</div> : null}
        </div>
    );
}
