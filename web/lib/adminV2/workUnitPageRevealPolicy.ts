/** Cold vs warm work-unit page reveal — warm uses shell-ready + in-lane skeletons; cold waits for above-fold. */

export type WorkUnitPageRevealInput = {
    /** Session cache applied WU + dept before bootstrap (reactive; not ref-only). */
    page_seeded_from_cache: boolean;
    shell_ready: boolean;
    above_fold_ready: boolean;
};

export function workUnitPageContentReady(input: WorkUnitPageRevealInput): boolean {
    if (!input.shell_ready) return false;
    if (input.page_seeded_from_cache) return true;
    return input.above_fold_ready;
}

export function workUnitPageShowsLoadingGate(input: WorkUnitPageRevealInput): boolean {
    return !workUnitPageContentReady(input);
}

export type WorkUnitKpiStripPlaceholderInput = {
    kpi_metrics_pending: boolean;
    page_seeded_from_cache: boolean;
    above_fold_ready: boolean;
};

/**
 * Warm path: KPI reserve only after above-fold (shell may show in-lane skeletons first).
 * Cold path: when page content appears (above-fold), show KPI reserve immediately if metrics pending.
 */
export function workUnitKpiStripShowsPlaceholder(input: WorkUnitKpiStripPlaceholderInput): boolean {
    if (!input.kpi_metrics_pending) return false;
    return input.above_fold_ready;
}
