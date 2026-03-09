"use client";

import { ReactNode } from "react";

/** List page header strip (Layer 3): title + metrics left, filter + CTA right. Brand-tinted surface. */
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
            className="rounded-xl border border-admin-border bg-alloy-pine/[0.08] px-6 py-4 mb-4 shadow-sm"
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
