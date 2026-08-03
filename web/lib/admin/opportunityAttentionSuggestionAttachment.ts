import type { SupabaseClient } from "@supabase/supabase-js";

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import type { ReadinessMemoScope } from "@/lib/completion/readinessEvaluationMemo";
import type { ReadinessResult } from "@/lib/completion/readinessTypes";
import {
    loadOpportunityActivitySignal,
    type OpportunityActivitySignalOrgMetadata,
} from "@/lib/admin/loadOpportunityActivitySignal";
import {
    computeOperationalAttentionAttachment,
    type OperationalAttentionAttachmentError,
} from "@/lib/admin/operationalAttentionEntityAttachment";
import { loadStageAttentionTasksByOpportunityId } from "@/lib/lifecycle/stageAttentionForOpportunity";
import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { applyStubOperationalSummaryOverlay } from "@/lib/ai/buildOperationalSummary";
import { buildOperationalSummaryDeterministic } from "@/lib/operationalSummary/buildOperationalSummary";
import { isAiEnrichmentStubEnvEnabled } from "@/lib/ai/aiEnrichmentEnv";
import { parseAiPolicyFromMetadata } from "@/lib/ai/aiPolicy";
import type { OperationalSummaryV1 } from "@/lib/ai/enrichmentContracts";
import { attachOperationalRecommendationBundle } from "@/lib/adminV2/bos/recommendations/adapters/attachOperationalRecommendationBundle";
import { buildLegacyAttentionSuggestionCompat } from "@/lib/adminV2/bos/recommendations/adapters/buildLegacySuggestionCompat";
import type { AttentionSuggestionV1 } from "@/lib/agent/needsAttentionSuggestion/types";
import type { OperationalRecommendationV1 } from "@/lib/adminV2/bos/recommendations/types";
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
 *
 * Card 1.7: `_attention_suggestion` is projected from `_operational_recommendation` when supported,
 * with fail-soft fallback to {@link buildNeedsAttentionSuggestion}.
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
    departmentMetadata?: unknown | null;
    departmentId?: string | null;
    readiness?: ReadinessResult | null;
    readinessMemoScope?: ReadinessMemoScope;
    nowMs?: number;
}): Promise<{
    _operational_attention: OpportunityAttentionResult | null;
    _operational_attention_error: OperationalAttentionAttachmentError | null;
    _attention_suggestion: AttentionSuggestionV1 | null;
    _operational_summary: OperationalSummaryV1 | null;
    _operational_recommendation: OperationalRecommendationV1 | null;
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

    let stageAttentionTasks = null;
    if (oid && params.departmentMetadata) {
        const tasksById = await loadStageAttentionTasksByOpportunityId({
            supabase: params.supabase,
            orgId: params.orgId,
            opportunityIds: [oid],
        });
        stageAttentionTasks = tasksById.get(oid) ?? [];
    }

    const attn = computeOperationalAttentionAttachment({
        opportunityRow: params.opportunityRow,
        defs: params.defs,
        attentionConfigMetadata: params.attentionConfigMetadata,
        departmentMetadata: params.departmentMetadata ?? null,
        orgId: params.orgId,
        departmentId: params.departmentId ?? null,
        workUnitId: params.workUnitId,
        activitySignal: activity,
        nowMs,
        readiness: params.readiness ?? null,
        readinessMemoScope: params.readinessMemoScope,
        stageAttentionTasks,
    });

    const legacySuggestionInput =
        attn._operational_attention_error || !attn._operational_attention
            ? null
            : {
                  opportunity: opportunityRowToSuggestionInput(params.opportunityRow),
                  attention: attn._operational_attention,
                  activity,
                  nowIso,
              };

    const operationalRecommendation =
        attn._operational_attention_error || !attn._operational_attention
            ? null
            : attachOperationalRecommendationBundle({
                  orgId: params.orgId,
                  opportunityRow: params.opportunityRow,
                  attention: attn._operational_attention,
                  activity,
                  workUnitId: params.workUnitId,
                  nowMs,
              })._operational_recommendation;

    const suggestion =
        legacySuggestionInput == null
            ? null
            : buildLegacyAttentionSuggestionCompat({
                  recommendation: operationalRecommendation,
                  legacyInput: legacySuggestionInput,
              });

    let _operational_summary: OperationalSummaryV1 | null = null;
    if (!attn._operational_attention_error && attn._operational_attention) {
        let sum = buildOperationalSummaryDeterministic({
            attention: attn._operational_attention,
            suggestion,
            nowIso,
        });
        if (sum && isAiEnrichmentStubEnvEnabled()) {
            const { data: osRow, error } = await params.supabase
                .from("org_settings")
                .select("metadata")
                .eq("org_id", params.orgId)
                .maybeSingle();
            if (!error) {
                sum = applyStubOperationalSummaryOverlay(sum, parseAiPolicyFromMetadata(osRow?.metadata ?? {}));
            }
        }
        _operational_summary = sum;
    }

    return {
        ...attn,
        _attention_suggestion: suggestion,
        _operational_summary,
        _operational_recommendation: operationalRecommendation,
    };
}
