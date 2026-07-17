"use client";

import type { ReactNode } from "react";

/**
 * Child-object page composition — supporting queue + primary detail region.
 * Detail owns the workspace; queue is navigation.
 * Canonical reference: Locations → Programs (Rooms and future children inherit).
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
            className="config-child-workspace grid items-start gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]"
            data-testid={testId}
            data-config-surface="workspace"
        >
            <aside
                className="config-child-workspace__list process-config-setup-card self-start overflow-hidden p-0"
                data-testid={`${testId}-list`}
            >
                <div className="config-child-workspace__list-header">
                    <div className="min-w-0 flex-1">
                        <h2 className="config-child-workspace__list-title">{listTitle}</h2>
                        {listSummary ?
                            <p className="config-child-workspace__list-summary">{listSummary}</p>
                        :   null}
                    </div>
                    {listActions ?
                        <div className="shrink-0">{listActions}</div>
                    :   null}
                </div>
                <div className="config-child-workspace__list-body">{list}</div>
            </aside>
            <div
                className="config-child-workspace__detail process-config-setup-card min-w-0 self-start px-5 py-5"
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
            className="rounded-md border border-alloy-bend-pine/15 bg-alloy-bend-pine/[0.04] px-3 py-2 text-sm leading-snug text-alloy-midnight/75"
            data-testid={testId}
        >
            {children}
        </p>
    );
}
