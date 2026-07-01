import type { PlatformSurfacePerfEvent } from "@/lib/perf/platformSurfacePerfBuffer";

const RELAY_PATH = "/api/admin/debug/platform-perf-trace";

let pending: PlatformSurfacePerfEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function platformSurfacePerfServerLogEnabled(): boolean {
    if (process.env.NEXT_PUBLIC_ALLOY_PLATFORM_PERF_SERVER_LOG === "1") return true;
    if (typeof window === "undefined") return false;
    try {
        return window.localStorage?.getItem("ALLOY_PLATFORM_PERF_SERVER_LOG") === "1";
    } catch {
        return false;
    }
}

function flushPending(): void {
    flushTimer = null;
    if (typeof window === "undefined" || pending.length === 0) return;
    const batch = pending.splice(0, pending.length);
    const body = JSON.stringify({ events: batch });
    try {
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
            const blob = new Blob([body], { type: "application/json" });
            if (navigator.sendBeacon(RELAY_PATH, blob)) return;
        }
    } catch {
        /* fall through to fetch */
    }
    void fetch(RELAY_PATH, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
    }).catch(() => {
        /* best-effort relay */
    });
}

export function relayPlatformSurfacePerfEvents(events: PlatformSurfacePerfEvent[]): void {
    if (!platformSurfacePerfServerLogEnabled() || typeof window === "undefined") return;
    if (!events.length) return;
    pending.push(...events);
    if (flushTimer != null) return;
    flushTimer = setTimeout(flushPending, 120);
}

/** @internal */
export function flushPlatformSurfacePerfRelayForTests(): void {
    if (flushTimer != null) {
        clearTimeout(flushTimer);
        flushTimer = null;
    }
    flushPending();
}
