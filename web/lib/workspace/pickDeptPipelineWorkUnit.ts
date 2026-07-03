import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import { getQueueUiConfig } from "@/lib/ui-v2/queueUiConfig";
import { extractPipelineExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";
import { isLifecycleStageWorkUnitKey } from "@/lib/lifecycle/lifecycleStageWorkUnit";

export type DeptPipelineWorkUnitPick = {
    id: string;
    key: string | null;
    queue_definition: unknown;
    department_id: string | null;
    metadata?: unknown;
};

/**
 * First work unit with pipeline/domain execution layout (enrollment_pipeline preferred).
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
        const bundle = tryLoadWorkUnitQueueDefinitionBundle(w.queue_definition);
        if (!bundle) continue;
        const def = bundle.def;
        const ui = getQueueUiConfig(def);
        if (ui.layout !== "pipeline_with_attention") continue;
        const lanes = extractPipelineExecutionLanes(def);
        if (!lanes.length) continue;
        return {
            id: String(w.id),
            key: w.key ?? null,
            queue_definition: w.queue_definition,
            department_id: wuDept || null,
            metadata: w.metadata,
        };
    }
    return null;
}

/**
 * Host work unit for a department's configured Work Views: the pipeline work unit when one
 * exists, else the first lifecycle-stage work unit. Shared by the workspace nav builder
 * (`workViewNavEntriesForDepartment`) and the work-view slug resolver so a configured Work
 * View resolves to the same host everywhere.
 */
export function pickDeptWorkViewHostWorkUnit<
    T extends {
        id: string;
        key?: string | null;
        queue_definition?: unknown;
        department_id?: string | null;
        is_active?: boolean | null;
    },
>(rows: T[], departmentId: string): T | null {
    const forDept = rows.filter(
        (row) => String(row.department_id ?? "").trim() === departmentId && row.is_active !== false,
    );
    const pipeline = pickDeptPipelineWorkUnit(forDept, departmentId);
    if (pipeline) {
        const pipelineRow = forDept.find((row) => row.id === pipeline.id) ?? null;
        if (pipelineRow) return pipelineRow;
    }
    return forDept.find((row) => isLifecycleStageWorkUnitKey(String(row.key ?? ""))) ?? null;
}
