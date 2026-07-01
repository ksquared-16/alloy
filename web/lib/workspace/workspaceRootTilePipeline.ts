/**
 * Same department → tile transform as /adminV2/workspace (page.tsx → WorkspaceRootDepartmentGrid).
 * Server validation and lifecycle checks must use this — not raw DB rows alone.
 */

import type { WorkspaceRootDepartmentRow } from "@/components/admin/workspace/WorkspaceRootDepartmentGrid";
import { filterActiveWorkspaceDepartments } from "@/lib/workspace/workspaceActiveDepartments";

export type WorkspaceTilePipelineTrace = {
    /** IDs from GET /api/admin/departments `items` (after route access scope). */
    apiDepartmentIds: string[];
    /** After `filterActiveWorkspaceDepartments` — same as workspace page `active`. */
    afterActiveFilterIds: string[];
    /** IDs passed to `WorkspaceRootDepartmentGrid` (no further filter today). */
    renderedTileIds: string[];
};

/** Mirror workspace index page: `const active = items.filter((d) => d.is_active !== false)`. */
export function transformWorkspaceApiDepartmentsToTiles(
    apiItems: WorkspaceRootDepartmentRow[]
): WorkspaceRootDepartmentRow[] {
    return filterActiveWorkspaceDepartments(apiItems);
}

export function traceWorkspaceRootDepartmentTiles(
    apiItems: WorkspaceRootDepartmentRow[]
): WorkspaceTilePipelineTrace {
    const apiDepartmentIds = apiItems.map((d) => d.id);
    const tiles = transformWorkspaceApiDepartmentsToTiles(apiItems);
    const afterActiveFilterIds = tiles.map((d) => d.id);
    return {
        apiDepartmentIds,
        afterActiveFilterIds,
        renderedTileIds: afterActiveFilterIds,
    };
}

export function departmentIdInRenderedWorkspaceTiles(
    trace: WorkspaceTilePipelineTrace,
    departmentId: string
): boolean {
    return trace.renderedTileIds.includes(departmentId);
}

export function workspaceRenderedTileFailureReason(
    trace: WorkspaceTilePipelineTrace,
    departmentId: string
): string | null {
    if (trace.renderedTileIds.includes(departmentId)) return null;
    if (!trace.apiDepartmentIds.includes(departmentId)) {
        return "Department missing from GET /api/admin/departments response (after access scope).";
    }
    if (!trace.afterActiveFilterIds.includes(departmentId)) {
        return "Department excluded by workspace active filter (is_active === false).";
    }
    return "Department excluded from rendered tile list after workspace transform.";
}
