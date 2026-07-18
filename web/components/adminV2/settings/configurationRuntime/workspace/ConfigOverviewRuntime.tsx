"use client";

import type { ReactNode } from "react";

/**
 * Canonical Configuration Overview composition established by Locations:
 * glance + readiness, then Attention + owned capabilities.
 */
export function ConfigOverviewRuntime({
    glance,
    readiness,
    attention,
    capabilities,
    testId = "config-overview-runtime",
}: {
    glance: ReactNode;
    readiness: ReactNode;
    attention?: ReactNode;
    capabilities: ReactNode;
    testId?: string;
}) {
    return (
        <div className="flex flex-col gap-4 pb-2" data-testid={testId}>
            <div className="grid items-stretch gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                {glance}
                {readiness}
            </div>
            <div
                className={`grid items-stretch gap-4 ${attention ? "lg:grid-cols-2" : ""}`}
                data-testid={`${testId}-action-row`}
            >
                {attention}
                {capabilities}
            </div>
        </div>
    );
}
