"use client";

import type { HTMLAttributes, ReactNode } from "react";
import type { CommunicationsModalTab } from "@/app/adminV2/communications/CommunicationsModalTabPanel";

/** Shared Alloy card + field styling for Communications modal workspaces. */
/** Bend Pine accent in product = alloy-juniper (#00A283). alloy-pine token is midnight-adjacent, not this green. */
export const COMMS_BEND_PINE_BTN_CLASS =
    "rounded-lg bg-alloy-juniper px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-alloy-juniper/90 disabled:opacity-50";
/** Workspace mode rail — subtle grouping; active tab reads as selected view, not a CTA. */
export const COMMS_TAB_RAIL_CLASS =
    "inline-flex flex-wrap items-center gap-0.5 rounded-lg bg-alloy-stone/[0.035] p-0.5 ring-1 ring-alloy-stone/10";
export const COMMS_BEND_PINE_ACTIVE_TAB_CLASS =
    "rounded-md bg-white px-3 py-1.5 text-xs font-semibold text-alloy-juniper shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-alloy-juniper/22";
export const COMMS_TAB_INACTIVE_CLASS =
    "rounded-md px-3 py-1.5 text-xs font-medium text-alloy-midnight/40 hover:bg-alloy-stone/[0.06] hover:text-alloy-midnight/58";
export const COMMS_KPI_STRIP_SURFACE_CLASS =
    "shrink-0 w-full border-b border-alloy-stone/12 bg-gradient-to-b from-alloy-stone/[0.05] to-white px-4 py-2";
export const COMMS_WORKSPACE_NAV_CLASS = "shrink-0 bg-white px-4 py-2.5";
export const COMMS_WORKSPACE_EXECUTION_CLASS =
    "flex min-h-0 flex-1 flex-col overflow-hidden p-3";
export const COMMS_EXECUTION_FRAME_CLASS =
    "flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-alloy-stone/20 bg-white shadow-[0_1px_4px_rgba(15,23,42,0.07)]";
export const COMMS_LIBRARY_RAIL_HEADER_CLASS =
    "shrink-0 border-b border-alloy-stone/25 bg-alloy-stone/[0.04] px-3 py-2.5";
export const COMMS_LIBRARY_ROW_SELECTED_CLASS =
    "border-alloy-juniper/45 border-l-[3px] border-l-alloy-juniper bg-alloy-juniper/[0.09] shadow-[0_1px_4px_rgba(0,162,131,0.1)] ring-1 ring-alloy-juniper/18";
export const COMMS_LIBRARY_ROW_CLASS =
    "mb-1 flex w-full flex-col items-start gap-0.5 rounded-lg border border-alloy-stone/18 bg-white px-2.5 py-2 text-left transition-colors hover:border-alloy-stone/28 hover:bg-alloy-stone/[0.05]";
export const COMMS_EMPTY_STATE_COMPACT_CLASS =
    "flex flex-col items-center justify-center rounded-xl border border-dashed border-alloy-stone/28 bg-alloy-stone/[0.02] px-4 py-8 text-center";
export const COMMS_CARD_CLASS =
    "rounded-xl border border-alloy-stone/28 bg-white p-3 shadow-[0_1px_3px_rgba(15,23,42,0.07)]";
export const COMMS_FIELD_LABEL_CLASS = "text-[11px] font-medium text-alloy-midnight/70";
/** Compact label→control gap for dense configuration headers. */
export const COMMS_FIELD_STACK_CLASS = "flex flex-col gap-1";
export const COMMS_INPUT_CLASS =
    "w-full rounded-lg border border-alloy-stone/35 bg-white px-2.5 py-1.5 text-[12px] text-alloy-midnight shadow-sm focus:border-alloy-juniper/45 focus:outline-none focus:ring-2 focus:ring-alloy-juniper/15";
export const COMMS_SELECT_CLASS = COMMS_INPUT_CLASS;
export const COMMS_SECTION_TITLE_CLASS = "text-[11px] font-semibold tracking-wide text-alloy-midnight/85";
export const COMMS_SECTION_HELPER_CLASS = "mt-0.5 text-[10px] leading-snug text-alloy-midnight/50";
export const COMMS_PRIMARY_BTN_CLASS = COMMS_BEND_PINE_BTN_CLASS;
export const COMMS_SECONDARY_BTN_CLASS =
    "rounded-lg border border-alloy-stone/30 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/8 disabled:opacity-50";
export const COMMS_OUTLINE_ACCENT_BTN_CLASS =
    "rounded-lg border border-alloy-juniper/40 bg-white px-3 py-1.5 text-xs font-medium text-alloy-juniper shadow-sm hover:bg-alloy-juniper/5 disabled:opacity-50";
export const COMMS_DESTRUCTIVE_BTN_CLASS =
    "rounded-lg border border-alloy-stone/30 bg-white px-3 py-1.5 text-xs font-medium text-alloy-midnight/70 shadow-sm hover:bg-alloy-stone/8 disabled:opacity-50";
/** Queue-style Filters toggle for library rails. */
export const COMMS_FILTERS_TOGGLE_CLASS =
    "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-alloy-stone/35 bg-white px-2.5 py-1.5 text-[12px] font-semibold text-alloy-midnight/70 shadow-sm transition-colors hover:border-alloy-juniper/40 hover:text-alloy-juniper";
export const COMMS_FILTERS_TOGGLE_ACTIVE_CLASS =
    "inline-flex shrink-0 items-center gap-1.5 rounded-md border border-alloy-juniper/50 bg-alloy-juniper/10 px-2.5 py-1.5 text-[12px] font-semibold text-alloy-juniper shadow-sm";

/** Level B — section / panel shells */
export const COMMS_PANEL_SHELL_CLASS =
    "rounded-xl border border-alloy-stone/28 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.07)]";
/** Level C — nested utility / preview blocks */
export const COMMS_UTILITY_CARD_CLASS = "rounded-lg border border-alloy-stone/22 bg-alloy-stone/[0.03] px-2.5 py-2";
export const COMMS_EMPTY_STATE_CLASS = `${COMMS_EMPTY_STATE_COMPACT_CLASS} min-h-[10rem] text-[12px] text-alloy-midnight/55`;
export const COMMS_EMPTY_STATE_DASHED_CLASS = `${COMMS_EMPTY_STATE_COMPACT_CLASS} min-h-[10rem] text-[12px] text-alloy-midnight/55`;

export const COMMS_ACCENT_TEXT_CLASS = "text-alloy-juniper";
export const COMMS_ACCENT_BG_SUBTLE_CLASS = "bg-alloy-juniper/10";
export const COMMS_ACCENT_BORDER_CLASS = "border-alloy-juniper/35";
export const COMMS_LIST_ROW_SELECTED_CLASS =
    "border-alloy-juniper/35 border-l-alloy-juniper bg-alloy-juniper/10 shadow-[0_2px_8px_rgba(0,162,131,0.14)] ring-1 ring-alloy-juniper/20";
export const COMMS_CHIP_SELECTED_CLASS = "bg-alloy-juniper text-white";
export const COMMS_CHIP_UNSELECTED_CLASS = "bg-alloy-juniper/10 text-alloy-juniper ring-1 ring-alloy-juniper/50";
export const COMMS_FILTER_INPUT_CLASS =
    "rounded-md border border-alloy-stone/20 bg-white px-2 py-1 text-[11px] text-alloy-midnight shadow-sm focus:outline-none focus:ring-1 focus:ring-alloy-juniper/30";
export const COMMS_COMPACT_LABEL_CLASS = COMMS_FIELD_LABEL_CLASS;
export const COMMS_ERROR_BANNER_CLASS = "rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700";
/** Muted panel / timeline canvas background */
export const COMMS_SURFACE_MUTED_CLASS = "bg-alloy-stone/[0.03]";
export const COMMS_NOTE_BANNER_CLASS =
    "rounded-lg border border-alloy-amber/35 bg-alloy-amber/10 px-3 py-1.5 text-[11px] text-alloy-amber";
export const COMMS_OUTBOUND_BUBBLE_CLASS = "rounded-tr-sm bg-alloy-juniper/10 text-alloy-midnight";
export const COMMS_OUTLINE_ACCENT_SOFT_BTN_CLASS =
    "inline-flex shrink-0 items-center gap-1 rounded-lg border border-alloy-juniper/40 bg-alloy-juniper/10 px-2.5 py-2 text-sm font-semibold text-alloy-juniper shadow-sm hover:bg-alloy-juniper/15";

/** Activity embed — unified operator action buttons (Send, Later, BOS). */
export const COMMS_ACTIVITY_BTN_BASE =
    "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-xs disabled:opacity-40";
export const COMMS_ACTIVITY_PRIMARY_BTN_CLASS =
    `${COMMS_ACTIVITY_BTN_BASE} bg-alloy-juniper font-semibold text-white shadow-sm hover:bg-alloy-juniper/90`;
export const COMMS_ACTIVITY_SECONDARY_BTN_CLASS =
    `${COMMS_ACTIVITY_BTN_BASE} border border-alloy-stone/25 bg-white font-medium text-alloy-midnight/75 shadow-sm hover:bg-alloy-stone/8`;

/** Matches Focus Panel header BOS control (outline Bend Pine, compact height). */
export const COMMS_BOS_HEADER_BTN_CLASS =
    `${COMMS_ACTIVITY_SECONDARY_BTN_CLASS} min-w-[4.5rem]`;

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

/** Compact reserve for Focus Panel Activity embed — structure visible, not a large blank block. */
export function CommsActivityEmbedLoadingShell({ label = "Loading communications…" }: { label?: string }) {
    return (
        <div
            className="flex min-h-0 flex-col gap-2 p-3"
            data-comms-activity-embed-loading-shell="true"
            aria-busy="true"
            aria-label={label}
        >
            <div className="flex gap-1">
                <div className="h-6 w-12 animate-pulse rounded-md bg-alloy-stone/[0.08]" aria-hidden />
                <div className="h-6 w-10 animate-pulse rounded-md bg-alloy-stone/[0.06]" aria-hidden />
            </div>
            <div className="h-7 w-full animate-pulse rounded-md border border-alloy-stone/10 bg-alloy-stone/[0.04]" aria-hidden />
            <div className="h-16 animate-pulse rounded-lg border border-alloy-stone/10 bg-alloy-stone/[0.03]" aria-hidden />
        </div>
    );
}

/**
 * Real communications chrome while family-workspace VM hydrates — header, mode tabs, empty copy,
 * compact loader in the message area (not a large blank card).
 */
export function CommsActivityEmbedHydratingShell({
    joining = true,
    label = "Loading conversation…",
}: {
    joining?: boolean;
    label?: string;
}) {
    return (
        <div
            className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-alloy-stone/15 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.05)]"
            data-comms-activity-embed-hydrating-shell="true"
            aria-busy={joining}
            aria-label={joining ? label : "Communications"}
        >
            <div className={`${COMMS_WORKSPACE_NAV_CLASS} border-b border-alloy-stone/12`}>
                <div className={COMMS_TAB_RAIL_CLASS} role="tablist" aria-label="Communication mode">
                    <span className={COMMS_BEND_PINE_ACTIVE_TAB_CLASS} aria-current="true">
                        Email
                    </span>
                    <span className={`${COMMS_TAB_INACTIVE_CLASS} opacity-70`} aria-disabled="true">
                        SMS
                    </span>
                </div>
            </div>
            <div className={`${COMMS_WORKSPACE_EXECUTION_CLASS} min-h-[10rem]`}>
                <div className={`${COMMS_EXECUTION_FRAME_CLASS} min-h-[8rem]`}>
                    <div className="flex min-h-[7rem] flex-1 flex-col items-center justify-center gap-2 px-4 py-6 text-center">
                        <p className="text-[13px] font-medium text-alloy-midnight/72">No communication yet</p>
                        <p className="max-w-[18rem] text-[11px] leading-snug text-alloy-midnight/48">
                            Message history and compose will appear here once this record loads.
                        </p>
                        {joining ? (
                            <div
                                className="mt-1 inline-flex items-center gap-2 text-[11px] text-alloy-midnight/55"
                                data-comms-activity-inline-loader="true"
                            >
                                <span
                                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-alloy-stone/25 border-t-alloy-juniper"
                                    aria-hidden
                                />
                                {label}
                            </div>
                        ) : null}
                    </div>
                </div>
            </div>
        </div>
    );
}

/** Compact inline reserve for compose / preview panels */
export function CommsInlineListReserve({ rows = 2, label = "Loading content" }: { rows?: number; label?: string }) {
    return (
        <div className="mt-2 flex flex-col gap-1.5" aria-busy="true" aria-label={label}>
            {Array.from({ length: rows }, (_, i) => (
                <div
                    key={i}
                    className="h-6 animate-pulse rounded-md border border-alloy-stone/10 bg-alloy-stone/[0.06]"
                    aria-hidden
                />
            ))}
        </div>
    );
}

export function CommsSectionCard({
    title,
    helper,
    children,
    className,
    headerClassName,
    bodyClassName,
    dense = false,
    ...rest
}: {
    title: string;
    helper?: string;
    children: ReactNode;
    className?: string;
    /** Optional override for the title band (e.g. padded flush cards). */
    headerClassName?: string;
    /** Optional override for the body wrapper — use `min-h-0 flex-1` for scroll owners. */
    bodyClassName?: string;
    /** Tighter title/body gaps for configuration headers. */
    dense?: boolean;
} & HTMLAttributes<HTMLDivElement>) {
    return (
        <div {...rest} className={`${COMMS_CARD_CLASS} ${className ?? ""}`}>
            <div
                className={
                    headerClassName ??
                    `shrink-0 border-b border-alloy-stone/22 ${dense ? "mb-0 px-0 pb-1.5" : "mb-2 pb-2"}`
                }
            >
                <div className={COMMS_SECTION_TITLE_CLASS}>{title}</div>
                {helper ? <p className={COMMS_SECTION_HELPER_CLASS}>{helper}</p> : null}
            </div>
            <div className={`flex flex-col ${dense ? "gap-1.5" : "gap-2.5"} ${bodyClassName ?? ""}`}>
                {children}
            </div>
        </div>
    );
}
