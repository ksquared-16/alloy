"use client";

import type { ReactNode } from "react";
import { oppInqLeadSummaryShellClassName } from "@/components/admin/drawer/opportunityInquiryDrawerTypography";

/** Pine-accent premium context panel — shared by Opportunity inquiry slots, Person, and Location drawers. */
export const RECORD_DRAWER_CONTEXT_PANEL_CLASS =
    "rounded-lg border border-alloy-stone/20 border-l-[3px] border-l-[rgb(0,162,131)] bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-alloy-stone/10";

type Props = {
    children: ReactNode;
    className?: string;
    "data-record-drawer-context"?: string;
    /** lead-summary: Opportunity inquiry summary shell; card: default bordered surface. */
    variant?: "card" | "lead-summary";
};

export default function RecordDrawerContextPanel({
    children,
    className,
    "data-record-drawer-context": dataRecordDrawerContext,
    variant = "card",
}: Props) {
    const surfaceClass = variant === "lead-summary" ? oppInqLeadSummaryShellClassName : RECORD_DRAWER_CONTEXT_PANEL_CLASS;

    return (
        <div
            className={[surfaceClass, className].filter(Boolean).join(" ")}
            data-record-drawer-context-panel="true"
            data-record-drawer-context={dataRecordDrawerContext}
            data-record-drawer-context-variant={variant}
        >
            {children}
        </div>
    );
}
