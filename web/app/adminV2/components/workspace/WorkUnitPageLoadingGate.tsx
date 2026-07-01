"use client";

import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

/**
 * Work-unit route controlled loading — single calm surface until above-fold is ready.
 * No section skeletons; pairs with {@link computeWorkUnitRevealGate}.
 */
export function WorkUnitPageLoadingGate({
    workUnitTitle,
    departmentTitle,
    className = "",
}: {
    workUnitTitle: string;
    departmentTitle?: string | null;
    className?: string;
}) {
    const label = workUnitTitle.trim() || "work unit";
    const title = `Loading ${label}…`;
    const description = departmentTitle?.trim()
        ? `Preparing ${label} in ${departmentTitle.trim()}…`
        : "Fetching queues, actions, and the first records for this lane…";

    return (
        <div
            className={`adminv2-ws-work-unit-route-loading px-1 py-6 min-h-[60vh] ${className}`.trim()}
            data-adminv2-wu-route-loading="true"
            data-work-unit-page-loading-gate
        >
            <AdminV2RouteLoadingState
                variant="work_unit"
                title={title}
                description={description}
                showRibbon={false}
            />
        </div>
    );
}
