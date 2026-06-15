/** Work-unit page reveal — one cold shell, then full critical surface together (Pass 3). */

export type WorkUnitPageRevealInput = {
    shell_ready: boolean;
    /** Header, KPI strip, selected queue rows, and actions rail are ready together. */
    critical_bundle_ready: boolean;
    /** After the first coordinated reveal, stay mounted during pill switches. */
    coordinated_reveal_completed: boolean;
};

export function workUnitPageContentReady(input: WorkUnitPageRevealInput): boolean {
    if (!input.shell_ready) return false;
    if (input.coordinated_reveal_completed) return true;
    return input.critical_bundle_ready;
}

export function workUnitPageShowsLoadingGate(input: WorkUnitPageRevealInput): boolean {
    return !workUnitPageContentReady(input);
}

export type WorkUnitKpiStripPlaceholderInput = {
    kpi_metrics_pending: boolean;
    lane_reveal_settled: boolean;
};

export function workUnitKpiStripShowsPlaceholder(input: WorkUnitKpiStripPlaceholderInput): boolean {
    if (!input.kpi_metrics_pending) return false;
    return input.lane_reveal_settled;
}
