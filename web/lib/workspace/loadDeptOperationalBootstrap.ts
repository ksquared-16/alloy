import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions, RecordScopeConstraints } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import {
    buildQueueSummariesSharedBootstrap,
    getDepartmentWorkUnitQueueSummaries,
    type QueueSummaryRequestMode,
} from "@/lib/queues/QueueService";
import type { QueueViewerTimezoneMeta } from "@/lib/queues/types";
import { loadDeptAttentionPreviewServer, type DeptAttentionPreviewPayload } from "@/lib/workspace/loadDeptAttentionPreviewServer";
import { resolveDeptPipelineExecSurfaceServer } from "@/lib/workspace/resolveDeptPipelineExecSurfaceServer";
import type { DeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";
import { logDeptOperationalBootstrapPerf, type DeptBootstrapPerfPhases } from "@/lib/workspace/deptOperationalBootstrapPerf";
import { pickDeptPipelineWorkUnit } from "@/lib/workspace/pickDeptPipelineWorkUnit";
import type { ResolvedActionForClient } from "@/lib/admin/actions/types";
import type { WorkspaceKpiPlacementRow } from "@/lib/kpi/types";

export type DeptOperationalBootstrapPayload = {
    department: {
        id: string;
        name: string | null;
        key: string | null;
        metadata?: unknown;
    };
    work_units: Array<{ id: string; name: string | null; key: string | null }>;
    summaries: { work_units: Array<{ id: string; queues: unknown[]; error?: string; work_unit_scope_total?: number | null; work_unit_scope_queue_key?: string | null }> };
    attention: DeptAttentionPreviewPayload;
    pipeline_surface: DeptPipelineExecSurface | null;
};

export type DeptOperationalBootstrapExtras = {
    kpi_placements?: { items: WorkspaceKpiPlacementRow[]; scope_has_placements: boolean };
    right_rail_actions?: ResolvedActionForClient[];
};

export async function loadDeptOperationalBootstrap(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    accessDim: AdminAccessScopeDimensions;
    recordScopeImpossible: boolean;
    recordScopeConstraints: RecordScopeConstraints | null;
    viewerDisplayTimeZone: QueueViewerTimezoneMeta;
    summaries: {
        limit?: number;
        workUnitConcurrency?: number;
        includePreviews?: boolean;
        countAccuracy?: "exact" | "planned";
        summaryMode?: QueueSummaryRequestMode;
        focusQueueKey?: string | null;
        priorityBudget?: number;
    };
    attentionWorkUnitIdParam?: string | null;
}): Promise<
    | { payload: DeptOperationalBootstrapPayload; phases: DeptBootstrapPerfPhases }
    | { error: string; status: number }
> {
    const { supabase, orgId, departmentId, accessDim } = params;
    const loaderT0 = Date.now();
    const phases: DeptBootstrapPerfPhases = {};

    if (!departmentIdAllowed(accessDim, departmentId)) {
        return { error: "Not found", status: 404 };
    }

    const tFetch0 = Date.now();
    const [deptRes, wuRes] = await Promise.all([
        supabase
            .from("departments")
            .select("id, key, name, metadata")
            .eq("id", departmentId)
            .eq("org_id", orgId)
            .maybeSingle(),
        supabase
            .from("work_units")
            .select("id, key, name, queue_definition, metadata, department_id")
            .eq("org_id", orgId)
            .eq("department_id", departmentId)
            .order("sort_order", { ascending: true }),
    ]);
    phases.dept_fetch_ms = Date.now() - tFetch0;
    phases.work_units_fetch_ms = phases.dept_fetch_ms;

    if (deptRes.error) {
        return { error: deptRes.error.message, status: 500 };
    }
    const deptRow = deptRes.data;
    if (!deptRow) {
        return { error: "Not found", status: 404 };
    }

    const wuRows = wuRes.data ?? [];
    const workUnits = wuRows.map((w) => ({
        id: String((w as { id: string }).id),
        name: (w as { name?: string | null }).name ?? null,
        key: (w as { key?: string | null }).key ?? null,
    }));
    const workUnitIds = workUnits.map((w) => w.id);

    const pipelineWorkUnit = pickDeptPipelineWorkUnit(
        wuRows.map((w) => ({
            id: String((w as { id: string }).id),
            key: (w as { key?: string | null }).key ?? null,
            queue_definition: (w as { queue_definition?: unknown }).queue_definition,
            department_id: (w as { department_id?: string | null }).department_id ?? null,
            metadata: (w as { metadata?: unknown }).metadata,
        })),
        departmentId
    );

    const summaryWorkUnitIds = workUnitIds.filter((id) => {
        if (pipelineWorkUnit && id === pipelineWorkUnit.id) return false;
        const wu = workUnits.find((w) => w.id === id);
        const key = (wu?.key ?? "").trim().toLowerCase();
        if (key === "needs_attention") return false;
        return true;
    });
    phases.skipped_summary_wu_ids = workUnitIds.length - summaryWorkUnitIds.length;
    phases.summary_wu_count = summaryWorkUnitIds.length;
    phases.pipeline_wu_count = pipelineWorkUnit ? 1 : 0;

    const workUnitPreloadById = new Map(
        wuRows.map((w) => [
            String((w as { id: string }).id),
            {
                queue_definition: (w as { queue_definition?: unknown }).queue_definition,
                metadata: (w as { metadata?: unknown }).metadata ?? null,
                department_id: (w as { department_id?: string | null }).department_id ?? null,
            },
        ])
    );

    const departmentMetadata = (deptRow as { metadata?: unknown }).metadata ?? null;

    const tShared0 = Date.now();
    const sharedBootstrap = await buildQueueSummariesSharedBootstrap(orgId);
    phases.shared_bootstrap_ms = Date.now() - tShared0;

    const wuRowsLite = wuRows.map((w) => ({
        id: String((w as { id: string }).id),
        key: (w as { key?: string | null }).key ?? null,
        metadata: (w as { metadata?: unknown }).metadata,
        department_id: (w as { department_id?: string | null }).department_id ?? null,
    }));

    const tParallel0 = Date.now();
    const summariesP = (async () => {
        const t0 = Date.now();
        const out =
            summaryWorkUnitIds.length === 0
                ? { work_units: [] as Awaited<ReturnType<typeof getDepartmentWorkUnitQueueSummaries>>["work_units"] }
                : await getDepartmentWorkUnitQueueSummaries({
                      orgId,
                      departmentId,
                      workUnitIds: summaryWorkUnitIds,
                      workUnitPreloadById,
                      limit: params.summaries.limit,
                      workUnitConcurrency: params.summaries.workUnitConcurrency,
                      includePreviews: params.summaries.includePreviews,
                      countAccuracy: params.summaries.countAccuracy,
                      summaryMode: params.summaries.summaryMode,
                      focusQueueKey: params.summaries.focusQueueKey,
                      priorityBudget: params.summaries.priorityBudget,
                      viewerDisplayTimeZone: params.viewerDisplayTimeZone,
                      recordScopeImpossible: params.recordScopeImpossible,
                      recordScopeConstraints: params.recordScopeConstraints,
                  });
        phases.queue_summaries_ms = Date.now() - t0;
        return out;
    })();

    const attentionP = (async () => {
        const t0 = Date.now();
        const attentionPerf: {
            candidate_fetch_ms?: number;
            resolver_ms?: number;
            bucket_merge_ms?: number;
        } = {};
        const out = await loadDeptAttentionPreviewServer({
            supabase,
            orgId,
            departmentId,
            departmentMetadata,
            accessDim,
            workUnitIdParam: params.attentionWorkUnitIdParam,
            workUnitRows: wuRowsLite,
            recordScopeImpossible: params.recordScopeImpossible,
            recordScopeConstraints: params.recordScopeConstraints,
            opportunityStatusDefs: sharedBootstrap.opportunityStatusDefs,
            attentionPerf,
        });
        phases.attention_ms = Date.now() - t0;
        phases.attention_candidate_fetch_ms = attentionPerf.candidate_fetch_ms;
        phases.attention_resolver_ms = attentionPerf.resolver_ms;
        phases.attention_bucket_merge_ms = attentionPerf.bucket_merge_ms;
        return out;
    })();

    const pipelineP = (async () => {
        const t0 = Date.now();
        const pipelineCandidates = wuRows
            .filter((w) => String((w as { key?: string | null }).key ?? "").trim().toLowerCase() !== "needs_attention")
            .map((w) => ({
                id: String((w as { id: string }).id),
                key: (w as { key?: string | null }).key ?? null,
                queue_definition: (w as { queue_definition?: unknown }).queue_definition,
                department_id: (w as { department_id?: string | null }).department_id ?? null,
                metadata: (w as { metadata?: unknown }).metadata,
            }));
        const pipelinePerf: { lane_queues_ms?: number } = {};
        const out = await resolveDeptPipelineExecSurfaceServer({
            departmentId,
            candidates: pipelineCandidates,
            orgId,
            pipelineWorkUnit,
            sharedBootstrap,
            recordScopeImpossible: params.recordScopeImpossible,
            recordScopeConstraints: params.recordScopeConstraints,
            viewerDisplayTimeZone: params.viewerDisplayTimeZone,
            pipelinePerf,
        });
        phases.pipeline_ms = Date.now() - t0;
        phases.pipeline_lane_queues_ms = pipelinePerf.lane_queues_ms;
        return out;
    })();

    const [summaries, attention, pipeline_surface] = await Promise.all([summariesP, attentionP, pipelineP]);
    phases.parallel_oper_ms = Date.now() - tParallel0;
    phases.serialize_ms = 0;

    const payload: DeptOperationalBootstrapPayload = {
        department: {
            id: String((deptRow as { id: string }).id),
            name: (deptRow as { name?: string | null }).name ?? null,
            key: (deptRow as { key?: string | null }).key ?? null,
            metadata: departmentMetadata,
        },
        work_units: workUnits,
        summaries,
        attention,
        pipeline_surface,
    };

    return { payload, phases };
}
