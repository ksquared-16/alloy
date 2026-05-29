/**
 * Dev/staging drawer above-fold layout stability diagnostics.
 * Filter: `[perf.drawer.layout_stability]`
 */

const PERF_ENABLED = process.env.NODE_ENV === "development" || process.env.VITEST === "true";

export function logDrawerLayoutStability(payload: {
    opportunity_id: string;
    phase: string;
    above_fold_locked: boolean;
    full_hydrate_applied: boolean;
    changed_sections?: string[];
    geometry_changed?: boolean;
}): void {
    if (!PERF_ENABLED) return;
    console.info("[perf.drawer.layout_stability]", payload);
}
