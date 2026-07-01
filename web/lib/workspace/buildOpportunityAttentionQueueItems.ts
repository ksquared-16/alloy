import type { SupabaseClient } from "@supabase/supabase-js";
import type { AdminAccessScopeDimensions } from "@/lib/admin/accessScope";
import {
    accessScopeRestrictsData,
    applyRecordScopeConstraintsToQuery,
    resolveRecordScopeConstraints,
} from "@/lib/admin/accessScope";
import { buildOpportunityLifecycleFields, effectiveOpportunityQuoteDollars } from "@/lib/admin/opportunityLifecyclePresentation";
import { fetchEffectiveStatusDefinitions } from "@/lib/admin/statusDefinitionsResolve";
import { resolveOpportunityAttentionConfigFromMetadata } from "@/lib/opportunities/opportunityAttentionConfig";
import { resolveOpportunityAttention } from "@/lib/opportunities/opportunityAttentionResolver";
import type { OpportunityAttentionRuleConfigV1 } from "@/lib/workspace/opportunityAttentionRules";
import { enrichOpportunityRowsWithCrmProjection } from "@/lib/workspace/enrichOpportunityQueueProjection";
import type { WorkspaceOpportunityQueueRuntime } from "@/lib/workspace/types";
import {
    summarizeAttentionReasonCounts,
    type AttentionReasonCountSummary,
} from "@/lib/workspace/attentionReasonCountsSummary";
import {
    buildStandaloneAttentionEvaluation,
    type StandaloneOpportunityAttentionEvaluation,
} from "@/lib/workspace/opportunityAttentionCountSemantics";

/** Rows pulled from `opportunities` before resolver filter — org + access scope only (not `work_unit_id`). */
export const OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS = 500;

export type { AttentionReasonCountSummary } from "@/lib/workspace/attentionReasonCountsSummary";

type AttentionCandidateRow = {
    id: string;
    name: string | null;
    status_key: string | null;
    quote_total: number | string | null;
    estimated_price_cents?: number | string | null;
    monetary_value_cents?: number | string | null;
    customer_id: string | null;
    primary_person_id?: string | null;
    primary_contact_id?: string | null;
    location_id?: string | null;
    job_date?: string | null;
    job_time_window?: string | null;
    customer_notes?: string | null;
    metadata?: unknown;
    created_at: string | null;
    updated_at: string | null;
};

function rowMetadataRecord(metadata: unknown): Record<string, unknown> | null {
    if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    return metadata as Record<string, unknown>;
}

/**
 * Shared implementation for opportunity “Needs attention” rows (same rules as the work-unit route).
 * Used by `…/work-units/:id/opportunity-attention-queue` and department preview when the work unit row is absent.
 */
export async function buildOpportunityAttentionQueueItems(params: {
    supabase: SupabaseClient;
    orgId: string;
    /** Work unit / department `metadata` (or any object containing `opportunity_attention_rules`). */
    attentionConfigMetadata?: unknown | null;
    accessDim?: AdminAccessScopeDimensions | null;
    /** Distinguishes standalone work-unit route vs department preview (config source only — same resolver + org scope). */
    attentionQueueCohort: StandaloneOpportunityAttentionEvaluation["cohort"];
}): Promise<{
    items: WorkspaceOpportunityQueueRuntime["items"];
    rules: OpportunityAttentionRuleConfigV1;
    attention_reason_counts: AttentionReasonCountSummary[];
    attention_evaluation: StandaloneOpportunityAttentionEvaluation;
}> {
    const { supabase, orgId, attentionConfigMetadata = null, accessDim = null } = params;

    const attentionConfig = resolveOpportunityAttentionConfigFromMetadata(attentionConfigMetadata);
    const rules: OpportunityAttentionRuleConfigV1 = {
        version: 1,
        thresholdsHours: { ...attentionConfig.thresholdsHours },
    };

    const oppDefs = await fetchEffectiveStatusDefinitions(supabase, orgId, "opportunities", { activeOnly: true });
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
            "id, name, status_key, quote_total, estimated_price_cents, monetary_value_cents, customer_id, primary_person_id, primary_contact_id, location_id, work_unit_id, job_date, job_time_window, customer_notes, metadata, created_at, updated_at"
        )
        .eq("org_id", orgId)
        .order("updated_at", { ascending: true, nullsFirst: false })
        .limit(OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS);

    if (accessDim && accessScopeRestrictsData(accessDim)) {
        const c = await resolveRecordScopeConstraints(supabase, orgId, accessDim);
        if (c.impossible) {
            return {
                items: [],
                rules,
                attention_reason_counts: summarizeAttentionReasonCounts([]),
                attention_evaluation: buildStandaloneAttentionEvaluation({
                    rowWindowCap: OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS,
                    rawCandidatesFetched: 0,
                    cohort: params.attentionQueueCohort,
                }),
            };
        }
        oppQ = applyRecordScopeConstraintsToQuery(oppQ, c);
    }

    const { data: rows, error: oppErr } = await oppQ;

    if (oppErr) {
        throw new Error(oppErr.message);
    }

    const nowMs = Date.now();
    const candidates = (rows ?? []) as AttentionCandidateRow[];

    const withAttention = candidates
        .map((row) => {
            const resolved = resolveOpportunityAttention({
                opportunity: {
                    id: row.id,
                    status_key: row.status_key,
                    created_at: row.created_at,
                    updated_at: row.updated_at,
                    metadata: rowMetadataRecord(row.metadata),
                    customer_id: row.customer_id,
                    primary_person_id: row.primary_person_id ?? null,
                    primary_contact_id: row.primary_contact_id ?? null,
                    quote_total: row.quote_total ?? null,
                    estimated_price_cents: row.estimated_price_cents ?? null,
                    monetary_value_cents: row.monetary_value_cents ?? null,
                },
                defs: oppDefs,
                nowMs,
                config: attentionConfig,
                optionalSignals: null,
            });
            return { row, resolved };
        })
        .filter((x) => x.resolved.needs_attention && x.resolved.primary_reason != null);

    const enrichById = await enrichOpportunityRowsWithCrmProjection(
        supabase,
        orgId,
        withAttention.map((x) => x.row)
    );

    const customerIds = [...new Set(withAttention.map((x) => x.row.customer_id).filter(Boolean))] as string[];
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

    const items: WorkspaceOpportunityQueueRuntime["items"] = withAttention.map(({ row, resolved }) => {
        const pr = resolved.primary_reason!;
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
            _attention_reason: pr.code,
            _attention_reason_label: pr.label,
            _attention_severity: pr.severity,
            _attention_priority_score: resolved.priority_score,
            _attention_waiting_bucket: resolved.waiting.bucket,
            _attention_reasons_detail: resolved.reasons,
            _attention_priority_breakdown: resolved.priority_breakdown,
            ...lifecycle,
        };
    });

    /** Multi-reason histogram: one row may increment multiple bins — not primary-only (see execution docs). */
    const attention_reason_counts = summarizeAttentionReasonCounts(
        withAttention.flatMap(({ resolved }) =>
            resolved.reasons.map((rr) => ({ reason_key: rr.code, label: rr.label }))
        )
    );

    return {
        items,
        rules,
        attention_reason_counts,
        attention_evaluation: buildStandaloneAttentionEvaluation({
            rowWindowCap: OPPORTUNITY_ATTENTION_QUEUE_BUILDER_MAX_ROWS,
            rawCandidatesFetched: candidates.length,
            cohort: params.attentionQueueCohort,
        }),
    };
}
