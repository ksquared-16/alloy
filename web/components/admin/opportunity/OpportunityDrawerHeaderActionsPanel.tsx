"use client";

import type { ReactNode } from "react";

type Props = {
    children: ReactNode;
    inquiryWorkflow?: boolean;
    /** Header rail uses end alignment; inline slots (Review Assist) align start. */
    align?: "start" | "end";
    className?: string;
    "data-drawer-slot"?: string;
};

/**
 * Shared flex + bordered chrome for opportunity drawer record-header actions.
 * Schedule tour, Update status, Send enrollment packet, and Work with BOS render inside this shell.
 */
export function opportunityDrawerHeaderActionsPanelClassName(
    inquiryWorkflow: boolean,
    align: "start" | "end" = "end"
): string {
    const alignCls = align === "end" ? "justify-end" : "justify-start";
    const chrome = inquiryWorkflow
        ? "rounded-xl border border-admin-border/45 bg-white/80 px-3 py-2.5 shadow-sm ring-1 ring-alloy-stone/10"
        : "rounded-lg border border-admin-border/45 bg-white/70 px-2.5 py-1.5 shadow-sm";
    return `flex flex-wrap gap-2 items-center ${alignCls} ${chrome}`;
}

export default function OpportunityDrawerHeaderActionsPanel({
    children,
    inquiryWorkflow = false,
    align = "end",
    className,
    "data-drawer-slot": dataDrawerSlot,
}: Props) {
    return (
        <div
            className={[opportunityDrawerHeaderActionsPanelClassName(inquiryWorkflow, align), className]
                .filter(Boolean)
                .join(" ")}
            data-opportunity-record-actions={inquiryWorkflow ? "true" : undefined}
            data-drawer-slot={dataDrawerSlot}
        >
            {children}
        </div>
    );
}
