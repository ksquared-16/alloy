/** Work-unit page reveal — no warm bypass that exposes row skeleton under loaded pills. */

export type WorkUnitPageRevealInput = {
    shell_ready: boolean;
    /** First selected lane has reached a settled display state at least once this visit. */
    initial_lane_reveal_settled: boolean;
    /** Current selected lane may paint rows / empty / error (not skeleton). */
    lane_reveal_settled: boolean;
};

export function workUnitPageContentReady(input: WorkUnitPageRevealInput): boolean {
    if (!input.shell_ready) return false;
    return input.initial_lane_reveal_settled || input.lane_reveal_settled;
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
