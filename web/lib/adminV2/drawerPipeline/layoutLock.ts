import type { DrawerEnrichmentState } from "@/lib/adminV2/drawerPipeline/types";

/** While true, full hydrate must not change above-fold layout (values only). */
export function drawerAboveFoldLayoutLocked(layout_frozen: boolean, below_fold_revealed: boolean): boolean {
    return layout_frozen && !below_fold_revealed;
}

export function drawerLayoutFirstPaintGatesActive(
    above_fold_locked: boolean,
    first_paint_active: boolean
): boolean {
    return above_fold_locked || first_paint_active;
}

export function drawerBelowFoldEnrichmentReady(
    secondary_window_open: boolean,
    above_fold_stable: boolean
): boolean {
    return secondary_window_open && above_fold_stable;
}

export function drawerFullBoundValuesReady(
    below_fold_enrichment_ready: boolean,
    enrichment: DrawerEnrichmentState
): boolean {
    return (
        below_fold_enrichment_ready &&
        enrichment.full_complete &&
        !enrichment.enrichment_held_until_interaction
    );
}
