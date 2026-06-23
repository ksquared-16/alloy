"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { WorkspaceQuietKpiReserve } from "@/components/admin/workspace/WorkspaceQuietLoadingReserve";
import { oipKpiCommandSurfaceClass } from "@/lib/metrics/oipKpiCardVisualSystem";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";

/** Shared Alloy card + field styling for Communications modal workspaces. */
/** Bend Pine accent in product = alloy-juniper (#00A283). alloy-pine token is midnight-adjacent, not this green. */
export const COMMS_BEND_PINE_BTN_CLASS =
    "rounded-lg bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-juniper/90 disabled:opacity-50";
export const COMMS_BEND_PINE_ACTIVE_TAB_CLASS =
    "rounded-lg border border-alloy-juniper/35 bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white shadow-[0_4px_12px_rgba(0,162,131,0.22)]";
export const COMMS_CARD_CLASS =
    "rounded-xl border border-alloy-stone/20 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.06)]";
export const COMMS_FIELD_LABEL_CLASS = "text-[11px] font-medium text-alloy-midnight/70";
export const COMMS_INPUT_CLASS =
    "w-full rounded-lg border border-alloy-stone/25 bg-white px-2.5 py-2 text-[12px] text-alloy-midnight shadow-sm focus:border-alloy-juniper/40 focus:outline-none focus:ring-2 focus:ring-alloy-juniper/15";
export const COMMS_SELECT_CLASS = COMMS_INPUT_CLASS;
export const COMMS_SECTION_TITLE_CLASS = "text-[11px] font-semibold tracking-wide text-alloy-midnight/85";
export const COMMS_SECTION_HELPER_CLASS = "mt-0.5 text-[10px] leading-snug text-alloy-midnight/50";
export const COMMS_PRIMARY_BTN_CLASS = COMMS_BEND_PINE_BTN_CLASS;
export const COMMS_SECONDARY_BTN_CLASS =
    "rounded-lg border border-alloy-stone/25 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/8 disabled:opacity-50";

const COMMS_LIST_RESERVE_ROW_COUNT = 5;

/** Quiet reserve for library list columns while warm data is unresolved. */
export function CommsLibraryListReserve({ label = "Loading library…" }: { label?: string }) {
    return (
        <div
            className="flex flex-col gap-2 p-2"
            data-comms-library-list-reserve="true"
            aria-busy="true"
            aria-label={label}
        >
            {Array.from({ length: COMMS_LIST_RESERVE_ROW_COUNT }, (_, i) => (
                <div
                    key={i}
                    className="h-10 animate-pulse rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.06]"
                    aria-hidden
                />
            ))}
        </div>
    );
}

/** Quiet reserve for Command Center queue lane while conversations are unresolved. */
export function CommsQueueListReserve() {
    return (
        <div
            className="flex flex-col gap-2 px-2.5 py-2.5"
            data-comms-queue-list-reserve="true"
            aria-busy="true"
            aria-label="Loading communication queue"
        >
            {Array.from({ length: COMMS_LIST_RESERVE_ROW_COUNT }, (_, i) => (
                <div
                    key={i}
                    className="h-[4.5rem] animate-pulse rounded-xl border border-alloy-stone/10 bg-alloy-stone/[0.05]"
                    aria-hidden
                />
            ))}
        </div>
    );
}

/** Reserve for family workspace panel while first conversation hydrates. */
export function CommsWorkspacePanelReserve({ label = "Loading conversation…" }: { label?: string }) {
    return (
        <div
            className="flex min-h-[12rem] flex-1 flex-col gap-3 p-4"
            data-comms-workspace-panel-reserve="true"
            aria-busy="true"
            aria-label={label}
        >
            <div className="h-8 w-2/5 max-w-xs animate-pulse rounded-lg bg-alloy-stone/[0.08]" aria-hidden />
            <div className="min-h-[8rem] flex-1 animate-pulse rounded-xl border border-alloy-stone/10 bg-alloy-stone/[0.04]" aria-hidden />
            <div className="h-24 animate-pulse rounded-xl border border-alloy-stone/10 bg-alloy-stone/[0.04]" aria-hidden />
        </div>
    );
}

/** Layer 2 KPI reserve — stable band for non-inbox tabs; inbox uses Command Center metrics for now. */
export function CommsWorkspaceKpiBand({ activeTab }: { activeTab: CommunicationsModalTab }) {
    if (activeTab === "inbox") {
        return null;
    }
    return (
        <div className={oipKpiCommandSurfaceClass()} data-comms-workspace-kpi-band="true">
            <div className="px-3 py-2">
                <WorkspaceQuietKpiReserve id="comms-workspace-kpi-reserve" />
            </div>
        </div>
    );
}

export function CommsSectionCard({
    title,
    helper,
    children,
    className,
    ...rest
}: {
    title: string;
    helper?: string;
    children: ReactNode;
    className?: string;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div {...rest} className={`${COMMS_CARD_CLASS} ${className ?? ""}`}>
            <div className="mb-3 border-b border-alloy-stone/12 pb-2">
                <div className={COMMS_SECTION_TITLE_CLASS}>{title}</div>
                {helper ? <p className={COMMS_SECTION_HELPER_CLASS}>{helper}</p> : null}
            </div>
            <div className="flex flex-col gap-3">{children}</div>
        </div>
    );
}
