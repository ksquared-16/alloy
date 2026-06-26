/** Work-unit page reveal — one cold shell, then full critical surface together (Pass 3). */

export type WorkUnitPageRevealInput = {
    shell_ready: boolean;
    /** Header, KPI strip, selected queue rows, and actions rail are ready together. */
    critical_bundle_ready: boolean;
    /** After the first coordinated reveal, stay mounted during pill switches. */
    coordinated_reveal_completed: boolean;
    /**
     * Runtime-on (Alloy OS) only: hold the single cold reveal until the operational stack is
     * coherent — resolved subject + Focus Panel shell open (or no subject expected). This makes
     * the Work Unit reveal as ONE surface (WUC + KPIs + condensed queue + subject + Focus Panel)
     * instead of revealing the queue, then opening a drawer, then compressing.
     *
     * Defaults to `true` so flag-off behavior and the warm path are unchanged. The caller bounds
     * this with a fallback timer so a subject that never resolves cannot strand the cold shell.
     */
    operational_surface_ready?: boolean;
};

export function workUnitPageContentReady(input: WorkUnitPageRevealInput): boolean {
    if (!input.shell_ready) return false;
    // Warm path: once the first coordinated reveal completed, stay revealed across pill switches.
    if (input.coordinated_reveal_completed) return true;
    if (!input.critical_bundle_ready) return false;
    // Cold path: also wait for the operational surface (subject + Focus Panel shell) to be coherent.
    return input.operational_surface_ready ?? true;
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
