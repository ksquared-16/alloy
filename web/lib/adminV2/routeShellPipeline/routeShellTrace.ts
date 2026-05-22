import { alloyPerfGet, alloyPerfSet } from "@/lib/perf/alloyPerfGlobal";

const PERF_PREFIX = "[perf.route.shell]";
const loadingOwnersByRoute = new Map<string, Set<string>>();

export type RouteShellTraceRoute = "workspace" | "department" | "work_unit";

function nowMs(): number {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function log(event: string, payload: Record<string, unknown>): void {
    if (typeof window === "undefined") return;
    console.info(PERF_PREFIX, { event, ...payload });
}

export function resetRouteShellTrace(route: RouteShellTraceRoute): void {
    loadingOwnersByRoute.set(route, new Set());
    alloyPerfSet(`route_${route}_shell_visible`, undefined);
    alloyPerfSet(`route_${route}_bootstrap_returned`, undefined);
    alloyPerfSet(`route_${route}_first_above_fold_stable`, undefined);
    alloyPerfSet(`route_${route}_hydration_complete`, undefined);
    alloyPerfSet(`route_${route}_post_shell_fetch_count`, 0);
}

export function markRouteShellVisible(route: RouteShellTraceRoute, extra?: Record<string, unknown>): void {
    const t = nowMs();
    alloyPerfSet(`route_${route}_shell_visible`, t);
    log("route_shell_visible_ms", { route, ms: Math.round(t), ...extra });
}

export function markRouteBootstrapReturned(route: RouteShellTraceRoute, extra?: Record<string, unknown>): void {
    const t = nowMs();
    alloyPerfSet(`route_${route}_bootstrap_returned`, t);
    const shellAt = alloyPerfGet(`route_${route}_shell_visible`);
    log("bootstrap_returned_ms", {
        route,
        ms: Math.round(t),
        since_shell_visible_ms: shellAt != null ? Math.round(t - Number(shellAt)) : null,
        ...extra,
    });
}

export function markRouteFirstAboveFoldStable(route: RouteShellTraceRoute, extra?: Record<string, unknown>): void {
    const t = nowMs();
    alloyPerfSet(`route_${route}_first_above_fold_stable`, t);
    log("first_above_fold_stable_ms", { route, ms: Math.round(t), ...extra });
}

export function markRouteHydrationComplete(route: RouteShellTraceRoute, extra?: Record<string, unknown>): void {
    const t = nowMs();
    alloyPerfSet(`route_${route}_hydration_complete`, t);
    log("hydration_complete_ms", { route, ms: Math.round(t), ...extra });
}

export function incrementRoutePostShellFetch(route: RouteShellTraceRoute, label: string): void {
    const key = `route_${route}_post_shell_fetch_count`;
    const n = Number(alloyPerfGet(key) ?? 0) + 1;
    alloyPerfSet(key, n);
    log("post_shell_fetch", { route, label, count: n });
}

/**
 * Detect two loaders claiming the same route (e.g. segment loading.tsx + page setLoading).
 */
export function registerRouteLoadingOwner(route: RouteShellTraceRoute, owner: string): void {
    const set = loadingOwnersByRoute.get(route) ?? new Set<string>();
    if (set.has(owner)) {
        log("duplicate_loading_owner_detected", { route, owner });
    }
    set.add(owner);
    loadingOwnersByRoute.set(route, set);
}

export function unregisterRouteLoadingOwner(route: RouteShellTraceRoute, owner: string): void {
    loadingOwnersByRoute.get(route)?.delete(owner);
}
