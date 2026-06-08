"use client";

import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

/**
 * Department route controlled loading — single calm surface until above-fold is ready.
 */
export function DeptPageLoadingGate({
    departmentTitle,
    className = "",
}: {
    departmentTitle: string;
    className?: string;
}) {
    const label = departmentTitle.trim() || "department";
    const title = `Loading ${label}…`;
    const description = "Preparing KPIs, work unit queues, needs attention, and actions…";

    return (
        <div
            className={`adminv2-ws-dept-route-loading px-1 py-6 min-h-[60vh] ${className}`.trim()}
            data-adminv2-dept-route-loading="true"
            data-dept-page-loading-gate
        >
            <AdminV2RouteLoadingState variant="department" title={title} description={description} showRibbon={false} />
        </div>
    );
}
