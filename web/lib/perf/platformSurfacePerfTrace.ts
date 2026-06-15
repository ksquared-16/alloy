import { appendPlatformSurfacePerfEvent } from "@/lib/perf/platformSurfacePerfBuffer";
import { relayPlatformSurfacePerfEvents } from "@/lib/perf/platformSurfacePerfServerRelay";
import type { PlatformPerfSurface } from "@/lib/perf/platformSurfacePerfTypes";
import { perfDrawer, perfPrefetch, perfQueue, perfWorkUnit } from "@/lib/perf/perfNamespaceLog";

export { platformSurfacePerfServerLogEnabled } from "@/lib/perf/platformSurfacePerfServerRelay";

/** Dev-only platform stabilization timings — filter console: `[perf:work-unit]` / `[perf:drawer]`.
 *
 * Pass 2 trace scenarios (NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG=1 or localStorage):
 * - /workspace → /workspace/work-unit/new-leads: wu_slug_fetch_start / wu_slug_cache_hit / wu_bootstrap_warm_start
 * - queue ready: wu_queue_ready
 * - open drawer: queue_row_vm_warm_start, drawer_reveal
 * - linked swap: linked_person_vm_warm_start, drawer_reveal (hold via data-drawer-vm-transition-hold)
 *
 * Events persist in sessionStorage + `window.__alloyPlatformPerf.events()` even when DevTools clears console.
 * Enable Vercel relay: set PLATFORM_PERF_SERVER_LOG=1 on server + NEXT_PUBLIC_ALLOY_PLATFORM_PERF_SERVER_LOG=1
 * (or `__alloyPlatformPerf.enableServerLog()` in browser).
 */
export function platformSurfacePerfEnabled(): boolean {
    if (process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG === "1") return true;
    if (process.env.VITEST === "true") return true;
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage?.getItem("ALLOY_PLATFORM_PERF_DEBUG") === "1";
    } catch {
        return false;
    }
}

function currentPath(): string {
    if (typeof window === "undefined") return "";
    return window.location.pathname + window.location.search;
}

function emit(surface: PlatformPerfSurface, phase: string, payload: Record<string, unknown> = {}): void {
    if (!platformSurfacePerfEnabled()) return;
    const body = { layer: "platform_pass2", ...payload };
    if (surface === "route") perfWorkUnit(phase, body);
    else if (surface === "queue") perfQueue(phase, body);
    else if (surface === "drawer") perfDrawer(phase, body);
    else perfPrefetch(phase, body);

    const event = {
        ts: typeof performance !== "undefined" ? performance.now() : Date.now(),
        iso: new Date().toISOString(),
        surface,
        phase,
        payload: body,
        path: currentPath(),
    };
    appendPlatformSurfacePerfEvent(event);
    relayPlatformSurfacePerfEvents([event]);
}

export function tracePlatformRouteLoad(
    phase: string,
    payload: Record<string, unknown> = {},
): void {
    emit("route", phase, payload);
}

export function tracePlatformQueueHydrate(
    phase: string,
    payload: Record<string, unknown> = {},
): void {
    emit("queue", phase, payload);
}

export function tracePlatformDrawerVm(
    phase: string,
    payload: Record<string, unknown> = {},
): void {
    emit("drawer", phase, payload);
}

export function tracePlatformPrefetch(
    phase: string,
    payload: Record<string, unknown> = {},
): void {
    emit("prefetch", phase, payload);
}
