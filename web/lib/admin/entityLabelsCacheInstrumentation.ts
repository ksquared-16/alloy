/** Filter server logs: `[entity-labels-cache]` */

export type EntityLabelsCacheOutcome = "hit" | "miss";

export function logEntityLabelsCache(
    outcome: EntityLabelsCacheOutcome,
    detail: Record<string, unknown> = {}
): void {
    if (typeof window !== "undefined") return;
    console.info("[entity-labels-cache]", { outcome, ...detail });
}
