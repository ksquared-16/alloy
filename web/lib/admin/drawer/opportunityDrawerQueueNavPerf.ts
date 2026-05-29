/**
 * Dev/staging queue prev/next navigation diagnostics.
 * Filter: `[perf.drawer.queue_nav]`
 */

const PERF_ENABLED = process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export type OpportunityQueueNavPath =
    | "preload_hit"
    | "snapshot_hit"
    | "warm_composed"
    | "cold_composed";

export type OpportunityQueueNavSource = "queue_prev" | "queue_next";

export function logOpportunityQueueNav(payload: {
    nav_source: OpportunityQueueNavSource;
    target_id: string;
    path: OpportunityQueueNavPath;
    overlay_shown: boolean;
    bootstrap_warm: boolean;
    primary_warm: boolean;
    snapshot_warm: boolean;
    prefetch_hit: boolean;
    time_to_decision_ms?: number;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[perf.drawer.queue_nav]", payload);
}
