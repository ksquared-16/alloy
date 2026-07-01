/**
 * Dev-only detector for repeated same-URL navigation/RSC churn.
 * Enable: localStorage.setItem("alloy_route_churn_guard", "1")
 */

export const ADMINV2_ROUTE_CHURN_GUARD_KEY = "alloy_route_churn_guard";

const WINDOW_MS = 2000;
const THRESHOLD = 2;

type Attempt = { key: string; t: number; source: string };

let attempts: Attempt[] = [];

export function isAdminV2RouteChurnGuardEnabled(): boolean {
    if (typeof window === "undefined") return false;
    if (process.env.NODE_ENV === "development") return true;
    try {
        return window.localStorage.getItem(ADMINV2_ROUTE_CHURN_GUARD_KEY) === "1";
    } catch {
        return false;
    }
}

/** Record a route/RSC-related event for the current pathname + search. */
export function recordAdminV2RouteChurnAttempt(source: string, urlKey?: string): void {
    if (!isAdminV2RouteChurnGuardEnabled()) return;
    if (typeof window === "undefined") return;
    const key = urlKey ?? `${window.location.pathname}${window.location.search}`;
    const now = Date.now();
    attempts = attempts.filter((a) => now - a.t < WINDOW_MS);
    attempts.push({ key, t: now, source });
    const same = attempts.filter((a) => a.key === key);
    if (same.length > THRESHOLD) {
        console.warn("[adminv2_route_churn]", {
            urlKey: key,
            count: same.length,
            windowMs: WINDOW_MS,
            sources: same.map((s) => s.source),
        });
    }
}
