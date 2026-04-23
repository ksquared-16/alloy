"use client";

import type { ReactNode } from "react";

/**
 * Compact title row for AdminV2 Settings — no white “dashboard” card (replaces AdminPageHeader there).
 */
export default function SettingsPageHeader({
    title,
    subtitle,
    actions,
    className = "mb-4",
}: {
    title: string;
    subtitle?: string | null;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <div className={`flex flex-wrap items-end justify-between gap-3 ${className}`} role="banner">
            <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight text-alloy-midnight">{title}</h2>
                {subtitle ? <p className="mt-0.5 max-w-4xl text-xs leading-snug text-alloy-midnight/55">{subtitle}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
        </div>
    );
}
