import { tryLoadWorkUnitQueueDefinitionBundle } from "@/lib/config/queueDefinitionV2Runtime";
import {
    extractPipelineExecutionLanes,
    resolvePipelineExecPanelTitle,
} from "@/lib/workspace/extractPipelineExecutionLanes";
import { dedupeAdminFetch } from "@/lib/workspace/workspaceAdminFetchDedupe";
import { mapWithConcurrency } from "@/lib/workspace/mapWithConcurrency";

export type DeptPipelineExecSurface = {
    workUnitId: string;
    panelTitle: string;
    lanes: Array<{
        key: string;
        label: string;
        icon: string | null;
        count: number | null;
        countsDeferred: boolean;
    }>;
};

type WorkUnitCandidate = { id: string; key: string | null };

export type WorkUnitDetailSnapshot = {
    queue_definition?: unknown;
    department_id?: string | null;
};

/**
 * Find the first work unit in `candidates` with `pipeline_with_attention` layout and lane counts.
 * Probes candidates in parallel (bounded concurrency) instead of sequential awaits.
 */
export async function resolveDeptPipelineExecSurface(params: {
    departmentId: string;
    candidates: WorkUnitCandidate[];
    init?: RequestInit;
    concurrency?: number;
    /** Skip GET /work-units/:id when bootstrap or another surface already loaded the row. */
    workUnitDetailById?: ReadonlyMap<string, WorkUnitDetailSnapshot>;
}): Promise<DeptPipelineExecSurface | null> {
    const { departmentId, candidates, init, concurrency = 4, workUnitDetailById } = params;
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
            const cached = workUnitDetailById?.get(wu.id);
            let row: WorkUnitDetailSnapshot;
            if (cached) {
                row = cached;
            } else {
                const wuRes = await dedupeAdminFetch(`/api/admin/work-units/${encodeURIComponent(wu.id)}`, init ?? {});
                if (!wuRes.ok) return null;
                row = (await wuRes.json().catch(() => ({}))) as WorkUnitDetailSnapshot;
            }
            if (String(row.department_id ?? "").trim() !== departmentId) return null;
            const bundle = tryLoadWorkUnitQueueDefinitionBundle(row.queue_definition);
            if (!bundle) return null;
            const def = bundle.def;
            if (def.ui?.layout !== "pipeline_with_attention") return null;
            const lanes = extractPipelineExecutionLanes(def);
            if (!lanes.length) return null;

            const panelTitle = resolvePipelineExecPanelTitle(def);

            const sumRes = await dedupeAdminFetch(
                `/api/admin/work-units/${encodeURIComponent(wu.id)}/queues?include_previews=false&count_mode=exact&summary_mode=all&limit=3`,
                init ?? {}
            );
            if (!sumRes.ok) return null;
            const sj = (await sumRes.json().catch(() => ({}))) as {
                queues?: Array<{ key: string; count: number; counts_deferred?: boolean }>;
            };
            const queues = Array.isArray(sj.queues) ? sj.queues : [];
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
