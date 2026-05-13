import type { SupabaseClient } from "@supabase/supabase-js";

import { buildNeedsAttentionSuggestion } from "@/lib/agent/needsAttentionSuggestion/buildNeedsAttentionSuggestion";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import {
    loadOpportunityActivitySignal,
    type OpportunityActivitySignalOrgMetadata,
} from "@/lib/admin/loadOpportunityActivitySignal";
import {
    computeOperationalAttentionAttachment,
    type OperationalAttentionAttachmentError,
} from "@/lib/admin/operationalAttentionEntityAttachment";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

const EMPTY_ACTIVITY: ActivitySignalResult = {
    last_activity_at: null,
    last_activity_type: null,
    last_activity_summary: null,
    stale_signal: null,
};

function opportunityRowToSuggestionInput(row: Record<string, unknown>): {
    id: string;
    status_key: string | null;
    metadata: Record<string, unknown> | null;
    primary_display_name: string | null;
} {
    const md = row.metadata;
    const customer =
        typeof row._customer_name === "string" && row._customer_name.trim() ? row._customer_name.trim() : "";
    const title = typeof row.name === "string" && row.name.trim() ? row.name.trim() : "";
    const primary_display_name = customer || title || null;
    return {
        id: String(row.id ?? "").trim(),
        status_key: row.status_key != null ? String(row.status_key) : null,
        metadata: md && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null,
        primary_display_name,
    };
}

/**
 * Authoritative opportunity payload fragment: operational attention (with activity wired into resolver
 * optional signals) + derived suggestion. Same evaluator substrate as queues; activity from
 * {@link loadOpportunityActivitySignal}.
 */
export async function attachOpportunityAttentionSuggestionBundle(params: {
    supabase: SupabaseClient;
    orgId: string;
    opportunityRow: Record<string, unknown>;
    defs: StatusDefinitionRow[];
    attentionConfigMetadata: unknown | null;
    workUnitId: string | null;
    statusKey: string | null;
    preloadedActivityOrgMetadata?: OpportunityActivitySignalOrgMetadata | null;
    nowMs?: number;
}): Promise<{
    _operational_attention: OpportunityAttentionResult | null;
    _operational_attention_error: OperationalAttentionAttachmentError | null;
    _attention_suggestion: AttentionSuggestionV1 | null;
}> {
    const nowMs = params.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const oid = String(params.opportunityRow.id ?? "").trim();

    let activity: ActivitySignalResult = EMPTY_ACTIVITY;
    if (oid) {
        try {
            activity = await loadOpportunityActivitySignal({
                supabase: params.supabase,
                orgId: params.orgId,
                opportunityId: oid,
                statusKey: params.statusKey,
                workUnitId: params.workUnitId,
                preloadedOrgMetadata: params.preloadedActivityOrgMetadata ?? undefined,
                nowMs,
            });
        } catch {
            activity = EMPTY_ACTIVITY;
        }
    }

    const attn = computeOperationalAttentionAttachment({
        opportunityRow: params.opportunityRow,
        defs: params.defs,
        attentionConfigMetadata: params.attentionConfigMetadata,
        activitySignal: activity,
        nowMs,
    });

    const suggestion =
        attn._operational_attention_error || !attn._operational_attention
            ? null
            : buildNeedsAttentionSuggestion({
                  opportunity: opportunityRowToSuggestionInput(params.opportunityRow),
                  attention: attn._operational_attention,
                  activity,
                  nowIso,
              });

    return {
        ...attn,
        _attention_suggestion: suggestion,
    };
}
