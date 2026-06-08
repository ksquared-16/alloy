/** Filter server logs: `[admin-context-cache]` */

export type AdminContextCacheOutcome = "hit" | "miss" | "skipped";

export function logAdminContextCache(outcome: AdminContextCacheOutcome, detail: Record<string, unknown> = {}): void {
    if (typeof window !== "undefined") return;
    console.info("[admin-context-cache]", { outcome, ...detail });
}
