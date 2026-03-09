"use client";

import { ReactNode } from "react";

/** Single-row list page header: title (and optional metrics) left, filter + primary CTA right. Subtle branded surface. */
const BORDER_SEP = "border-b border-admin-border";

interface AdminListPageHeaderProps {
    title: string;
    /** Optional metrics: pills or counts shown after the title on the same row */
    metrics?: ReactNode;
    /** Filter button (and any search) – shown on the right */
    toolbarLeft?: ReactNode;
    /** Primary CTA button(s) – shown on the far right */
    toolbarRight?: ReactNode;
}

export default function AdminListPageHeader({
    title,
    metrics,
    toolbarLeft,
    toolbarRight,
}: AdminListPageHeaderProps) {
    const hasToolbar = toolbarLeft != null || toolbarRight != null;
    return (
        <header
            className={`rounded-t-xl bg-alloy-blue/[0.08] ${BORDER_SEP} px-6 py-4`}
            role="banner"
        >
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-alloy-midnight">
                        {title}
                    </h1>
                    {metrics}
                </div>
                {hasToolbar && (
                    <div className="flex flex-wrap items-center gap-2">
                        {toolbarLeft}
                        {toolbarRight}
                    </div>
                )}
            </div>
        </header>
    );
}
