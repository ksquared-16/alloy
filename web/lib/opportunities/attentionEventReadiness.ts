import type { AttentionResolverDiffEntry } from "@/lib/opportunities/attentionResolverDiff";

/**
 * GATE 3 stub — async workflow emitters / materialization hook without DB writes.
 * Compare snapshots with {@link diffAttentionResolverResults} before calling this.
 */
export function stubEmitAttentionReadinessEvents(_diff: AttentionResolverDiffEntry[]): void {
    void _diff;
}
