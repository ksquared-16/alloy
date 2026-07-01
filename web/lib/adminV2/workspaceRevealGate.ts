export type WorkspaceRevealGateInput = {
    shell_ready: boolean;
    department_tiles_ready: boolean;
    tile_counts_ready: boolean;
    actions_ready: boolean;
    kpi_region_ready: boolean;
};

export type WorkspaceRevealGate = WorkspaceRevealGateInput & {
    above_fold_ready: boolean;
    reason_if_blocked: string[];
};

export function computeWorkspaceRevealGate(input: WorkspaceRevealGateInput): WorkspaceRevealGate {
    const reason_if_blocked: string[] = [];
    if (!input.shell_ready) reason_if_blocked.push("shell");
    if (!input.department_tiles_ready) reason_if_blocked.push("department_tiles");
    if (!input.tile_counts_ready) reason_if_blocked.push("tile_counts");
    if (!input.actions_ready) reason_if_blocked.push("actions");
    if (!input.kpi_region_ready) reason_if_blocked.push("kpi_region");
    return {
        ...input,
        above_fold_ready: reason_if_blocked.length === 0,
        reason_if_blocked,
    };
}

export function workspaceRevealShellReady(input: {
    bootstrap_loading: boolean;
    departments_resolved: boolean;
}): boolean {
    return !input.bootstrap_loading && input.departments_resolved;
}

export function workspaceRevealDepartmentTilesReady(input: {
    bootstrap_loading: boolean;
    has_departments: boolean;
    fetch_settled_empty: boolean;
}): boolean {
    return !input.bootstrap_loading && (input.has_departments || input.fetch_settled_empty);
}

export function workspaceRevealTileCountsReady(input: {
    has_departments: boolean;
    quick_rollup_applied: boolean;
    fetch_settled_empty: boolean;
}): boolean {
    // No departments to count → immediately ready. Otherwise wait for the first rollup.
    return !input.has_departments || input.fetch_settled_empty || input.quick_rollup_applied;
}

export function workspaceRevealKpiRegionReady(input: {
    quick_metrics_applied: boolean;
    fetch_settled_empty: boolean;
    cache_primed: boolean;
    errored: boolean;
}): boolean {
    // Ready as soon as any terminal or data state is known. Blocks only while fully pending.
    return (
        input.quick_metrics_applied ||
        input.fetch_settled_empty ||
        input.cache_primed ||
        input.errored
    );
}

/** Workspace actions have no async gate — always ready. */
export function workspaceRevealActionsReady(): boolean {
    return true;
}
