/**
 * Dev/staging queue prev/next navigation diagnostics.
 * Filter: `[perf:drawer]`
 */

import { perfDevDetailEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

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
    if (!perfDevDetailEnabled()) return;
    perfDrawer("queue_nav", {
        entity_type: "opportunity",
        entity_id: payload.target_id,
        nav_source: payload.nav_source,
        path: payload.path,
        overlay_shown: payload.overlay_shown,
        bootstrap_warm: payload.bootstrap_warm,
        primary_warm: payload.primary_warm,
        snapshot_warm: payload.snapshot_warm,
        prefetch_hit: payload.prefetch_hit,
        duration_ms: payload.time_to_decision_ms,
        cache_hit: payload.prefetch_hit || payload.snapshot_warm || payload.path.includes("hit"),
        source: payload.prefetch_hit || payload.snapshot_warm ? "cache" : "network",
    });
}
