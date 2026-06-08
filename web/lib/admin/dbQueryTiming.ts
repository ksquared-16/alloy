/**
 * Consistent server-side DB phase timing for staging logs (`[db-timing]`).
 * Logs only when duration meets threshold to avoid noise.
 */
const DEFAULT_MS_THRESHOLD = 30;

export function logDbTiming(label: string, ms: number, meta?: Record<string, unknown>): void {
    if (ms < DEFAULT_MS_THRESHOLD) return;
    console.warn("[db-timing]", { label, ms, ...(meta ?? {}) });
}

export async function withDbTiming<T>(
    label: string,
    meta: Record<string, unknown>,
    fn: () => Promise<T>,
    thresholdMs: number = DEFAULT_MS_THRESHOLD
): Promise<T> {
    const t0 = Date.now();
    try {
        return await fn();
    } finally {
        const ms = Date.now() - t0;
        if (ms >= thresholdMs) {
            console.warn("[db-timing]", { label, ms, ...meta });
        }
    }
}
