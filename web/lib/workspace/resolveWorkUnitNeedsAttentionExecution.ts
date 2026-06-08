import {
    workUnitDefinesNeedsAttentionQueue,
    type DeptNeedsAttentionWorkUnitResolution,
} from "@/lib/workspace/resolveDeptNeedsAttentionWorkUnit";

export type WorkUnitNeedsAttentionExecutionRow = {
    id: string;
    key?: string | null;
    metadata?: unknown;
    department_id?: string | null;
    queue_definition?: unknown;
};

/**
 * WU-scoped Needs Attention execution context for the page work unit.
 * Does not scan the department — only the current work unit hosts the NA queue or is standalone NA.
 */
export function resolveWorkUnitNeedsAttentionExecution(
    workUnit: WorkUnitNeedsAttentionExecutionRow,
    departmentId: string
): DeptNeedsAttentionWorkUnitResolution | null {
    const wuDept = String(workUnit.department_id ?? "").trim();
    if (wuDept && wuDept !== departmentId) return null;

    const key = String(workUnit.key ?? "").trim().toLowerCase();
    if (key === "needs_attention") {
        return {
            id: String(workUnit.id),
            key: workUnit.key ?? null,
            metadata: workUnit.metadata ?? null,
            department_id: workUnit.department_id ?? null,
            mode: "standalone_work_unit",
        };
    }

    if (workUnitDefinesNeedsAttentionQueue(workUnit.queue_definition)) {
        return {
            id: String(workUnit.id),
            key: workUnit.key ?? null,
            metadata: workUnit.metadata ?? null,
            department_id: workUnit.department_id ?? null,
            mode: "pipeline_work_unit",
        };
    }

    return null;
}
