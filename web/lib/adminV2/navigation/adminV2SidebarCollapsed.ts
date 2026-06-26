/** Durable preference key — preserved across idle logout (see `clearVolatileRuntimeSessionState`). */
export const ADMIN_V2_SIDEBAR_COLLAPSED_KEY = "alloy:v1:admV2:shell:sidebarCollapsed";

const STORAGE_KEY = ADMIN_V2_SIDEBAR_COLLAPSED_KEY;

/** Read persisted sidebar collapsed state (default expanded preference: collapsed true). */
export function readAdminV2SidebarCollapsed(): boolean | null {
    if (typeof window === "undefined") return null;
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        if (raw === "0") return false;
        if (raw === "1") return true;
        return null;
    } catch {
        return null;
    }
}

export function writeAdminV2SidebarCollapsed(collapsed: boolean): void {
    if (typeof window === "undefined") return;
    try {
        sessionStorage.setItem(STORAGE_KEY, collapsed ? "1" : "0");
    } catch {
        /* ignore quota */
    }
}
