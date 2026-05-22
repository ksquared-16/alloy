import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions, RecordScopeConstraints } from "@/lib/admin/accessScope";
import { departmentIdAllowed } from "@/lib/admin/accessScope";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import {
    getWorkUnitQueueItems,
    getWorkUnitQueueSummaries,
    loadOpportunityNeedsAttentionRows,
    type OpportunityNeedsAttentionLoadResult,
    type QueueSummariesSharedBootstrap,
} from "@/lib/queues/QueueService";
import type { QueueViewerTimezoneMeta } from "@/lib/queues/types";
import { buildWorkUnitScopedNeedsAttentionLaneBuckets } from "@/lib/workspace/buildWorkUnitScopedNeedsAttentionLaneBuckets";
import { resolveWorkUnitBootstrapPrimaryQueueKey } from "@/lib/workspace/resolveWorkUnitBootstrapPrimaryQueueKey";
import { resolveWorkUnitNeedsAttentionExecution } from "@/lib/workspace/resolveWorkUnitNeedsAttentionExecution";
import { workUnitDefinesNeedsAttentionQueue } from "@/lib/workspace/resolveDeptNeedsAttentionWorkUnit";
import type { WorkUnitBootstrapPerfPhases } from "@/lib/workspace/workUnitOperationalBootstrapPerf";
import type { NeedsAttentionBucketWithCount } from "@/lib/opportunities/needsAttentionBuckets";
import type { AttentionReasonCountSummary } from "@/lib/workspace/attentionReasonCountsSummary";
import type { QueueServiceOpportunityNeedsAttentionSemantics } from "@/lib/workspace/opportunityAttentionCountSemantics";

export type WorkUnitOperationalBootstrapQueue = {
    summaries: Awaited<ReturnType<typeof getWorkUnitQueueSummaries>>["queues"];
    deferred_queue_keys?: string[];
    work_unit_scope_total?: number | null;
    work_unit_scope_queue_key?: string | null;
    primary_lane?: {
        queue_key: string;
        route: string;
        items?: unknown[];
        total_omitted?: boolean;
        /** When true, client loads rows via queue items API after shell paint (Card 3). */
        rows_deferred?: boolean;
    };
    attention?: {
        source: "work_unit_needs_attention_lane";
        execution_work_unit_id: string;
        execution_mode: "standalone_work_unit" | "pipeline_work_unit";
        bucket_count_scope: "work_unit_needs_attention_list_cap";
        needs_attention_buckets: NeedsAttentionBucketWithCount[];
        total_matches: number;
        attention_reason_counts: AttentionReasonCountSummary[];
        opportunity_needs_attention_semantics: QueueServiceOpportunityNeedsAttentionSemantics;
        attention_query_ms: number;
        attention_resolver_ms: number;
        attention_candidate_count: number;
        attention_resolver_passes: number;
    };
};

export type WorkUnitOperationalBootstrapPayload = {
    department: {
        id: string;
        name: string | null;
        key: string | null;
        metadata?: unknown;
    };
    work_unit: {
        id: string;
        name: string | null;
        key: string | null;
        department_id: string;
        queue_definition?: unknown;
        metadata?: unknown;
    };
    queue: WorkUnitOperationalBootstrapQueue;
};

export type WorkUnitOperBootstrapContext = {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    workUnitId: string;
    accessDim: AdminAccessScopeDimensions;
    recordScopeImpossible: boolean;
    recordScopeConstraints: RecordScopeConstraints | null;
    viewerDisplayTimeZone: QueueViewerTimezoneMeta;
    sharedBootstrap: QueueSummariesSharedBootstrap;
    focusQueue: string;
    attentionBucketKey: string;
    primaryRowLimit: number;
    omitTotalCount: boolean;
    summariesLimit: number;
    attentionResolverPasses: { count: number };
    /** Skip blocking getWorkUnitQueueItems — return lane key + route only. */
    deferPrimaryLaneRows?: boolean;
};

type AttentionBootstrapOutcome = {
    preloadedAttention?: OpportunityNeedsAttentionLoadResult;
    attentionBlock?: WorkUnitOperationalBootstrapQueue["attention"];
};

async function loadWorkUnitBootstrapAttention(params: {
    supabase: SupabaseClient;
    orgId: string;
    departmentId: string;
    departmentMetadata: unknown;
    workUnitMetadata: unknown;
    accessDim: AdminAccessScopeDimensions;
    recordScopeImpossible: boolean;
    recordScopeConstraints: RecordScopeConstraints | null;
    sharedBootstrap: QueueSummariesSharedBootstrap;
    naExecution: NonNullable<ReturnType<typeof resolveWorkUnitNeedsAttentionExecution>>;
    attentionResolverPasses: { count: number };
    phases: WorkUnitBootstrapPerfPhases;
}): Promise<AttentionBootstrapOutcome> {
    const {
        supabase,
        orgId,
        departmentMetadata,
        workUnitMetadata,
        accessDim,
        recordScopeImpossible,
        recordScopeConstraints,
        sharedBootstrap,
        naExecution,
        attentionResolverPasses,
        phases,
    } = params;

    const tAttention0 = Date.now();
    const oppDefs = sharedBootstrap.opportunityStatusDefs;
    const attentionConfig = resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata);
    const refUtc = new Date();
    const sort = [{ column: "updated_at", ascending: true as const }];
    const loadPerf: {
        query_ms?: number;
        resolver_ms?: number;
        membership_filter_ms?: number;
    } = {};

    const preloadedAttention = await loadOpportunityNeedsAttentionRows({
        supabase,
        orgId,
        workUnitId: naExecution.id,
        sort,
        now: refUtc,
        opportunityStatusDefs: oppDefs,
        attentionConfig,
        recordScopeConstraints,
        columnSelect: "resolver_minimal",
        skipPostFilterSort: true,
        perf: loadPerf,
    });
    attentionResolverPasses.count += 1;

    const bucketPerf: {
        rules_ms?: number;
        query_ms?: number;
        resolver_ms?: number;
        membership_filter_ms?: number;
        bucket_merge_ms?: number;
        candidate_count?: number;
    } = {};
    const scoped = await buildWorkUnitScopedNeedsAttentionLaneBuckets({
        supabase,
        orgId,
        workUnitId: naExecution.id,
        workUnitMetadata,
        departmentMetadata,
        accessDim,
        recordScopeImpossible,
        recordScopeConstraints,
        opportunityStatusDefs: oppDefs,
        preloadedAttention,
        perf: bucketPerf,
    });

    phases.attention_ms = Date.now() - tAttention0;
    phases.attention_query_ms = loadPerf.query_ms;
    phases.attention_resolver_ms = loadPerf.resolver_ms;
    phases.attention_candidate_count = preloadedAttention.raw_candidates_fetched;
    phases.attention_resolver_passes = attentionResolverPasses.count;
    phases.attention_rules_ms = bucketPerf.rules_ms;
    phases.attention_bucket_merge_ms = bucketPerf.bucket_merge_ms;

    return {
        preloadedAttention,
        attentionBlock: {
            source: "work_unit_needs_attention_lane",
            execution_work_unit_id: naExecution.id,
            execution_mode: naExecution.mode,
            bucket_count_scope: "work_unit_needs_attention_list_cap",
            needs_attention_buckets: scoped.needs_attention_buckets,
            total_matches: scoped.total_matches,
            attention_reason_counts: scoped.attention_reason_counts,
            opportunity_needs_attention_semantics: scoped.opportunity_needs_attention_semantics,
            attention_query_ms: loadPerf.query_ms ?? 0,
            attention_resolver_ms: loadPerf.resolver_ms ?? 0,
            attention_candidate_count: preloadedAttention.raw_candidates_fetched,
            attention_resolver_passes: attentionResolverPasses.count,
        },
    };
}

export async function loadWorkUnitOperationalBootstrap(params: {
    ctx: WorkUnitOperBootstrapContext;
    phases: WorkUnitBootstrapPerfPhases;
}): Promise<
    | { payload: WorkUnitOperationalBootstrapPayload; phases: WorkUnitBootstrapPerfPhases }
    | { error: string; status: number }
> {
    const { ctx, phases } = params;
    const {
        supabase,
        orgId,
        departmentId,
        workUnitId,
        accessDim,
        recordScopeImpossible,
        recordScopeConstraints,
        viewerDisplayTimeZone,
        sharedBootstrap,
        focusQueue,
        attentionBucketKey,
        primaryRowLimit,
        omitTotalCount,
        summariesLimit,
        attentionResolverPasses,
        deferPrimaryLaneRows,
    } = ctx;

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
            .select("id, key, name, metadata, department_id, queue_definition")
            .eq("id", workUnitId)
            .eq("org_id", orgId)
            .maybeSingle(),
    ]);
    phases.dept_fetch_ms = Date.now() - tFetch0;
    phases.work_unit_fetch_ms = phases.dept_fetch_ms;

    if (deptRes.error) {
        return { error: deptRes.error.message, status: 500 };
    }
    if (wuRes.error) {
        return { error: wuRes.error.message, status: 500 };
    }
    const deptRow = deptRes.data;
    const wuRow = wuRes.data;
    if (!deptRow || !wuRow) {
        return { error: "Not found", status: 404 };
    }

    const wuDeptId = String((wuRow as { department_id?: string }).department_id ?? "").trim();
    if (wuDeptId !== departmentId) {
        return { error: "Work unit does not belong to this department", status: 400 };
    }

    const departmentMetadata = (deptRow as { metadata?: unknown }).metadata ?? null;
    const workUnitMetadata = (wuRow as { metadata?: unknown }).metadata ?? null;
    const queueDefinition = (wuRow as { queue_definition?: unknown }).queue_definition;

    const preloadedQueueDefinition = {
        queue_definition: queueDefinition,
        workUnitMetadata,
        departmentId,
    };

    const naExecution = resolveWorkUnitNeedsAttentionExecution(
        {
            id: workUnitId,
            key: (wuRow as { key?: string | null }).key ?? null,
            metadata: workUnitMetadata,
            department_id: wuDeptId,
            queue_definition: queueDefinition,
        },
        departmentId
    );
    const attentionEligible = Boolean(naExecution && workUnitDefinesNeedsAttentionQueue(queueDefinition));

    const tParallel0 = Date.now();
    const summariesP = (async () => {
        const t0 = Date.now();
        const result = await getWorkUnitQueueSummaries({
            orgId,
            workUnitId,
            preloadedQueueDefinition,
            limit: summariesLimit,
            includePreviews: false,
            summaryMode: "all",
            sharedBootstrap,
            viewerDisplayTimeZone,
            recordScopeImpossible,
            recordScopeConstraints,
        });
        phases.queue_summaries_ms = Date.now() - t0;
        return result;
    })();

    const attentionP = (async (): Promise<AttentionBootstrapOutcome> => {
        if (!attentionEligible || !naExecution) {
            phases.attention_ms = 0;
            return {};
        }
        return loadWorkUnitBootstrapAttention({
            supabase,
            orgId,
            departmentId,
            departmentMetadata,
            workUnitMetadata,
            accessDim,
            recordScopeImpossible,
            recordScopeConstraints,
            sharedBootstrap,
            naExecution,
            attentionResolverPasses,
            phases,
        });
    })();

    const [summariesResult, attentionOutcome] = await Promise.all([summariesP, attentionP]);
    phases.summaries_attention_parallel_ms = Date.now() - tParallel0;
    phases.summaries_attention_parallel = true;

    const preloadedAttention = attentionOutcome.preloadedAttention;
    const attentionBlock = attentionOutcome.attentionBlock;

    const primaryQueueKey = resolveWorkUnitBootstrapPrimaryQueueKey(
        { queue_definition: queueDefinition },
        summariesResult.queues,
        focusQueue
    );

    const primaryIsNeedsAttention =
        primaryQueueKey != null && primaryQueueKey.trim().toLowerCase() === "needs_attention";
    phases.primary_lane_wait_on =
        primaryQueueKey == null ? "none" : primaryIsNeedsAttention ? "needs_attention" : "summaries_only";

    let primary_lane: WorkUnitOperationalBootstrapQueue["primary_lane"];
    if (primaryQueueKey) {
        const rowRoute = `/api/admin/queues/${encodeURIComponent(workUnitId)}/${encodeURIComponent(primaryQueueKey)}`;
        if (deferPrimaryLaneRows) {
            phases.primary_lane_rows_deferred = true;
            phases.primary_lane_rows_ms = 0;
            phases.deferred_rows_source = "client_queue_items_api";
            primary_lane = {
                queue_key: primaryQueueKey,
                route: rowRoute,
                rows_deferred: true,
                ...(omitTotalCount ? { total_omitted: true } : {}),
            };
        } else {
            const tRows0 = Date.now();
            const { result } = await getWorkUnitQueueItems({
                orgId,
                workUnitId,
                queueKey: primaryQueueKey,
                limit: primaryRowLimit,
                offset: 0,
                omitTotalCount,
                recordScopeImpossible,
                recordScopeConstraints,
                viewerDisplayTimeZone,
                attentionBucketKey: primaryIsNeedsAttention ? attentionBucketKey : null,
                preloadedQueueDefinition,
                sharedBootstrap,
                preloadedAttentionPack: primaryIsNeedsAttention ? preloadedAttention : undefined,
            });
            phases.primary_lane_rows_ms = Date.now() - tRows0;
            phases.primary_lane_rows_deferred = false;
            primary_lane = {
                queue_key: primaryQueueKey,
                route: rowRoute,
                items: result.items as unknown[],
                ...(result.total_omitted ? { total_omitted: true } : {}),
            };
        }
    } else {
        phases.primary_lane_rows_deferred = deferPrimaryLaneRows ? true : undefined;
    }

    phases.pipeline_ms = 0;

    const payload: WorkUnitOperationalBootstrapPayload = {
        department: {
            id: String((deptRow as { id: string }).id),
            name: (deptRow as { name?: string | null }).name ?? null,
            key: (deptRow as { key?: string | null }).key ?? null,
            metadata: departmentMetadata,
        },
        work_unit: {
            id: workUnitId,
            name: (wuRow as { name?: string | null }).name ?? null,
            key: (wuRow as { key?: string | null }).key ?? null,
            department_id: wuDeptId,
            queue_definition: queueDefinition,
            metadata: workUnitMetadata,
        },
        queue: {
            summaries: summariesResult.queues,
            ...(summariesResult.deferred_queue_keys
                ? { deferred_queue_keys: summariesResult.deferred_queue_keys }
                : {}),
            ...(typeof summariesResult.work_unit_scope_total === "number"
                ? { work_unit_scope_total: summariesResult.work_unit_scope_total }
                : {}),
            ...(summariesResult.work_unit_scope_queue_key
                ? { work_unit_scope_queue_key: summariesResult.work_unit_scope_queue_key }
                : {}),
            ...(primary_lane ? { primary_lane } : {}),
            ...(attentionBlock ? { attention: attentionBlock } : {}),
        },
    };

    return { payload, phases };
}
