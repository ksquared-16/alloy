/** Filter server logs: `[perf:cache]` */

import { perfCache } from "@/lib/perf/perfNamespaceLog";

export type AdminContextCacheOutcome = "hit" | "miss" | "skipped";

export function logAdminContextCache(outcome: AdminContextCacheOutcome, detail: Record<string, unknown> = {}): void {
    if (typeof window !== "undefined") return;
    perfCache("admin_context", {
        outcome,
        cache_hit: outcome === "hit",
        org_id: detail.org_id,
        source: "cache",
    });
}
