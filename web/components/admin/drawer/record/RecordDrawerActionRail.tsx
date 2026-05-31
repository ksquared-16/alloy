"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

const BLUE_OUTLINE =
    "border border-alloy-blue/30 bg-alloy-blue/5 text-alloy-blue hover:bg-alloy-blue/10 hover:border-alloy-blue/45";

/** Class contract for record-header actions (Opportunity inquiry workflow + Person/Location). */
export function recordDrawerHeaderActionClassName(inquiryWorkflow: boolean): string {
    return inquiryWorkflow
        ? `px-4 py-2 text-[12px] font-semibold rounded-full ${BLUE_OUTLINE} disabled:opacity-50`
        : `px-3 py-1.5 text-sm font-semibold rounded-md ${BLUE_OUTLINE} disabled:opacity-50`;
}

/** @deprecated Use recordDrawerHeaderActionClassName — kept for Opportunity parity. */
export const opportunityDrawerHeaderActionClassName = recordDrawerHeaderActionClassName;

export const RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS = "flex flex-wrap gap-2 items-center";

/** @deprecated Use RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS — kept for Opportunity parity. */
export const OPPORTUNITY_DRAWER_HEADER_ACTIONS_ROW_CLASS = RECORD_DRAWER_HEADER_ACTIONS_ROW_CLASS;

export function recordDrawerHeaderActionsPanelClassName(
    inquiryWorkflow: boolean,
    align: "start" | "end" = "end",
    bare = false
): string {
    const alignCls = align === "end" ? "justify-end" : "justify-start";
    if (bare) {
        return `flex flex-nowrap items-center gap-2 ${alignCls}`;
    }
    const chrome = inquiryWorkflow
        ? "rounded-xl border border-admin-border/45 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-alloy-stone/10"
        : "rounded-lg border border-admin-border/45 bg-white/70 px-2.5 py-1.5 shadow-sm";
    return `flex flex-wrap gap-2 items-center ${alignCls} ${chrome}`;
}

/** @deprecated Use recordDrawerHeaderActionsPanelClassName — kept for Opportunity parity. */
export const opportunityDrawerHeaderActionsPanelClassName = recordDrawerHeaderActionsPanelClassName;

export type RecordDrawerHeaderActionButtonProps = Omit<
    ButtonHTMLAttributes<HTMLButtonElement>,
    "children" | "type"
> & {
    label: string;
    inquiryWorkflow?: boolean;
    busy?: boolean;
};

export function RecordDrawerHeaderActionButton({
    label,
    inquiryWorkflow = false,
    busy = false,
    disabled,
    className,
    ...rest
}: RecordDrawerHeaderActionButtonProps) {
    return (
        <button
            type="button"
            disabled={disabled}
            className={[recordDrawerHeaderActionClassName(inquiryWorkflow), className].filter(Boolean).join(" ")}
            data-record-drawer-header-action="true"
            {...rest}
        >
            {busy ? "…" : label}
        </button>
    );
}

type ActionRailProps = {
    children: ReactNode;
    inquiryWorkflow?: boolean;
    align?: "start" | "end";
    className?: string;
    /** When true, omit card chrome — inline header controls only. */
    bare?: boolean;
    "data-drawer-slot"?: string;
};

export function RecordDrawerActionRail({
    children,
    inquiryWorkflow = false,
    align = "end",
    className,
    bare = false,
    "data-drawer-slot": dataDrawerSlot,
}: ActionRailProps) {
    return (
        <div
            className={[recordDrawerHeaderActionsPanelClassName(inquiryWorkflow, align, bare), className]
                .filter(Boolean)
                .join(" ")}
            data-record-drawer-action-rail="true"
            data-opportunity-record-actions={inquiryWorkflow ? "true" : undefined}
            data-opportunity-header-controls-bare={bare ? "true" : undefined}
            data-drawer-slot={dataDrawerSlot}
        >
            {children}
        </div>
    );
}
