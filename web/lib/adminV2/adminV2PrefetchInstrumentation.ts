/**
 * AdminV2 above-fold prefetch instrumentation — filter console with `[perf:prefetch]`.
 */

import { perfPrefetch } from "@/lib/perf/perfNamespaceLog";

export type AdminV2PrefetchSurface =
    | "workspace"
    | "department"
    | "work_unit"
    | "drawer_primary"
    | "drawer_full";

export type AdminV2PrefetchOutcome = "start" | "hit" | "miss" | "inflight_join" | "complete" | "error" | "skipped";

export function logPrefetchAdminV2(
    surface: AdminV2PrefetchSurface,
    outcome: AdminV2PrefetchOutcome,
    detail: Record<string, unknown> = {}
): void {
    if (typeof window === "undefined") return;
    const phase = `${surface}_${outcome}`;
    perfPrefetch(phase, {
        surface,
        outcome,
        work_unit_id: detail.work_unit_id,
        department_id: detail.department_id,
        entity_id: detail.entity_id ?? detail.opportunity_id,
        entity_type: detail.entity_type,
        bootstrap_owner: detail.bootstrap_owner,
        source: outcome === "hit" || outcome === "inflight_join" ? "cache" : "network",
        cache_hit: outcome === "hit" || outcome === "inflight_join",
        duration_ms: detail.duration_ms ?? detail.total_ms,
    });
}
