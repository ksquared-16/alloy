/**
 * Operational signal for Configuration Object Selector rows.
 * Attention when Fix items exist. Never readiness %, capacity, or config-state.
 * Locality and Active/Inactive are rendered as separate row identity layers.
 */
export function locationSelectorAttentionSignal(input: {
    criticalCount: number;
    /** The most important outstanding item, when the model resolved one. */
    topAttention?: { label: string } | null;
}): string | null {
    const { criticalCount, topAttention } = input;
    if (criticalCount <= 0) return null;
    /*
     * "1 needs attention" told an operator that something was wrong and nothing
     * else — not what, not where, not what would clear it. The workspace model
     * already resolves the top item, so when there is exactly one thing wrong the
     * row says what it is: "3 rooms need capacity", "Time zone is not set".
     *
     * With several, an aggregate stays truthful — naming one would imply it is
     * the only one — and Overview lists them all.
     */
    if (criticalCount === 1) return topAttention?.label ?? "1 needs attention";
    return `${criticalCount} need attention`;
}

/**
 * @deprecated Prefer locality + status + locationSelectorAttentionSignal as separate row layers.
 * Kept for any transitional call sites.
 */
export function locationSelectorSignal(location: {
    criticalCount: number;
    locality: string | null;
    isActive: boolean;
}): string | null {
    if (!location.isActive) return "Inactive";
    const attention = locationSelectorAttentionSignal({ criticalCount: location.criticalCount });
    if (attention) return attention;
    if (location.locality) return location.locality;
    return null;
}
