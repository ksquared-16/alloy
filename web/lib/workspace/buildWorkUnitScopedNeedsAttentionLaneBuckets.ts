import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { accessScopeRestrictsData, resolveRecordScopeConstraints, type RecordScopeConstraints } from "@/lib/admin/accessScope";
import { fetchEffectiveStatusDefinitions, type StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    applyAttentionConfigLabelsToBuckets,
    bucketCountsFromResolverMatches,
    collectNeedsAttentionResolverMatches,
    resolveNeedsAttentionBucketsWithPrecedence,
    type NeedsAttentionBucketWithCount,
} from "@/lib/opportunities/needsAttentionBuckets";
import { loadOpportunityNeedsAttentionRows, NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP } from "@/lib/queues/QueueService";
import { summarizeAttentionReasonCounts, type AttentionReasonCountSummary } from "@/lib/workspace/attentionReasonCountsSummary";
import { buildQueueServiceAttentionSemantics, type QueueServiceOpportunityNeedsAttentionSemantics } from "@/lib/workspace/opportunityAttentionCountSemantics";

/**
 * Department Needs Attention lane — bucket counts aligned with work-unit execution (`needs_attention` queue).
 * Uses the same candidate fetch cap + resolver membership as {@link loadOpportunityNeedsAttentionRows} /
 * `getWorkUnitQueueItems` for `queueKey === "needs_attention"`.
 */
export async function buildWorkUnitScopedNeedsAttentionLaneBuckets(params: {
    supabase: SupabaseClient;
    orgId: string;
    workUnitId: string;
    workUnitMetadata: unknown | null;
    departmentMetadata: unknown | null;
    accessDim?: AdminAccessScopeDimensions | null;
    /** Dept bootstrap: reuse scope resolution from the route. */
    recordScopeImpossible?: boolean;
    recordScopeConstraints?: RecordScopeConstraints | null;
    opportunityStatusDefs?: StatusDefinitionRow[];
    /** Dept bootstrap perf attribution (optional). */
    perf?: {
        rules_ms?: number;
        query_ms?: number;
        membership_filter_ms?: number;
        resolver_ms?: number;
        bucket_merge_ms?: number;
        candidate_count?: number;
    };
}): Promise<{
    needs_attention_buckets: NeedsAttentionBucketWithCount[];
    /** Unique inquiries matching resolver membership (same set as unfiltered needs_attention tab head). */
    total_matches: number;
    attention_reason_counts: AttentionReasonCountSummary[];
    opportunity_needs_attention_semantics: QueueServiceOpportunityNeedsAttentionSemantics;
    resolver_matches: ReadonlyArray<{ resolved: OpportunityAttentionResult }>;
}> {
    const { supabase, orgId, workUnitId, workUnitMetadata, departmentMetadata, accessDim = null } = params;

    let scopeFilter: RecordScopeConstraints | null = params.recordScopeConstraints ?? null;
    if (params.recordScopeImpossible === true) {
        const semantics = buildQueueServiceAttentionSemantics({
            candidateFetchCap: NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP,
            rawCandidatesFetched: 0,
            fetchMode: "list_cap",
        });
        const cfg = resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata ?? null);
        const bucketDefs = resolveNeedsAttentionBucketsWithPrecedence(workUnitMetadata, departmentMetadata);
        return {
            needs_attention_buckets: applyAttentionConfigLabelsToBuckets(
                bucketCountsFromResolverMatches(bucketDefs, []),
                cfg,
            ),
            total_matches: 0,
            attention_reason_counts: [],
            opportunity_needs_attention_semantics: semantics,
            resolver_matches: [],
        };
    }
    if (scopeFilter == null && accessDim && accessScopeRestrictsData(accessDim)) {
        const c = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
        if (c.impossible) {
            const semantics = buildQueueServiceAttentionSemantics({
                candidateFetchCap: NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP,
                rawCandidatesFetched: 0,
                fetchMode: "list_cap",
            });
            const cfg = resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata ?? null);
            const bucketDefs = resolveNeedsAttentionBucketsWithPrecedence(workUnitMetadata, departmentMetadata);
            return {
                needs_attention_buckets: applyAttentionConfigLabelsToBuckets(
                    bucketCountsFromResolverMatches(bucketDefs, []),
                    cfg,
                ),
                total_matches: 0,
                attention_reason_counts: [],
                opportunity_needs_attention_semantics: semantics,
                resolver_matches: [],
            };
        }
        scopeFilter = c;
    }

    const tRules0 = Date.now();
    const oppDefs =
        params.opportunityStatusDefs ??
        (await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true }));
    if (params.perf) params.perf.rules_ms = Date.now() - tRules0;

    const attentionConfig = resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata ?? null);
    const bucketDefs = resolveNeedsAttentionBucketsWithPrecedence(workUnitMetadata, departmentMetadata);
    const refUtc = new Date();
    const sort = [{ column: "updated_at", ascending: true as const }];

    const loadPerf: { query_ms?: number; resolver_ms?: number; membership_filter_ms?: number } = {};
    const loadOut = await loadOpportunityNeedsAttentionRows({
        supabase,
        orgId,
        workUnitId,
        sort,
        now: refUtc,
        opportunityStatusDefs: oppDefs,
        attentionConfig,
        recordScopeConstraints: scopeFilter,
        columnSelect: "resolver_minimal",
        skipPostFilterSort: true,
        perf: loadPerf,
    });
    if (params.perf) {
        params.perf.query_ms = loadPerf.query_ms;
        params.perf.resolver_ms = loadPerf.resolver_ms;
        params.perf.membership_filter_ms = loadPerf.membership_filter_ms;
        params.perf.candidate_count = loadOut.raw_candidates_fetched;
    }

    const resolver_matches = collectNeedsAttentionResolverMatches(loadOut.resolved_by_id);

    const tBucket0 = Date.now();
    const reasonPairs: { reason_key: string; label: string }[] = [];
    for (const { resolved } of resolver_matches) {
        for (const rr of resolved.reasons) {
            reasonPairs.push({ reason_key: rr.code, label: rr.label });
        }
    }
    const attention_reason_counts = summarizeAttentionReasonCounts(reasonPairs);
    const needs_attention_buckets = applyAttentionConfigLabelsToBuckets(
        bucketCountsFromResolverMatches(bucketDefs, resolver_matches),
        attentionConfig,
    );

    const opportunity_needs_attention_semantics = buildQueueServiceAttentionSemantics({
        candidateFetchCap: loadOut.fetch_cap,
        rawCandidatesFetched: loadOut.raw_candidates_fetched,
        fetchMode: "list_cap",
    });
    if (params.perf) params.perf.bucket_merge_ms = Date.now() - tBucket0;

    return {
        needs_attention_buckets,
        total_matches: resolver_matches.length,
        attention_reason_counts,
        opportunity_needs_attention_semantics,
        resolver_matches,
    };
}
