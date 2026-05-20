import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import { extractPipelineExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";

export type DeptPipelineWorkUnitPick = {
    id: string;
    key: string | null;
    queue_definition: unknown;
    department_id: string | null;
    metadata?: unknown;
};

/**
 * First work unit with `pipeline_with_attention` layout (enrollment_pipeline preferred).
 * Used to skip redundant dept card summaries for the pipeline WU during bootstrap.
 */
export function pickDeptPipelineWorkUnit(
    rows: Array<{
        id: string;
        key?: string | null;
        queue_definition?: unknown;
        department_id?: string | null;
        metadata?: unknown;
    }>,
    departmentId: string
): DeptPipelineWorkUnitPick | null {
    const ordered = [...rows].sort((a, b) => {
        const ak = String(a.key ?? "").trim().toLowerCase();
        const bk = String(b.key ?? "").trim().toLowerCase();
        if (ak === "enrollment_pipeline") return -1;
        if (bk === "enrollment_pipeline") return 1;
        return 0;
    });

    for (const w of ordered) {
        const key = String(w.key ?? "").trim().toLowerCase();
        if (key === "needs_attention") continue;
        const wuDept = String(w.department_id ?? "").trim();
        if (wuDept && wuDept !== departmentId) continue;
        try {
            const def = validateQueueDefinition(w.queue_definition);
            if (def.ui?.layout !== "pipeline_with_attention") continue;
            const lanes = extractPipelineExecutionLanes(def);
            if (!lanes.length) continue;
            return {
                id: String(w.id),
                key: w.key ?? null,
                queue_definition: w.queue_definition,
                department_id: wuDept || null,
                metadata: w.metadata,
            };
        } catch {
            continue;
        }
    }
    return null;
}
