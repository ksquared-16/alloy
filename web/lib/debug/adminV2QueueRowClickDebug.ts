/**
 * Dev-only queue row click diagnostics.
 * Enable: localStorage.setItem("alloy_queue_row_debug", "1")
 */

export const ADMINV2_QUEUE_ROW_DEBUG_KEY = "alloy_queue_row_debug";

export type AdminV2QueueRowClickLog = {
    phase: "queue_row_click" | "onAction" | "open_drawer" | "router_navigate" | "registry_action";
    itemId: string;
    actionId: string;
    queueId?: string;
    queueKey?: string | null;
    entityType?: string | null;
    handlerReached: string;
    defaultPrevented?: boolean;
    drawerCalled?: boolean;
    routerCalled?: boolean;
    registryKey?: string | null;
    extra?: Record<string, unknown>;
};

export function isAdminV2QueueRowDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    if (process.env.NODE_ENV === "development") return true;
    try {
        return window.localStorage.getItem(ADMINV2_QUEUE_ROW_DEBUG_KEY) === "1";
    } catch {
        return false;
    }
}

export function logAdminV2QueueRowClick(entry: AdminV2QueueRowClickLog): void {
    if (!isAdminV2QueueRowDebugEnabled()) return;
    console.info("[alloy_queue_row_debug]", {
        ...entry,
        pathname: typeof window !== "undefined" ? window.location.pathname : null,
        search: typeof window !== "undefined" ? window.location.search : null,
        ts: Date.now(),
    });
}
