"use client";

import type { ReactNode } from "react";

export type LeadOperatingCardAccent = "attention" | "work" | "neutral" | "muted";

type Props = {
    title: string;
    icon: ReactNode;
    accent?: LeadOperatingCardAccent;
    minimized?: boolean;
    widgetKey?: string;
    children: ReactNode;
};

const ACCENT_RAIL: Record<LeadOperatingCardAccent, string> = {
    attention: "border-l-alloy-ember/75",
    work: "border-l-alloy-juniper/70",
    neutral: "border-l-alloy-stone/25",
    muted: "border-l-alloy-stone/15",
};

/** Premium operating summary card for Lead drawer top strip. */
export default function LeadOperatingSummaryCard({
    title,
    icon,
    accent = "neutral",
    minimized = false,
    widgetKey,
    children,
}: Props) {
    const railAccent = ACCENT_RAIL[accent];
    return (
        <div
            className={`flex h-full min-h-[4.25rem] flex-col overflow-hidden rounded-xl border border-alloy-stone/12 border-l-[3px] ${railAccent} bg-white shadow-[0_1px_4px_rgba(24,39,58,0.05)]`}
            data-lead-operating-summary-card="true"
            data-layout-runtime-summary-widget="true"
            {...(widgetKey ? { "data-lead-operating-summary-card-key": widgetKey } : {})}
            {...(minimized ? { "data-lead-operating-summary-card-minimized": "true" } : {})}
        >
            <div className="flex items-center gap-2 border-b border-alloy-stone/8 px-2.5 py-1.5">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border border-alloy-stone/10 bg-alloy-juniper/[0.08] text-alloy-juniper/80">
                    {icon}
                </div>
                <span className="truncate text-[10px] font-semibold uppercase tracking-[0.07em] text-alloy-midnight/55">
                    {title}
                </span>
            </div>
            <div className="flex min-h-0 flex-1 flex-col px-2.5 py-2">{children}</div>
        </div>
    );
}
