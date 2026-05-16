/**
 * Dev-only route/query write diagnostics for AdminV2 work-unit lane sync.
 * Enable: localStorage.setItem("alloy_route_debug", "1")
 * Disable: localStorage.removeItem("alloy_route_debug")
 */

export const ADMINV2_ROUTE_DEBUG_STORAGE_KEY = "alloy_route_debug";

export type AdminV2RouteWriteKind = "history.replaceState" | "router.push" | "router.replace" | "skipped";

export type AdminV2RouteWriteLog = {
    kind: AdminV2RouteWriteKind;
    caller: string;
    previousUrl: string;
    nextUrl: string;
    skipped: boolean;
    queueKey?: string | null;
    workUnitId?: string | null;
    deltaMs?: number;
    stack?: string;
};

let lastWriteAt = 0;

export function isAdminV2RouteDebugEnabled(): boolean {
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage.getItem(ADMINV2_ROUTE_DEBUG_STORAGE_KEY) === "1";
    } catch {
        return false;
    }
}

export function logAdminV2RouteWrite(entry: AdminV2RouteWriteLog): void {
    if (!isAdminV2RouteDebugEnabled()) return;
    const now = typeof performance !== "undefined" ? performance.now() : Date.now();
    const deltaMs = lastWriteAt > 0 ? Math.round(now - lastWriteAt) : undefined;
    lastWriteAt = now;
    const payload = { ...entry, deltaMs };
    console.info("[alloy_route_debug]", payload);
    if (entry.stack && isAdminV2RouteDebugEnabled()) {
        console.info("[alloy_route_debug] stack", entry.stack);
    }
}

export function captureRouteDebugStack(): string | undefined {
    if (!isAdminV2RouteDebugEnabled()) return undefined;
    try {
        const err = new Error();
        const lines = (err.stack ?? "").split("\n").slice(2, 8);
        return lines.join("\n").trim() || undefined;
    } catch {
        return undefined;
    }
}
