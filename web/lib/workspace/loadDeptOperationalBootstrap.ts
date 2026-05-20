import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions, RecordScopeConstraints } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import {
    getDepartmentWorkUnitQueueSummaries,
    type QueueSummaryRequestMode,
} from "@/lib/queues/QueueService";
import type { QueueViewerTimezoneMeta } from "@/lib/queues/types";
import { loadDeptAttentionPreviewServer, type DeptAttentionPreviewPayload } from "@/lib/workspace/loadDeptAttentionPreviewServer";
import { resolveDeptPipelineExecSurfaceServer } from "@/lib/workspace/resolveDeptPipelineExecSurfaceServer";
import type { DeptPipelineExecSurface } from "@/lib/workspace/resolveDeptPipelineExecSurface";

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
}): Promise<DeptOperationalBootstrapPayload | { error: string; status: number }> {
    const { supabase, orgId, departmentId, accessDim } = params;

    if (!departmentIdAllowed(accessDim, departmentId)) {
        return { error: "Not found", status: 404 };
    }

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

    const pipelineCandidates = wuRows
        .filter((w) => String((w as { key?: string | null }).key ?? "").trim().toLowerCase() !== "needs_attention")
        .map((w) => ({
            id: String((w as { id: string }).id),
            key: (w as { key?: string | null }).key ?? null,
            queue_definition: (w as { queue_definition?: unknown }).queue_definition,
            department_id: (w as { department_id?: string | null }).department_id ?? null,
        }));

    const departmentMetadata = (deptRow as { metadata?: unknown }).metadata ?? null;

    const [summaries, attention, pipeline_surface] = await Promise.all([
        getDepartmentWorkUnitQueueSummaries({
            orgId,
            departmentId,
            workUnitIds,
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
        }),
        loadDeptAttentionPreviewServer({
            supabase,
            orgId,
            departmentId,
            departmentMetadata,
            accessDim,
            workUnitIdParam: params.attentionWorkUnitIdParam,
            workUnitRows: wuRows.map((w) => ({
                id: String((w as { id: string }).id),
                key: (w as { key?: string | null }).key ?? null,
                metadata: (w as { metadata?: unknown }).metadata,
                department_id: (w as { department_id?: string | null }).department_id ?? null,
            })),
        }),
        resolveDeptPipelineExecSurfaceServer({
            departmentId,
            candidates: pipelineCandidates,
            orgId,
            recordScopeImpossible: params.recordScopeImpossible,
            recordScopeConstraints: params.recordScopeConstraints,
            viewerDisplayTimeZone: params.viewerDisplayTimeZone,
        }),
    ]);

    return {
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
}
