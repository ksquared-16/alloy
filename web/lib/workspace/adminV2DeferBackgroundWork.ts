import { isAdminV2SidecarNetworkBlocked } from "@/lib/perf/adminV2PrimarySurfaceGate";

/**
 * Schedules non-critical AdminV2 client work after the navigation paint / idle window.
 * Used to keep dept-critical fetches from competing with shell background polls.
 */
export function scheduleAdminV2BackgroundWork(
    fn: () => void | Promise<void>,
    options?: { idleTimeoutMs?: number; fallbackMs?: number }
): () => void {
    const idleTimeoutMs = options?.idleTimeoutMs ?? 3500;
    const fallbackMs = options?.fallbackMs ?? 180;

    const run = () => {
        void fn();
    };

    if (typeof window !== "undefined" && typeof requestIdleCallback !== "function") {
        const t = window.setTimeout(run, fallbackMs);
        return () => window.clearTimeout(t);
    }

    if (typeof window !== "undefined") {
        const id = requestIdleCallback(run, { timeout: idleTimeoutMs });
        return () => cancelIdleCallback(id);
    }

    return () => undefined;
}

/**
 * Runs once after WU/dept/drawer primary gate clears — no idle fallback, no perf-tick re-fire.
 */
export function runWhenAdminV2PrimarySurfaceReady(
    fn: () => void | Promise<void>,
    _label?: string
): () => void {
    let cancelled = false;
    let ran = false;

    const tryRun = () => {
        if (cancelled || ran) return;
        if (isAdminV2SidecarNetworkBlocked()) return;
        ran = true;
        void fn();
    };

    const schedule = () => {
        if (cancelled || ran) return;
        if (!isAdminV2SidecarNetworkBlocked()) {
            tryRun();
            return;
        }
        if (typeof window !== "undefined") {
            window.requestAnimationFrame(schedule);
        }
    };

    schedule();
    return () => {
        cancelled = true;
    };
}

/** @deprecated Prefer {@link runWhenAdminV2PrimarySurfaceReady}. */
export function scheduleAdminV2SidecarWork(
    fn: () => void | Promise<void>,
    _options?: { idleTimeoutMs?: number; fallbackMs?: number; maxWaitMs?: number }
): () => void {
    return runWhenAdminV2PrimarySurfaceReady(fn);
}
