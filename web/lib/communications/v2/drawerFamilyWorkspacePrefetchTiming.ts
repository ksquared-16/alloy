/** Staging/local timing marks for Focus Panel Activity family-workspace warm load. */

export type DrawerFamilyWorkspaceTimingEvent =
    | "row_selected"
    | "drawer_vm_ready"
    | "prefetch_scheduled"
    | "prefetch_fetch_started"
    | "prefetch_fetch_done"
    | "activity_clicked"
    | "activity_mounted"
    | "workspace_mounted"
    | "warm_cache_hit"
    | "warm_cache_miss";

const ORIGIN_MS =
    typeof performance !== "undefined" && typeof performance.timeOrigin === "number"
        ? performance.timeOrigin
        : typeof Date !== "undefined"
          ? Date.now()
          : 0;

function elapsedMs(): number {
    if (typeof performance !== "undefined" && typeof performance.now === "function") {
        return Math.round(performance.now());
    }
    return Math.round(Date.now() - ORIGIN_MS);
}

function shouldLogDrawerFamilyWorkspaceTiming(): boolean {
    if (typeof window === "undefined") return process.env.NODE_ENV !== "production";
    return (
        process.env.NODE_ENV !== "production" ||
        /staging|localhost|127\.0\.0\.1/i.test(window.location.hostname)
    );
}

export function markDrawerFamilyWorkspaceTiming(
    event: DrawerFamilyWorkspaceTimingEvent,
    detail?: Record<string, unknown>
): void {
    if (!shouldLogDrawerFamilyWorkspaceTiming()) return;
    const payload = { event, ms: elapsedMs(), ...detail };
    if (typeof performance !== "undefined" && typeof performance.mark === "function") {
        performance.mark(`comms_family_workspace_${event}`);
    }
    if (typeof console !== "undefined" && typeof console.warn === "function") {
        console.warn("[perf.comms.family-workspace]", payload);
    }
}
