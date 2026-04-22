/**
 * Server-side interpreter: validated opportunity `queue_definition` (v1) → Supabase query.
 * Org-scoped; no client-side filtering as source of truth.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
    isQueueDefinitionV1Opportunity,
    parseQueueDefinitionV1Strict,
    type QueueDefinitionV1Opportunity,
} from "@/lib/rrs/queue/queueDefinitionV1";

export type OpportunityQueueRow = {
    id: string;
    name: string | null;
    status_key: string | null;
    source: string | null;
    assigned_to: string | null;
    quote_total: number | null;
    pipeline_stage_id: string | null;
    customer_id: string | null;
    primary_person_id: string | null;
    location_id: string | null;
    job_date: string | null;
    job_time_window: string | null;
    customer_notes: string | null;
    metadata: unknown;
    created_at: string | null;
    updated_at: string | null;
};

export type ResolveOpportunityQueueResult =
    | {
          ok: true;
          definition: QueueDefinitionV1Opportunity;
          total: number;
          items: OpportunityQueueRow[];
      }
    | { ok: false; error: string; code: "INVALID_DEFINITION" | "QUERY_FAILED" };

const SELECT_COLS =
    "id, name, status_key, source, assigned_to, quote_total, pipeline_stage_id, customer_id, primary_person_id, location_id, job_date, job_time_window, customer_notes, metadata, created_at, updated_at";

/** Terminal opportunity statuses after a successful book-v2 handoff (see workflow_events in seed data). */
const TERMINAL_BOOKED_STATUSES = ["booked", "scheduled"] as const;

async function fetchBookedPipelineStageIds(supabase: SupabaseClient, orgId: string): Promise<string[]> {
    const { data, error } = await supabase
        .from("pipeline_stages")
        .select("id")
        .eq("org_id", orgId)
        .eq("key", "booked");
    if (error || !data?.length) return [];
    return data.map((r) => (r as { id: string }).id);
}

export async function resolveOpportunityQueueFromDefinition(
    supabase: SupabaseClient,
    orgId: string,
    queueDefinitionRaw: unknown
): Promise<ResolveOpportunityQueueResult> {
    const parsed = parseQueueDefinitionV1Strict(queueDefinitionRaw);
    if (!parsed.ok) {
        return { ok: false, error: parsed.error, code: "INVALID_DEFINITION" };
    }
    if (!isQueueDefinitionV1Opportunity(parsed.value)) {
        return {
            ok: false,
            error: "queue_definition must be entity_type opportunity for this interpreter",
            code: "INVALID_DEFINITION",
        };
    }
    const def = parsed.value;
    const filters = def.filters ?? {};

    let q = supabase.from("opportunities").select(SELECT_COLS, { count: "exact" }).eq("org_id", orgId);

    if (filters.status_keys?.length) {
        q = q.in("status_key", filters.status_keys);
    }
    if (filters.pipeline_stage_ids?.length) {
        q = q.in("pipeline_stage_id", filters.pipeline_stage_ids);
    }
    if (filters.source_keys?.length) {
        q = q.in("source", filters.source_keys);
    }
    if (filters.assigned_to?.length) {
        q = q.in("assigned_to", filters.assigned_to);
    }

    const quoteState = filters.quote_state;
    if (quoteState === "no_positive_quote") {
        q = q.or("quote_total.is.null,quote_total.lte.0");
    } else if (quoteState === "has_positive_quote") {
        q = q.gt("quote_total", 0);
    } else if (quoteState === "quoted_not_booked") {
        q = q.gt("quote_total", 0);
        q = q.not(
            "status_key",
            "in",
            `(${TERMINAL_BOOKED_STATUSES.map((s) => `"${s}"`).join(",")})`
        );
        const bookedIds = await fetchBookedPipelineStageIds(supabase, orgId);
        if (bookedIds.length) {
            const inList = `("${bookedIds.join('","')}")`;
            q = q.or(`pipeline_stage_id.is.null,pipeline_stage_id.not.in.${inList}`);
        }
    }

    const sortCol = def.sort.by;
    const asc = def.sort.direction === "asc";
    q = q.order(sortCol, { ascending: asc, nullsFirst: false });
    q = q.limit(def.limit);

    const { data, error, count } = await q;

    if (error) {
        return { ok: false, error: error.message, code: "QUERY_FAILED" };
    }

    const rows = (data ?? []) as OpportunityQueueRow[];
    const total = typeof count === "number" ? count : rows.length;

    return {
        ok: true,
        definition: def,
        total,
        items: rows,
    };
}
