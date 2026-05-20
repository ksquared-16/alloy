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
