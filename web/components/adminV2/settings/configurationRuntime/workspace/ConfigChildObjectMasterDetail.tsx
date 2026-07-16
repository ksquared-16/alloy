"use client";

import type { ReactNode } from "react";

/**
 * Child-object master/detail as one continuous workspace — shared surface,
 * left rail + detail separated by a subtle vertical divider (not two cards).
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
            className="grid min-h-[22rem] gap-0 overflow-hidden rounded-xl border border-alloy-stone/25 bg-white lg:grid-cols-[13.5rem_minmax(0,1fr)]"
            data-testid={testId}
            data-config-surface="workspace"
        >
            <aside
                className="min-w-0 border-b border-alloy-stone/25 lg:border-b-0 lg:border-r lg:border-alloy-stone/25"
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
                <div className="divide-y divide-alloy-stone/18 border-t border-alloy-stone/20">{list}</div>
            </aside>
            <div className="min-w-0 px-4 py-3" data-testid={`${testId}-detail`}>
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
        <p className="text-sm leading-snug text-alloy-midnight/70" data-testid={testId}>
            {children}
        </p>
    );
}
