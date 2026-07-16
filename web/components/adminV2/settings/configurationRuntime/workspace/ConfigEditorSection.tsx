"use client";

import type { ReactNode } from "react";

/** Contained editor section — Identity / Capacity / Age / Schedule / Advanced. */
export function ConfigEditorSection({
    title,
    description,
    children,
    testId,
}: {
    title: string;
    description?: string;
    children: ReactNode;
    testId?: string;
}) {
    return (
        <section
            className="rounded-xl border border-alloy-forge/10 bg-white p-3"
            data-testid={testId}
        >
            <div className="mb-2.5 border-b border-alloy-forge/10 pb-2">
                <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
                {description ?
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{description}</p>
                :   null}
            </div>
            <div className="space-y-2.5">{children}</div>
        </section>
    );
}
