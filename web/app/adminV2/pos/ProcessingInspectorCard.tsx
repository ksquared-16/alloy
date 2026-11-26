"use client";

import type { ReactNode } from "react";

/** Compact Alloy card for Processing inspector / review panels. */
export default function ProcessingInspectorCard({
    title,
    subtitle,
    children,
    accent,
    testId,
}: {
    title: string;
    subtitle?: string;
    children: ReactNode;
    accent?: boolean;
    testId?: string;
}) {
    return (
        <section
            data-testid={testId}
            className={`rounded-xl border bg-white p-3.5 shadow-sm ${
                accent ? "border-alloy-bend-pine/25 ring-1 ring-alloy-bend-pine/10" : "border-alloy-stone/15"
            }`}
        >
            <header className="mb-3">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-alloy-midnight/45">{title}</h3>
                {subtitle ? <p className="mt-1 text-[11px] leading-snug text-alloy-midnight/50">{subtitle}</p> : null}
            </header>
            {children}
        </section>
    );
}
