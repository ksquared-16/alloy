"use client";

import type { ReactNode } from "react";

/** Pine-accent premium context panel — shared by Opportunity inquiry slots, Person, and Location drawers. */
export const RECORD_DRAWER_CONTEXT_PANEL_CLASS =
    "rounded-lg border border-alloy-stone/20 border-l-[3px] border-l-[rgb(0,162,131)] bg-white/90 px-3 py-2.5 shadow-sm ring-1 ring-alloy-stone/10";

type Props = {
    children: ReactNode;
    className?: string;
    "data-record-drawer-context"?: string;
};

export default function RecordDrawerContextPanel({
    children,
    className,
    "data-record-drawer-context": dataRecordDrawerContext,
}: Props) {
    return (
        <div
            className={[RECORD_DRAWER_CONTEXT_PANEL_CLASS, className].filter(Boolean).join(" ")}
            data-record-drawer-context-panel="true"
            data-record-drawer-context={dataRecordDrawerContext}
        >
            {children}
        </div>
    );
}
