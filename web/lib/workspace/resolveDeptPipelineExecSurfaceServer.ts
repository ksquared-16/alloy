import { validateQueueDefinition } from "@/lib/config/queueDefinitionSchema";
import { extractPipelineExecutionLanes } from "@/lib/workspace/extractPipelineExecutionLanes";
import { mapWithConcurrency } from "@/lib/workspace/mapWithConcurrency";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import {
    getWorkUnitQueueSummaries,
    type QueueSummariesSharedBootstrap,
} from "@/lib/queues/QueueService";
import type { QueueViewerTimezoneMeta } from "@/lib/queues/types";
import type { DeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";

type PipelineWorkUnitRow = {
    id: string;
    key: string | null;
    queue_definition?: unknown;
    department_id?: string | null;
};

/**
 * Server-side pipeline probe for dept oper region — no client HTTP fan-out.
 * Mirrors `resolveDeptPipelineExecSurface` lane merge semantics.
 */
export async function resolveDeptPipelineExecSurfaceServer(params: {
    departmentId: string;
    candidates: PipelineWorkUnitRow[];
    orgId: string;
    concurrency?: number;
    sharedBootstrap?: QueueSummariesSharedBootstrap;
    recordScopeImpossible?: boolean;
    recordScopeConstraints?: RecordScopeConstraints | null;
    viewerDisplayTimeZone?: QueueViewerTimezoneMeta;
}): Promise<DeptPipelineExecSurface | null> {
    const {
        departmentId,
        candidates,
        orgId,
        concurrency = 4,
        sharedBootstrap,
        recordScopeImpossible,
        recordScopeConstraints,
        viewerDisplayTimeZone,
    } = params;
    if (!candidates.length) return null;

    const ordered = [...candidates].sort((a, b) => {
        const ak = (a.key ?? "").trim().toLowerCase();
        const bk = (b.key ?? "").trim().toLowerCase();
        if (ak === "enrollment_pipeline") return -1;
        if (bk === "enrollment_pipeline") return 1;
        return 0;
    });

    const surfaces = await mapWithConcurrency(ordered, concurrency, async (wu) => {
        try {
            if (String(wu.department_id ?? "").trim() !== departmentId) return null;
            let def;
            try {
                def = validateQueueDefinition(wu.queue_definition);
            } catch {
                return null;
            }
            if (def.ui?.layout !== "pipeline_with_attention") return null;
            const lanes = extractPipelineExecutionLanes(def);
            if (!lanes.length) return null;

            const pipeSection = def.ui?.sections?.find((s) => s.key === "pipeline");
            const panelTitle = pipeSection?.label?.trim() || "Pipeline";

            const { queues } = await getWorkUnitQueueSummaries({
                orgId,
                workUnitId: wu.id,
                limit: 3,
                includePreviews: false,
                summaryMode: "all",
                perfTag: `dept_pipeline:${departmentId}`,
                sharedBootstrap,
                recordScopeImpossible,
                recordScopeConstraints,
                viewerDisplayTimeZone,
            });
            const byKey = new Map(queues.map((q) => [q.key, q]));
            const merged = lanes.map((lane) => {
                const q = byKey.get(lane.key);
                const deferred = q?.counts_deferred === true;
                const count =
                    !deferred && q && typeof q.count === "number" ? Math.max(0, Math.floor(q.count)) : null;
                return {
                    ...lane,
                    count,
                    countsDeferred: deferred,
                };
            });

            return {
                workUnitId: wu.id,
                panelTitle,
                lanes: merged,
            } satisfies DeptPipelineExecSurface;
        } catch {
            return null;
        }
    });

    return surfaces.find((s) => s != null) ?? null;
}
