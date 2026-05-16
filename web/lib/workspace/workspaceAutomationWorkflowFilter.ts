/**
 * Workspace automation panels — partition workflows by metadata.scope.
 */

import {
    partitionWorkflowsByWorkspaceScope,
    type WorkflowScopePartitionV1,
    type WorkflowWithScopeRow,
} from "@/lib/workflows/workflowScopeMetadata";

export type WorkspaceAutomationWorkflowRow = WorkflowWithScopeRow;

/** @deprecated Use scoped partitions; shown only when heuristic fallback is active. */
export const WORKSPACE_AUTOMATION_METADATA_GAP_NOTE =
    "No workflows are scoped to this department or work unit yet. Showing org-wide enrollment-adjacent automations as a fallback.";

export type WorkspaceAutomationWorkflowPartitions = WorkflowScopePartitionV1;

export function partitionWorkflowsForWorkspaceAutomationSurface(
    rows: WorkspaceAutomationWorkflowRow[],
    context: { department_id?: string | null; work_unit_id?: string | null }
): WorkspaceAutomationWorkflowPartitions {
    return partitionWorkflowsByWorkspaceScope(rows, context);
}

/** Flat list for legacy callers — scoped first, then org-wide, then heuristic. */
export function flattenWorkspaceAutomationPartitions(parts: WorkspaceAutomationWorkflowPartitions): WorkspaceAutomationWorkflowRow[] {
    const out = [
        ...parts.scoped_work_unit,
        ...parts.scoped_department,
        ...parts.org_wide,
        ...(parts.uses_heuristic_fallback ? parts.heuristic : []),
    ];
    if (out.length > 0) return out;
    const all = [...parts.scoped_work_unit, ...parts.scoped_department, ...parts.org_wide, ...parts.heuristic];
    return all.slice(0, 8);
}
