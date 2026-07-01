/**
 * Legacy Growth opportunity queue scope helpers (Card 1 consolidation).
 *
 * **Semantics:** Filters apply to **org-scoped** `opportunities` queries. Callers must **not**
 * assume `work_unit_id` scoping — this differs from {@link getWorkUnitQueueItems} / QueueService,
 * which always constrains rows to the work unit.
 *
 * Placement / priority orchestration must integrate via QueueService only (see sprint Card 0.5).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { QueueDefinitionV1Opportunity } from "@/lib/rrs/queue/queueDefinitionV1";

/** Terminal opportunity statuses after a successful book-v2 handoff (mirrors resolveOpportunityQueue). */
const TERMINAL_BOOKED_STATUSES = ["booked", "scheduled"] as const;

export async function fetchBookedPipelineStageIds(supabase: SupabaseClient, orgId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", "booked");
    if (error || !data?.length) return [];
    return data.map((r) => (r as { id: string }).id);
}

/**
 * Applies strict Growth opportunity `filters` object to an existing opportunities query builder.
 * Idempotent only when called once per query construction.
 *
 * PostgREST builder typing is intentionally loose — callers pass the chained `.from().select()` query.
 */
export async function applyGrowthOpportunityFiltersToQuery(
    supabase: SupabaseClient,
    orgId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase filter builder chain
    q: any,
    filters: QueueDefinitionV1Opportunity["filters"] | undefined
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<any> {
    const f = filters ?? {};
    let qb = q;

    if (f.status_keys?.length) {
        qb = qb.in("status_key", f.status_keys);
    }
    if (f.pipeline_stage_ids?.length) {
        qb = qb.in("pipeline_stage_id", f.pipeline_stage_ids);
    }
    if (f.source_keys?.length) {
        qb = qb.in("source", f.source_keys);
    }
    if (f.assigned_to?.length) {
        qb = qb.in("assigned_to", f.assigned_to);
    }

    const quoteState = f.quote_state;
    if (quoteState === "no_positive_quote") {
        qb = qb.or("quote_total.is.null,quote_total.lte.0");
    } else if (quoteState === "has_positive_quote") {
        qb = qb.gt("quote_total", 0);
    } else if (quoteState === "quoted_not_booked") {
        qb = qb.gt("quote_total", 0);
        qb = qb.not(
            "status_key",
            "in",
            `(${TERMINAL_BOOKED_STATUSES.map((s) => `"${s}"`).join(",")})`
        );
        const bookedIds = await fetchBookedPipelineStageIds(supabase, orgId);
        if (bookedIds.length) {
            const inList = `("${bookedIds.join('","')}")`;
            qb = qb.or(`pipeline_stage_id.is.null,pipeline_stage_id.not.in.${inList}`);
        }
    }

    return qb;
}
