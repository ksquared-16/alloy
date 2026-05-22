import { ALLOY_PERF_TICK_EVENT } from "@/lib/perf/alloyPerfGlobal";
import { isAdminV2PrimarySurfacePending } from "@/lib/perf/adminV2PrimarySurfaceGate";

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
 * Hard-deferred shell sidecars: no idle/timer fallback until primary surface paint mark clears the gate.
 */
export function runWhenAdminV2PrimarySurfaceReady(
    fn: () => void | Promise<void>,
    _label?: string
): () => void {
    let cancelled = false;

    const runIfReady = () => {
        if (cancelled) return;
        if (isAdminV2PrimarySurfacePending()) return;
        void fn();
    };

    const scheduleCheck = () => {
        if (cancelled) return;
        if (!isAdminV2PrimarySurfacePending()) {
            runIfReady();
            return;
        }
        if (typeof window !== "undefined") {
            window.requestAnimationFrame(scheduleCheck);
        }
    };

    scheduleCheck();

    const onTick = () => runIfReady();
    if (typeof window !== "undefined") {
        window.addEventListener(ALLOY_PERF_TICK_EVENT, onTick);
    }

    return () => {
        cancelled = true;
        if (typeof window !== "undefined") {
            window.removeEventListener(ALLOY_PERF_TICK_EVENT, onTick);
        }
    };
}

/** @deprecated Prefer {@link runWhenAdminV2PrimarySurfaceReady} — no idle fallback during primary paint. */
export function scheduleAdminV2SidecarWork(
    fn: () => void | Promise<void>,
    _options?: { idleTimeoutMs?: number; fallbackMs?: number; maxWaitMs?: number }
): () => void {
    return runWhenAdminV2PrimarySurfaceReady(fn);
}
