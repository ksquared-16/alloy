/**
 * Dev/staging drawer layout stability diagnostics.
 * Filter: `[perf:drawer]`
 */

import { perfDevDetailEnabled, perfDrawer } from "@/lib/perf/perfNamespaceLog";

export function logDrawerLayoutStability(payload: {
    opportunity_id: string;
    phase: string;
    changed_sections: string[];
    above_fold_changed: boolean;
    geometry_changed: boolean;
    text_only_change: boolean;
    full_hydrate_applied: boolean;
    above_fold_locked: boolean;
    source_surface?: string;
}): void {
    if (!perfDevDetailEnabled()) return;
    perfDrawer("layout_stability", {
        entity_type: "opportunity",
        entity_id: payload.opportunity_id,
        phase: payload.phase,
        count: payload.changed_sections.length,
        source: payload.source_surface ?? "ui",
    });
}
