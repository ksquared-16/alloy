import { perfDrawer, perfPrefetch, perfQueue, perfWorkUnit } from "@/lib/perf/perfNamespaceLog";

/** Dev-only platform stabilization timings — filter console: `[perf:work-unit]` / `[perf:drawer]`. */
export function platformSurfacePerfEnabled(): boolean {
    return (
        process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_DEBUG === "1" ||
        process.env.VITEST === "true"
    );
}

type PlatformPerfSurface = "route" | "queue" | "drawer" | "prefetch";

function emit(surface: PlatformPerfSurface, phase: string, payload: Record<string, unknown> = {}): void {
    if (!platformSurfacePerfEnabled()) return;
    const body = { layer: "platform_pass1", ...payload };
    if (surface === "route") perfWorkUnit(phase, body);
    else if (surface === "queue") perfQueue(phase, body);
    else if (surface === "drawer") perfDrawer(phase, body);
    else perfPrefetch(phase, body);
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
