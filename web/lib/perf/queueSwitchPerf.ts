/**
 * Dev/staging queue lane switch diagnostics.
 * Filter: `[perf.queue.switch]`
 */

const PERF_ENABLED = process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export function logQueueSwitch(payload: {
    from_queue: string | null;
    to_queue: string;
    request_id: number;
    applied: boolean;
    skipped_reason?: string | null;
    buffered_rows_used?: boolean;
    selected_queue_after: string | null;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[perf.queue.switch]", payload);
}
