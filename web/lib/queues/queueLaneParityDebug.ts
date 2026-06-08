/** Gated server/client diagnostics for queue count vs row fetch parity (Tour QA). */
export function isQueueLaneParityDebugEnabled(): boolean {
    return process.env.ALLOY_QUEUE_LANE_PARITY_DEBUG === "1";
}

export type QueueLaneParityDebugPayload = {
    phase: "rows_before_enrichment" | "rows_after_enrichment" | "rows_after_placement";
    org_id: string;
    work_unit_id: string;
    requested_queue_key: string;
    executable_queue_key: string;
    status_filter_values?: string[];
    raw_row_count: number;
    enriched_row_count?: number;
    final_row_count?: number;
    sample_opportunity_ids?: string[];
    lookup_opportunity_id?: string;
    lookup_included?: boolean;
};

export function logQueueLaneParityDebug(payload: QueueLaneParityDebugPayload): void {
    if (!isQueueLaneParityDebugEnabled()) return;
    console.warn("[queue-lane-parity]", payload);
}
