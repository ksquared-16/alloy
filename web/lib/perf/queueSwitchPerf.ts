/**
 * Dev/staging queue lane switch diagnostics.
 * Filter: `[perf:queue]`
 */

import { perfDevDetailEnabled, perfQueue } from "@/lib/perf/perfNamespaceLog";

export function logQueueSwitch(payload: {
    from_queue: string | null;
    to_queue: string;
    request_id: number;
    applied: boolean;
    skipped_reason?: string | null;
    buffered_rows_used?: boolean;
    selected_queue_after: string | null;
}): void {
    if (!perfDevDetailEnabled()) return;
    perfQueue("lane_switch", {
        from_queue: payload.from_queue,
        to_queue: payload.to_queue,
        request_id: payload.request_id,
        applied: payload.applied,
        skipped_reason: payload.skipped_reason ?? undefined,
        buffered_rows_used: payload.buffered_rows_used,
        selected_queue_after: payload.selected_queue_after,
        source: payload.buffered_rows_used ? "cache" : "network",
    });
}

export function logQueueRowsLoad(payload: {
    phase: "start" | "apply" | "ignore" | "ready";
    work_unit_id: string;
    queue_key: string;
    request_id?: number;
    applied?: boolean;
    skipped_reason?: string | null;
    rows_count?: number | null;
    cache_hit?: boolean;
    duration_ms?: number;
}): void {
    perfQueue(`rows_${payload.phase}`, {
        work_unit_id: payload.work_unit_id,
        queue_key: payload.queue_key,
        request_id: payload.request_id,
        applied: payload.applied,
        skipped_reason: payload.skipped_reason ?? undefined,
        rows_count: payload.rows_count ?? undefined,
        cache_hit: payload.cache_hit,
        duration_ms: payload.duration_ms,
        source: payload.cache_hit ? "cache" : "network",
    });
}
