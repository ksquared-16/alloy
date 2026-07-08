"use client";

import type { ReactNode } from "react";

/** Canonical parent surface for Digital Mailroom Work layout zones. */
export default function ProcessingParentPanel({
    title,
    children,
    className = "",
    headerAction,
    "data-testid": testId,
}: {
    title: string;
    children: ReactNode;
    className?: string;
    headerAction?: ReactNode;
    "data-testid"?: string;
}) {
    return (
        <section
            className={`flex min-h-0 flex-col overflow-hidden border border-alloy-stone/15 bg-white ${className}`}
            data-processing-parent-panel={title.toLowerCase().replace(/\s+/g, "-")}
            data-testid={testId}
        >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-alloy-stone/12 px-2 py-1">
                <h2 className="text-[9px] font-semibold uppercase tracking-[0.12em] text-alloy-midnight/45">{title}</h2>
                {headerAction}
            </header>
            <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
        </section>
    );
}
