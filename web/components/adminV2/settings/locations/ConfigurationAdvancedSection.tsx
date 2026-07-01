"use client";

import type { ReactNode } from "react";

export default function ConfigurationAdvancedSection({
    children,
    testId = "configuration-advanced-section",
}: {
    children: ReactNode;
    testId?: string;
}) {
    return (
        <details className="rounded-lg border border-alloy-stone/30 bg-alloy-stone/[0.03]" data-testid={testId}>
            <summary className="cursor-pointer list-none px-3 py-2 config-typo-queue-section-label [&::-webkit-details-marker]:hidden">
                Advanced
            </summary>
            <div className="space-y-3 border-t border-alloy-stone/25 px-3 py-3">{children}</div>
        </details>
    );
}
