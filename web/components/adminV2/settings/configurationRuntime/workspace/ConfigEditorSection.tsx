"use client";

import type { ReactNode } from "react";

/** Contained editor region — divider + title, not a nested floating card. */
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
        <section className="border-t border-alloy-stone/20 pt-3 first:border-t-0 first:pt-0" data-testid={testId}>
            <div className="mb-2">
                <h3 className="text-xs font-semibold text-alloy-midnight">{title}</h3>
                {description ?
                    <p className="mt-0.5 text-[11px] text-alloy-midnight/45">{description}</p>
                :   null}
            </div>
            <div className="space-y-2.5">{children}</div>
        </section>
    );
}
