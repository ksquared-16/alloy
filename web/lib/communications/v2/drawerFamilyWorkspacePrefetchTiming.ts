/** Dev-only performance marks for Focus Panel Activity family-workspace warm load. */

export type DrawerFamilyWorkspaceTimingEvent =
    | "queue_row_click"
    | "row_selected"
    | "drawer_vm_ready"
    | "preview_vm_ready"
    | "prefetch_scheduled"
    | "prefetch_fetch_started"
    | "prefetch_fetch_done"
    | "activity_clicked"
    | "activity_mounted"
    | "workspace_mounted"
    | "warm_cache_hit"
    | "warm_cache_miss";

function shouldLogDrawerFamilyWorkspaceTiming(): boolean {
    return process.env.NODE_ENV !== "production";
}

export function markDrawerFamilyWorkspaceTiming(
    event: DrawerFamilyWorkspaceTimingEvent,
    detail?: Record<string, unknown>
): void {
    if (!shouldLogDrawerFamilyWorkspaceTiming()) return;
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
        performance.mark(`comms_family_workspace_${event}`);
    }
}
