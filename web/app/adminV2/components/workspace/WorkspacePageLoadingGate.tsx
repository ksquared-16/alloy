"use client";

import { AdminV2RouteLoadingState } from "@/components/admin/workspace/AdminV2RouteLoadingState";

/**
 * Workspace root controlled loading — single calm surface until above-fold is ready.
 */
export function WorkspacePageLoadingGate({
    orgName,
    className = "",
}: {
    orgName?: string | null;
    className?: string;
}) {
    const label = orgName?.trim() || "workspace";
    const title = `Loading ${label}…`;
    const description = "Preparing departments, counts, and orientation…";

    return (
        <div
            className={`adminv2-ws-workspace-route-loading px-1 py-6 ${className}`.trim()}
            data-adminv2-workspace-route-loading="true"
            data-workspace-page-loading-gate
        >
            <AdminV2RouteLoadingState variant="workspace" title={title} description={description} showRibbon={false} />
        </div>
    );
}
