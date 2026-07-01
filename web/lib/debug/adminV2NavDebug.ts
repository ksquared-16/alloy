/**
 * Dev-only AdminV2 navigation diagnostics.
 * Enable: localStorage.setItem("alloy_nav_debug", "1")
 */

export const ADMINV2_NAV_DEBUG_STORAGE_KEY = "alloy_nav_debug";

export function isAdminV2NavDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(ADMINV2_NAV_DEBUG_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export type AdminV2NavDebugPayload = {
    event: string;
    source?: string;
    pathname?: string;
    search?: string;
    clickedHref?: string | null;
    routerAction?: string | null;
    selectedQueueKeyBefore?: string | null;
    selectedQueueKeyAfter?: string | null;
    overwrite?: boolean;
    [key: string]: unknown;
};

export function logAdminV2NavDebug(payload: AdminV2NavDebugPayload): void {
    if (!isAdminV2NavDebugEnabled()) return;
    const pathname = typeof window !== "undefined" ? window.location.pathname : undefined;
    const search = typeof window !== "undefined" ? window.location.search : undefined;
    console.info("[alloy_nav_debug]", {
        ...payload,
        pathname: payload.pathname ?? pathname,
        search: payload.search ?? search,
        ts: Date.now(),
    });
}
