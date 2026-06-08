import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions, RecordScopeConstraints } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import {
    getWorkUnitQueueItems,
    loadOpportunityNeedsAttentionRows,
    type OpportunityNeedsAttentionLoadResult,
    type QueueSummariesSharedBootstrap,
} from "@/lib/queues/QueueService";
import type { QueueViewerTimezoneMeta } from "@/lib/queues/types";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import { resolveWorkUnitNeedsAttentionExecution } from "@/lib/workspace/resolveWorkUnitNeedsAttentionExecution";
import { workUnitDefinesNeedsAttentionQueue } from "@/lib/workspace/resolveDeptNeedsAttentionWorkUnit";

/** Max lane row payloads per lane-previews request (avoids parallel storms). */
export const WORK_UNIT_LANE_PREVIEW_MAX_LANES = 6;
/** Max attention-bucket slices per lane-previews request. */
export const WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS = 4;
/** Row cap per preview lane (matches work-unit list first page). */
export const WORK_UNIT_LANE_PREVIEW_ROW_LIMIT = 20;

export type WorkUnitLanePreviewEntry = {
    queue_key: string;
    attention_bucket: string | null;
    route: string;
    queue: {
        key: string;
        label: string;
        description?: string;
        entity_type: "job" | "schedule" | "opportunity";
        priority: "standard" | "attention" | "critical";
        display: "list" | "cards";
    };
    items: unknown[];
    total: number;
    limit: number;
    offset: number;
    total_omitted?: boolean;
};

export type WorkUnitLanePreviewBundle = {
    previews: WorkUnitLanePreviewEntry[];
    capped: boolean;
};

export type WorkUnitLanePreviewBundleContext = {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    workUnitId: string;
    accessDim: AdminAccessScopeDimensions;
    recordScopeImpossible: boolean;
    recordScopeConstraints: RecordScopeConstraints | null;
    viewerDisplayTimeZone: QueueViewerTimezoneMeta;
    sharedBootstrap: QueueSummariesSharedBootstrap;
    rowLimit: number;
    omitTotalCount: boolean;
};

function dedupeLaneRequests(
    queueKeys: string[],
    attentionBuckets: string[],
    primaryQueueKey: string | null
): { lanes: string[]; buckets: string[] } {
    const primary = (primaryQueueKey ?? "").trim().toLowerCase();
    const laneSet = new Set<string>();
    for (const k of queueKeys) {
        const q = k.trim();
        if (!q || q.toLowerCase() === "needs_attention") continue;
        if (primary && q.toLowerCase() === primary) continue;
        laneSet.add(q);
        if (laneSet.size >= WORK_UNIT_LANE_PREVIEW_MAX_LANES) break;
    }
    const bucketSet = new Set<string>();
    for (const b of attentionBuckets) {
        const bk = b.trim();
        if (!bk) continue;
        bucketSet.add(bk);
        if (bucketSet.size >= WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS) break;
    }
    return { lanes: [...laneSet], buckets: [...bucketSet] };
}

async function loadAttentionPackOnce(
    ctx: WorkUnitLanePreviewBundleContext,
    wuRow: {
        id: string;
        key?: string | null;
        metadata?: unknown;
        department_id?: string;
        queue_definition?: unknown;
    }
): Promise<OpportunityNeedsAttentionLoadResult | undefined> {
    const naExecution = resolveWorkUnitNeedsAttentionExecution(
        {
            id: ctx.workUnitId,
            key: wuRow.key ?? null,
            metadata: wuRow.metadata ?? null,
            department_id: String(wuRow.department_id ?? ctx.departmentId),
            queue_definition: wuRow.queue_definition,
        },
        ctx.departmentId
    );
    if (!naExecution || !workUnitDefinesNeedsAttentionQueue(wuRow.queue_definition)) {
        return undefined;
    }
    const oppDefs = ctx.sharedBootstrap.opportunityStatusDefs;
    const attentionConfig = resolveOpportunityAttentionConfigFromMetadata(wuRow.metadata);
    return loadOpportunityNeedsAttentionRows({
        supabase: ctx.supabase,
        orgId: ctx.orgId,
        workUnitId: naExecution.id,
        sort: [{ column: "updated_at", ascending: true }],
        now: new Date(),
        opportunityStatusDefs: oppDefs,
        attentionConfig,
        recordScopeConstraints: ctx.recordScopeConstraints,
        columnSelect: "resolver_minimal",
        skipPostFilterSort: true,
    });
}

/**
 * Bounded lane preview bundle for work-unit pill cache warm-up.
 * Queue rows are previews only — not drawer/entity truth.
 */
export async function loadWorkUnitLanePreviewBundle(params: {
    ctx: WorkUnitLanePreviewBundleContext;
    queueKeys: string[];
    attentionBucketKeys: string[];
    primaryQueueKey?: string | null;
}): Promise<WorkUnitLanePreviewBundle | { error: string; status: number }> {
    const { ctx } = params;
    if (!departmentIdAllowed(ctx.accessDim, ctx.departmentId)) {
        return { error: "Not found", status: 404 };
    }

    const wuRes = await ctx.supabase
        .from("work_units")
        .select("id, key, name, metadata, department_id, queue_definition")
        .eq("id", ctx.workUnitId)
        .eq("org_id", ctx.orgId)
        .maybeSingle();
    if (wuRes.error) {
        return { error: wuRes.error.message, status: 500 };
    }
    const wuRow = wuRes.data;
    if (!wuRow) {
        return { error: "Not found", status: 404 };
    }
    const wuDeptId = String((wuRow as { department_id?: string }).department_id ?? "").trim();
    if (wuDeptId !== ctx.departmentId) {
        return { error: "Work unit does not belong to this department", status: 400 };
    }

    const { lanes, buckets } = dedupeLaneRequests(
        params.queueKeys,
        params.attentionBucketKeys,
        params.primaryQueueKey ?? null
    );
    const capped =
        params.queueKeys.length > WORK_UNIT_LANE_PREVIEW_MAX_LANES ||
        params.attentionBucketKeys.length > WORK_UNIT_LANE_PREVIEW_MAX_ATTENTION_BUCKETS;

    const preloadedQueueDefinition = {
        queue_definition: (wuRow as { queue_definition?: unknown }).queue_definition,
        workUnitMetadata: (wuRow as { metadata?: unknown }).metadata ?? null,
        departmentId: ctx.departmentId,
    };

    let preloadedAttention: OpportunityNeedsAttentionLoadResult | undefined;
    if (buckets.length > 0 || lanes.some((k) => k.trim().toLowerCase() === "needs_attention")) {
        preloadedAttention = await loadAttentionPackOnce(ctx, wuRow as Parameters<typeof loadAttentionPackOnce>[1]);
    }

    const previews: WorkUnitLanePreviewEntry[] = [];

    for (const queueKey of lanes) {
        const { result } = await getWorkUnitQueueItems({
            orgId: ctx.orgId,
            workUnitId: ctx.workUnitId,
            queueKey,
            limit: ctx.rowLimit,
            offset: 0,
            omitTotalCount: ctx.omitTotalCount,
            recordScopeImpossible: ctx.recordScopeImpossible,
            recordScopeConstraints: ctx.recordScopeConstraints,
            viewerDisplayTimeZone: ctx.viewerDisplayTimeZone,
            preloadedQueueDefinition,
            sharedBootstrap: ctx.sharedBootstrap,
            preloadedAttentionPack:
                queueKey.trim().toLowerCase() === "needs_attention" ? preloadedAttention : undefined,
        });
        const route = `/api/admin/queues/${encodeURIComponent(ctx.workUnitId)}/${encodeURIComponent(queueKey)}`;
        previews.push({
            queue_key: queueKey,
            attention_bucket: null,
            route,
            queue: result.queue,
            items: result.items as unknown[],
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            ...(result.total_omitted ? { total_omitted: true } : {}),
        });
    }

    for (const bucketKey of buckets) {
        const { result } = await getWorkUnitQueueItems({
            orgId: ctx.orgId,
            workUnitId: ctx.workUnitId,
            queueKey: "needs_attention",
            limit: ctx.rowLimit,
            offset: 0,
            omitTotalCount: ctx.omitTotalCount,
            recordScopeImpossible: ctx.recordScopeImpossible,
            recordScopeConstraints: ctx.recordScopeConstraints,
            viewerDisplayTimeZone: ctx.viewerDisplayTimeZone,
            attentionBucketKey: bucketKey,
            preloadedQueueDefinition,
            sharedBootstrap: ctx.sharedBootstrap,
            preloadedAttentionPack: preloadedAttention,
        });
        const qs = new URLSearchParams({
            limit: String(ctx.rowLimit),
            offset: "0",
            omit_total_count: ctx.omitTotalCount ? "true" : "false",
            attention_bucket: bucketKey,
        });
        const route = `/api/admin/queues/${encodeURIComponent(ctx.workUnitId)}/needs_attention?${qs.toString()}`;
        previews.push({
            queue_key: "needs_attention",
            attention_bucket: bucketKey,
            route,
            queue: result.queue,
            items: result.items as unknown[],
            total: result.total,
            limit: result.limit,
            offset: result.offset,
            ...(result.total_omitted ? { total_omitted: true } : {}),
        });
    }

    return { previews, capped };
}
