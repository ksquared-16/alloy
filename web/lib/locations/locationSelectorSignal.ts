/**
 * Operational signal for Configuration Object Selector rows.
 * Attention when Fix items exist. Never readiness %, capacity, or config-state.
 * Locality and Active/Inactive are rendered as separate row identity layers.
 */
export function locationSelectorAttentionSignal(criticalCount: number): string | null {
    if (criticalCount <= 0) return null;
    return criticalCount === 1 ? "1 needs attention" : `${criticalCount} need attention`;
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
    const attention = locationSelectorAttentionSignal(location.criticalCount);
    if (attention) return attention;
    if (location.locality) return location.locality;
    return null;
}
