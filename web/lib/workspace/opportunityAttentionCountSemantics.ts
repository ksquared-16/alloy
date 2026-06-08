import { OPPORTUNITY_ATTENTION_RESOLVER_VERSION } from "@/lib/opportunities/opportunityAttentionResolver";

/** Raw PostgREST window for standalone attention builders — not full-org exhaustive. */
export type StandaloneOpportunityAttentionEvaluation = {
    resolver_version: typeof OPPORTUNITY_ATTENTION_RESOLVER_VERSION;
    row_window_cap: number;
    raw_candidates_fetched: number;
    /** True when the capped query returned exactly `row_window_cap` rows (there may be more beyond the sort window). */
    row_window_saturated: boolean;
    sort: "updated_at_asc";
    /**
     * Config source differs; cohort is always org opportunities filtered by admin access scope (never `work_unit_id`).
     */
    cohort: "work_unit_attention_config" | "department_attention_preview_config";
};

/**
 * QueueService needs_attention lane: candidates fetched for the lane, filtered by {@link resolveOpportunityAttention}.
 */
export type QueueServiceOpportunityNeedsAttentionSemantics = {
    resolver_version: typeof OPPORTUNITY_ATTENTION_RESOLVER_VERSION;
    candidate_fetch_cap: number;
    raw_candidates_fetched: number;
    candidate_window_saturated: boolean;
    cohort: "work_unit_opportunities";
    fetch_mode: "list_cap" | "summary_cap";
};

export function buildStandaloneAttentionEvaluation(params: {
    rowWindowCap: number;
    rawCandidatesFetched: number;
    cohort: StandaloneOpportunityAttentionEvaluation["cohort"];
}): StandaloneOpportunityAttentionEvaluation {
    return {
        resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
        row_window_cap: params.rowWindowCap,
        raw_candidates_fetched: params.rawCandidatesFetched,
        row_window_saturated: params.rawCandidatesFetched >= params.rowWindowCap,
        sort: "updated_at_asc",
        cohort: params.cohort,
    };
}

export function buildQueueServiceAttentionSemantics(params: {
    candidateFetchCap: number;
    rawCandidatesFetched: number;
    fetchMode: QueueServiceOpportunityNeedsAttentionSemantics["fetch_mode"];
}): QueueServiceOpportunityNeedsAttentionSemantics {
    return {
        resolver_version: OPPORTUNITY_ATTENTION_RESOLVER_VERSION,
        candidate_fetch_cap: params.candidateFetchCap,
        raw_candidates_fetched: params.rawCandidatesFetched,
        candidate_window_saturated: params.rawCandidatesFetched >= params.candidateFetchCap,
        cohort: "work_unit_opportunities",
        fetch_mode: params.fetchMode,
    };
}
