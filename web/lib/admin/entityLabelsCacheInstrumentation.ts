/** Filter server logs: `[perf:cache]` */

import { perfCache } from "@/lib/perf/perfNamespaceLog";

export type EntityLabelsCacheOutcome = "hit" | "miss";

export function logEntityLabelsCache(
    outcome: EntityLabelsCacheOutcome,
    detail: Record<string, unknown> = {}
): void {
    if (typeof window !== "undefined") return;
    perfCache("entity_labels", {
        outcome,
        cache_hit: outcome === "hit",
        org_id: detail.org_id,
        source: "cache",
    });
}
