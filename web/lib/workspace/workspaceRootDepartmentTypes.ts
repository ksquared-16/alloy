/**
 * Workspace root department tile row + rollup shapes.
 *
 * Extracted from the retired legacy `WorkspaceRootDepartmentGrid` presentation
 * component (Presentation Runtime V2 cutover) — tile-truth, session cache,
 * rollup view models, and lifecycle activation validation still consume these.
 */

export type WorkspaceRootDepartmentRow = {
    id: string;
    key: string;
    name: string;
    description?: string | null;
    sort_order?: number | null;
    is_active?: boolean | null;
    /** When API exposes `default_visual_context_key`, ties tile to registry before `key` fallback. */
    default_visual_context_key?: string | null;
};

/** Per-department rollups for root tiles (from /api/admin/work-units, etc.). */
export type WorkspaceRootDeptTileStats = Record<
    string,
    { workUnitCount: number; opportunityRollupLine?: string | null; workUnitNames?: string[] }
>;
