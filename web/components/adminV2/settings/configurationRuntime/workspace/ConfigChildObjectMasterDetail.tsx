"use client";

import type { ReactNode } from "react";

/**
 * Child-object workspace — one white region on the stone canvas.
 * List selects; detail owns the working surface (not a second floating card).
 */
export function ConfigChildObjectMasterDetail({
    listTitle,
    listSummary,
    listActions,
    list,
    detail,
    testId = "config-child-master-detail",
}: {
    listTitle: string;
    listSummary?: string;
    listActions?: ReactNode;
    list: ReactNode;
    detail: ReactNode;
    testId?: string;
}) {
    return (
        <div
            className="process-config-setup-card grid min-h-[22rem] gap-0 overflow-hidden lg:grid-cols-[14rem_minmax(0,1fr)]"
            data-testid={testId}
            data-config-surface="workspace"
        >
            <aside
                className="min-w-0 border-b border-alloy-stone/25 bg-white lg:border-b-0 lg:border-r lg:border-alloy-stone/25"
                data-testid={`${testId}-list`}
            >
                <div className="flex items-start justify-between gap-2 px-3 py-2.5">
                    <div>
                        <p className="config-typo-queue-section-label">{listTitle}</p>
                        {listSummary ?
                            <p className="config-typo-sublabel mt-0.5">{listSummary}</p>
                        :   null}
                    </div>
                    {listActions}
                </div>
                <div className="space-y-1 px-2 pb-2.5">{list}</div>
            </aside>
            <div className="min-w-0 bg-white px-4 py-3.5" data-testid={`${testId}-detail`}>
                {detail}
            </div>
        </div>
    );
}

export function ConfigConsequenceLine({
    children,
    testId = "config-consequence-line",
}: {
    children: ReactNode;
    testId?: string;
}) {
    return (
        <p
            className="rounded-md border border-[#00a283]/12 bg-[#00a283]/[0.04] px-2.5 py-1.5 text-sm leading-snug text-alloy-midnight/75"
            data-testid={testId}
        >
            {children}
        </p>
    );
}
