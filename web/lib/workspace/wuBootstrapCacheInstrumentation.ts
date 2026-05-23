/** Filter staging/dev logs: `[wu-bootstrap-cache]` */

export type WuBootstrapCacheOutcome = "hit" | "miss";

export function logWuBootstrapCache(
    layer: "process" | "next_data",
    outcome: WuBootstrapCacheOutcome,
    detail: Record<string, unknown> = {}
): void {
    if (typeof window !== "undefined") return;
    console.info("[wu-bootstrap-cache]", { layer, outcome, ...detail });
}
