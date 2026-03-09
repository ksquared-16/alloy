"use client";

import { ReactNode } from "react";

/** Subtle branded surface for admin list pages: title, subtitle, and toolbar in one cohesive header. */
const BORDER_SEP = "border-b border-alloy-stone/40";

interface AdminListPageHeaderProps {
    title: string;
    subtitle?: string | null;
    /** Left side of toolbar: search, filter trigger, etc. */
    toolbarLeft?: ReactNode;
    /** Right side of toolbar: primary action button(s) */
    toolbarRight?: ReactNode;
}

export default function AdminListPageHeader({
    title,
    subtitle,
    toolbarLeft,
    toolbarRight,
}: AdminListPageHeaderProps) {
    return (
        <header
            className={`rounded-t-xl bg-alloy-blue/[0.06] ${BORDER_SEP} px-6 py-5`}
            role="banner"
        >
            <h1 className="text-2xl font-bold tracking-tight text-alloy-midnight">
                {title}
            </h1>
            {subtitle != null && subtitle !== "" && (
                <p className="mt-1 text-sm text-alloy-muted">{subtitle}</p>
            )}
            {(toolbarLeft != null || toolbarRight != null) && (
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                        {toolbarLeft}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {toolbarRight}
                    </div>
                </div>
            )}
        </header>
    );
}
