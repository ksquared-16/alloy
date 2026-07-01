import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import {
    extractPipelineExecutionLanes,
    resolvePipelineExecPanelTitle,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import type { RecordScopeConstraints } from "@/lib/admin/accessScope";
import {
    getWorkUnitQueueSummaries,
    type QueueSummariesSharedBootstrap,
} from "@/lib/queues/QueueService";
import type { QueueViewerTimezoneMeta } from "@/lib/queues/types";
import type { DeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";
import type { DeptPipelineWorkUnitPick } from "@/lib/workspace/pickDeptPipelineWorkUnit";

type PipelineWorkUnitRow = {
    id: string;
    key: string | null;
    queue_definition?: unknown;
    department_id?: string | null;
    metadata?: unknown;
};

async function probePipelineWorkUnit(params: {
    departmentId: string;
    wu: PipelineWorkUnitRow;
    orgId: string;
    sharedBootstrap?: QueueSummariesSharedBootstrap;
    recordScopeImpossible?: boolean;
    recordScopeConstraints?: RecordScopeConstraints | null;
    viewerDisplayTimeZone?: QueueViewerTimezoneMeta;
    laneQueuesMsOut?: { value: number };
}): Promise<DeptPipelineExecSurface | null> {
    const { departmentId, wu, orgId, sharedBootstrap, recordScopeImpossible, recordScopeConstraints, viewerDisplayTimeZone } =
        params;
    try {
        if (String(wu.department_id ?? "").trim() !== departmentId) return null;
        const bundle = tryLoadWorkUnitQueueDefinitionBundle(wu.queue_definition);
        if (!bundle) return null;
        const def = bundle.def;
        // extractPipelineExecutionLanes uses getQueueUiConfig which normalizes
        // domain_with_attention → pipeline_with_attention, so check lanes not raw layout.
        const lanes = extractPipelineExecutionLanes(def);
        if (!lanes.length) return null;

        const panelTitle = resolvePipelineExecPanelTitle(def);
        const laneKeySet = new Set(lanes.map((lane) => lane.key));

        const tLanes0 = Date.now();
        const { queues } = await getWorkUnitQueueSummaries({
            orgId,
            workUnitId: wu.id,
            limit: 3,
            includePreviews: false,
            summaryMode: "partial",
            partialQueueKeys: laneKeySet,
            perfTag: `dept_pipeline:${departmentId}`,
            sharedBootstrap,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            preloadedQueueDefinition: {
                queue_definition: wu.queue_definition,
                workUnitMetadata: wu.metadata ?? null,
                departmentId: wu.department_id ?? null,
            },
        });
        if (params.laneQueuesMsOut) params.laneQueuesMsOut.value = Date.now() - tLanes0;
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
            workUnitKey: wu.key ?? null,
            panelTitle,
            lanes: merged,
        } satisfies DeptPipelineExecSurface;
    } catch {
        return null;
    }
}

/**
 * Server-side pipeline probe for dept oper region — no client HTTP fan-out.
 * Probes enrollment_pipeline first; stops after first matching surface.
 */
export async function resolveDeptPipelineExecSurfaceServer(params: {
    departmentId: string;
    candidates: PipelineWorkUnitRow[];
    orgId: string;
    /** When set, only this WU is probed (bootstrap already picked the pipeline WU). */
    pipelineWorkUnit?: DeptPipelineWorkUnitPick | null;
    sharedBootstrap?: QueueSummariesSharedBootstrap;
    recordScopeImpossible?: boolean;
    recordScopeConstraints?: RecordScopeConstraints | null;
    viewerDisplayTimeZone?: QueueViewerTimezoneMeta;
    pipelinePerf?: { lane_queues_ms?: number };
}): Promise<DeptPipelineExecSurface | null> {
    const {
        departmentId,
        candidates,
        orgId,
        pipelineWorkUnit,
        sharedBootstrap,
        recordScopeImpossible,
        recordScopeConstraints,
        viewerDisplayTimeZone,
    } = params;

    if (pipelineWorkUnit) {
        const laneMs = { value: 0 };
        const surface = await probePipelineWorkUnit({
            departmentId,
            wu: pipelineWorkUnit,
            orgId,
            sharedBootstrap,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            laneQueuesMsOut: laneMs,
        });
        if (params.pipelinePerf) params.pipelinePerf.lane_queues_ms = laneMs.value;
        return surface;
    }

    if (!candidates.length) return null;

    const ordered = [...candidates].sort((a, b) => {
        const ak = (a.key ?? "").trim().toLowerCase();
        const bk = (b.key ?? "").trim().toLowerCase();
        if (ak === "enrollment_pipeline") return -1;
        if (bk === "enrollment_pipeline") return 1;
        return 0;
    });

    for (const wu of ordered) {
        const laneMs = { value: 0 };
        const surface = await probePipelineWorkUnit({
            departmentId,
            wu,
            orgId,
            sharedBootstrap,
            recordScopeImpossible,
            recordScopeConstraints,
            viewerDisplayTimeZone,
            laneQueuesMsOut: laneMs,
        });
        if (surface) {
            if (params.pipelinePerf) params.pipelinePerf.lane_queues_ms = laneMs.value;
            return surface;
        }
    }
    return null;
}
