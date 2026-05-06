import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import { accessScopeRestrictsData, resolveRecordScopeConstraints, type RecordScopeConstraints } from "@/lib/admin/accessScope";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import { resolveOpportunityAttention, type OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import {
    applyAttentionConfigLabelsToBuckets,
    bucketCountsFromResolverMatches,
    resolveNeedsAttentionBucketsWithPrecedence,
    type NeedsAttentionBucketWithCount,
} from "@/lib/opportunities/needsAttentionBuckets";
import {
    loadOpportunityNeedsAttentionRows,
    NEEDS_ATTENTION_OPPORTUNITY_FETCH_CAP,
    opportunityPreviewToResolverEntity,
} from "@/lib/queues/QueueService";
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
}): Promise<{
    needs_attention_buckets: NeedsAttentionBucketWithCount[];
    /** Unique inquiries matching resolver membership (same set as unfiltered needs_attention tab head). */
    total_matches: number;
    attention_reason_counts: AttentionReasonCountSummary[];
    opportunity_needs_attention_semantics: QueueServiceOpportunityNeedsAttentionSemantics;
    resolver_matches: ReadonlyArray<{ resolved: OpportunityAttentionResult }>;
}> {
    const { supabase, orgId, workUnitId, workUnitMetadata, departmentMetadata, accessDim = null } = params;

    let scopeFilter: RecordScopeConstraints | null = null;
    if (accessDim && accessScopeRestrictsData(accessDim)) {
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

    const oppDefs = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const attentionConfig = resolveOpportunityAttentionConfigFromMetadata(workUnitMetadata ?? null);
    const refUtc = new Date();
    const nowMs = refUtc.getTime();
    const sort = [{ column: "updated_at", ascending: true as const }];

    const loadOut = await loadOpportunityNeedsAttentionRows({
        supabase,
        orgId,
        workUnitId,
        sort,
        now: refUtc,
        opportunityStatusDefs: oppDefs,
        attentionConfig,
        recordScopeConstraints: scopeFilter,
    });

    const resolver_matches: { resolved: OpportunityAttentionResult }[] = [];
    for (const row of loadOut.filtered) {
        const resolved = resolveOpportunityAttention({
            opportunity: opportunityPreviewToResolverEntity(row),
            defs: oppDefs,
            config: attentionConfig,
            nowMs,
            optionalSignals: null,
        });
        if (resolved.needs_attention && resolved.primary_reason != null) {
            resolver_matches.push({ resolved });
        }
    }

    const attention_reason_counts = summarizeAttentionReasonCounts(
        resolver_matches.flatMap(({ resolved }) => resolved.reasons.map((rr) => ({ reason_key: rr.code, label: rr.label }))),
    );

    const bucketDefs = resolveNeedsAttentionBucketsWithPrecedence(workUnitMetadata, departmentMetadata);
    const needs_attention_buckets = applyAttentionConfigLabelsToBuckets(
        bucketCountsFromResolverMatches(bucketDefs, resolver_matches),
        attentionConfig,
    );

    const opportunity_needs_attention_semantics = buildQueueServiceAttentionSemantics({
        candidateFetchCap: loadOut.fetch_cap,
        rawCandidatesFetched: loadOut.raw_candidates_fetched,
        fetchMode: "list_cap",
    });

    return {
        needs_attention_buckets,
        total_matches: resolver_matches.length,
        attention_reason_counts,
        opportunity_needs_attention_semantics,
        resolver_matches,
    };
}
