"use client";

import type { ReactNode } from "react";

/**
 * Child-object page composition — narrow supporting queue + primary detail region.
 * Stone breathes between the two; detail owns the workspace.
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
            className="grid items-start gap-3 lg:grid-cols-[10.5rem_minmax(0,1fr)]"
            data-testid={testId}
            data-config-surface="workspace"
        >
            <aside
                className="process-config-setup-card self-start p-0"
                data-testid={`${testId}-list`}
            >
                <div className="flex items-start justify-between gap-2 px-2.5 py-2">
                    <div>
                        <p className="config-typo-queue-section-label">{listTitle}</p>
                        {listSummary ?
                            <p className="config-typo-sublabel mt-0.5">{listSummary}</p>
                        :   null}
                    </div>
                    {listActions}
                </div>
                <div className="space-y-0.5 px-1.5 pb-2">{list}</div>
            </aside>
            <div
                className="process-config-setup-card min-w-0 self-start px-5 py-4"
                data-testid={`${testId}-detail`}
            >
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
