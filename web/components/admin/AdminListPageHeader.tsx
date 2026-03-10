"use client";

import { ReactNode } from "react";

/** List page header: white card with accent border (dashboard-style). Title + metrics left, filter + CTA right. */
interface AdminListPageHeaderProps {
    title: string;
    /** Optional metrics: pills or counts on the same row as title */
    metrics?: ReactNode;
    /** Filter / search – right side */
    toolbarLeft?: ReactNode;
    /** Primary CTA – far right */
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
            className="rounded-xl border border-admin-border border-l-4 border-l-alloy-blue bg-admin-surface-card px-6 py-4 mb-3 shadow-sm"
            role="banner"
        >
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-3">
                    <h1 className="text-2xl font-bold tracking-tight text-alloy-forge">
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
