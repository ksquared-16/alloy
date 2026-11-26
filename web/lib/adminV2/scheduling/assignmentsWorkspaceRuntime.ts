/**
 * Shared Assignments Workspace runtime snapshot — one bootstrap per site,
 * consumed by Overview / Roster / Attendance / Categories / Patterns / Validation.
 *
 * Stale-response guard: callers pass a monotonically increasing `requestSeq`;
 * apply only when the completed load still matches the latest seq for that site.
 */

export type AssignmentsWorkspaceTimings = {
    shellPaintMs: number | null;
    coreSnapshotMs: number | null;
    overviewReadyMs: number | null;
    rosterReadyMs: number | null;
    assignmentRosterReadyMs: number | null;
    categoriesReadyMs: number | null;
    patternsReadyMs: number | null;
    calculationsReadyMs: number | null;
};

export type AssignmentsWorkspacePerfMark =
    | "workspace_click"
    | "shell_first_paint"
    | "core_snapshot_ready"
    | "tab_overview_ready"
    | "tab_roster_ready"
    | "tab_categories_ready"
    | "tab_patterns_ready"
    | "tab_validation_ready";

const PREFIX = "assignments-ws";

export function markAssignmentsWorkspacePerf(mark: AssignmentsWorkspacePerfMark): void {
    if (typeof performance === "undefined") return;
    try {
        performance.mark(`${PREFIX}:${mark}`);
    } catch {
        /* ignore */
    }
}

export function measureAssignmentsWorkspacePerf(
    name: string,
    start: AssignmentsWorkspacePerfMark,
    end: AssignmentsWorkspacePerfMark,
): number | null {
    if (typeof performance === "undefined") return null;
    try {
        const measureName = `${PREFIX}:${name}`;
        performance.measure(measureName, `${PREFIX}:${start}`, `${PREFIX}:${end}`);
        const entries = performance.getEntriesByName(measureName);
        const last = entries[entries.length - 1];
        return last ? Math.round(last.duration) : null;
    } catch {
        return null;
    }
}

export function emptyAssignmentsWorkspaceTimings(): AssignmentsWorkspaceTimings {
    return {
        shellPaintMs: null,
        coreSnapshotMs: null,
        overviewReadyMs: null,
        rosterReadyMs: null,
        assignmentRosterReadyMs: null,
        categoriesReadyMs: null,
        patternsReadyMs: null,
        calculationsReadyMs: null,
    };
}
