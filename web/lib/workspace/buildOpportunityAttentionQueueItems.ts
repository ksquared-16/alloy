import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    accessScopeRestrictsData,
    applyRecordScopeConstraintsToQuery,
    resolveRecordScopeConstraints,
} from "@/lib/admin/accessScope";
import { buildOpportunityLifecycleFields, effectiveOpportunityQuoteDollars } from "@/lib/admin/opportunityLifecyclePresentation";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import {
    attentionReasonLabel,
    computeOpportunityAttentionReason,
    type OpportunityAttentionRuleConfigV1,
    type OpportunityAttentionInputRow,
} from "@/lib/workspace/opportunityAttentionRules";
import {
    isOpportunityActiveForExecution,
    terminalOpportunityStatusKeysFromDefs,
} from "@/lib/workspace/opportunityExecutionEligibility";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import {
    summarizeAttentionReasonCounts,
    type AttentionReasonCountSummary,
} from "@/lib/workspace/attentionReasonCountsSummary";

const MAX_ROWS = 500;

export type { AttentionReasonCountSummary } from "@/lib/workspace/attentionReasonCountsSummary";

type AttentionCandidateRow = OpportunityAttentionInputRow & {
    name: string | null;
    customer_id: string | null;
    primary_person_id?: string | null;
    location_id?: string | null;
    job_date?: string | null;
    job_time_window?: string | null;
    customer_notes?: string | null;
    metadata?: unknown;
};

/**
 * Shared implementation for opportunity “Needs attention” rows (same rules as the work-unit route).
 * Used by `…/work-units/:id/opportunity-attention-queue` and department preview when the work unit row is absent.
 */
export async function buildOpportunityAttentionQueueItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    rules: OpportunityAttentionRuleConfigV1;
    accessDim?: AdminAccessScopeDimensions | null;
}): Promise<{
    items: WorkspaceOpportunityQueueRuntime["items"];
    rules: OpportunityAttentionRuleConfigV1;
    attention_reason_counts: AttentionReasonCountSummary[];
}> {
    const { supabase, orgId, rules, accessDim = null } = params;

    const oppDefs = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
    const terminalStatusKeys = terminalOpportunityStatusKeysFromDefs(oppDefs);
    const statusLabelByKey = new Map<string, string>();
    for (const d of oppDefs) {
        const k = String(d.status_key ?? "").trim();
        if (!k) continue;
        const label = String(d.status_label ?? "").trim();
        statusLabelByKey.set(k, label || k);
    }

    let oppQ = supabase
        .from("opportunities")
        .select(
            "id, name, status_key, quote_total, customer_id, primary_person_id, location_id, work_unit_id, job_date, job_time_window, customer_notes, metadata, created_at, updated_at"
        )
        .eq("org_id", orgId)
        .order("updated_at", { ascending: true, nullsFirst: false })
        .limit(MAX_ROWS);

    if (accessDim && accessScopeRestrictsData(accessDim)) {
        const c = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
        if (c.impossible) {
            return { items: [], rules, attention_reason_counts: summarizeAttentionReasonCounts([]) };
        }
        oppQ = applyRecordScopeConstraintsToQuery(oppQ, c);
    }

    const { data: rows, error: oppErr } = await oppQ;

    if (oppErr) {
        throw new Error(oppErr.message);
    }

    const nowMs = Date.now();
    const candidates = (rows ?? []) as AttentionCandidateRow[];

    const withReason = candidates
        .map((row) => {
            if (!isOpportunityActiveForExecution({ statusKey: row.status_key, terminalStatusKeys })) {
                return { row, reason: null };
            }
            const reason = computeOpportunityAttentionReason({ row, defs: oppDefs, rules, nowMs });
            return { row, reason };
        })
        .filter((x): x is { row: AttentionCandidateRow; reason: NonNullable<typeof x.reason> } => x.reason != null);

    const enrichById = await enrichOpportunityRowsWithCrmProjection(
        supabase,
        orgId,
        withReason.map((x) => x.row)
    );

    const customerIds = [...new Set(withReason.map((x) => x.row.customer_id).filter(Boolean))] as string[];
    const customerNameById = new Map<string, string | null>();
    if (customerIds.length) {
        const { data: custs } = await supabase
            .from("customers")
            .select("id, name")
            .eq("org_id", orgId)
            .in("id", customerIds);
        for (const c of custs ?? []) {
            const r = c as { id: string; name: string | null };
            customerNameById.set(r.id, r.name ?? null);
        }
    }

    const items: WorkspaceOpportunityQueueRuntime["items"] = withReason.map(({ row, reason }) => {
        const quoteForLifecycle = effectiveOpportunityQuoteDollars(row);
        const lifecycle = buildOpportunityLifecycleFields({
            statusKey: row.status_key,
            quoteTotalDollars: quoteForLifecycle,
            defs: oppDefs,
        });
        const sk = row.status_key ? String(row.status_key).trim() : "";
        const _status_display = sk ? (statusLabelByKey.get(sk) ?? sk) : null;
        return {
            id: row.id,
            name: row.name,
            status_key: row.status_key,
            quote_total: row.quote_total != null ? Number(row.quote_total) : null,
            pipeline_stage_id: null,
            source: null,
            assigned_to: null,
            customer_id: row.customer_id,
            primary_person_id: row.primary_person_id,
            location_id: row.location_id,
            job_date: row.job_date,
            job_time_window: row.job_time_window,
            customer_notes: row.customer_notes,
            metadata: row.metadata,
            created_at: row.created_at,
            updated_at: row.updated_at,
            ...(enrichById.get(row.id) ?? {}),
            _customer_name: row.customer_id ? (customerNameById.get(row.customer_id) ?? null) : null,
            _status_display,
            _attention_reason: reason,
            _attention_reason_label: attentionReasonLabel(reason),
            ...lifecycle,
        };
    });

    const attention_reason_counts = summarizeAttentionReasonCounts(withReason);

    return { items, rules, attention_reason_counts };
}
