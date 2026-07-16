"use client";

import type { ReactNode } from "react";

/**
 * Child-object master/detail — reusable pattern for Rooms, Programs, templates, etc.
 * List selects an object; detail answers what is configured / needs attention / next action
 * before exposing editors.
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
        <div className="grid gap-3 lg:grid-cols-[14rem_minmax(0,1fr)]" data-testid={testId}>
            <aside className="min-w-0 space-y-2" data-testid={`${testId}-list`}>
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="config-typo-queue-section-label">{listTitle}</p>
                        {listSummary ?
                            <p className="config-typo-sublabel mt-0.5">{listSummary}</p>
                        :   null}
                    </div>
                    {listActions}
                </div>
                <div className="space-y-1.5">{list}</div>
            </aside>
            <div className="min-w-0" data-testid={`${testId}-detail`}>
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
            className="rounded-md border border-[#00a283]/15 bg-[#00a283]/[0.04] px-2.5 py-1.5 text-xs text-alloy-midnight/75"
            data-testid={testId}
        >
            {children}
        </p>
    );
}
