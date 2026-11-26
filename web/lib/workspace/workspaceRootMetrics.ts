/**
 * Workspace root headline metrics (departments / work-unit counts).
 *
 * Extracted from the retired legacy `WorkspaceRootShell` presentation component
 * (Presentation Runtime V2 cutover) — the KPI libs and session cache still key
 * off this shape.
 */
export type WorkspaceRootMetrics = {
    departments: number | null;
    workUnits: number | null;
};
