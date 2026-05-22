import { isAdminV2WuPrimaryPaintPending } from "@/lib/perf/alloyPerfGlobal";

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
 * Defers shell sidecars until WU primary paint marks are set (or navigation window expires).
 */
export function scheduleAdminV2SidecarWork(
    fn: () => void | Promise<void>,
    options?: { idleTimeoutMs?: number; fallbackMs?: number; maxWaitMs?: number }
): () => void {
    const maxWaitMs = options?.maxWaitMs ?? 20_000;
    let cancelled = false;
    let innerCancel: (() => void) | undefined;

    const armIdle = () => {
        if (cancelled) return;
        innerCancel = scheduleAdminV2BackgroundWork(fn, {
            idleTimeoutMs: options?.idleTimeoutMs ?? 8000,
            fallbackMs: options?.fallbackMs ?? 1200,
        });
    };

    const waitForPrimary = () => {
        if (cancelled) return;
        if (!isAdminV2WuPrimaryPaintPending(maxWaitMs)) {
            armIdle();
            return;
        }
        if (typeof window !== "undefined") {
            window.requestAnimationFrame(waitForPrimary);
        }
    };

    waitForPrimary();
    return () => {
        cancelled = true;
        innerCancel?.();
    };
}
