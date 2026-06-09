/** Filter server logs: `[perf:cache]` */

import { perfCache } from "@/lib/perf/perfNamespaceLog";

export type WuBootstrapCacheOutcome = "hit" | "miss";

export function logWuBootstrapCache(
    layer: "process" | "next_data",
    outcome: WuBootstrapCacheOutcome,
    detail: Record<string, unknown> = {}
): void {
    if (typeof window !== "undefined") return;
    perfCache("wu_bootstrap", {
        layer,
        outcome,
        cache_hit: outcome === "hit",
        work_unit_id: detail.work_unit_id,
        department_id: detail.department_id,
        source: "cache",
    });
}
