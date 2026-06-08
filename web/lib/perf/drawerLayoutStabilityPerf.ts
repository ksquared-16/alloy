/**
 * Dev/staging drawer above-fold layout stability diagnostics.
 * Filter: `[perf.drawer.layout_stability]`
 */

const PERF_ENABLED = process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export function logDrawerLayoutStability(payload: {
    opportunity_id: string;
    phase: string;
    changed_sections?: string[];
    above_fold_changed?: boolean;
    geometry_changed?: boolean;
    text_only_change?: boolean;
    full_hydrate_applied?: boolean;
    above_fold_locked?: boolean;
    source_surface?: string;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[perf.drawer.layout_stability]", payload);
}
