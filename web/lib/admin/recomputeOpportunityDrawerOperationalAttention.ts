import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import { computeOperationalAttentionAttachment } from "@/lib/admin/operationalAttentionEntityAttachment";
import { buildLegacyAttentionSuggestionCompat } from "@/lib/adminV2/bos/recommendations/adapters/buildLegacySuggestionCompat";
import { attachOperationalRecommendationBundle } from "@/lib/adminV2/bos/recommendations/adapters/attachOperationalRecommendationBundle";
import { enrichOperationalRecommendationWithActionPreflight } from "@/lib/adminV2/bos/recommendations/preflight/enrichOperationalRecommendationPreflight";
import { buildOperationalSummaryDeterministic } from "@/lib/operationalSummary/buildOperationalSummary";

function readEmbeddedActivitySignal(row: Record<string, unknown>): ActivitySignalResult | null {
    const raw = row._activity_signal;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as ActivitySignalResult;
    if (!("stale_signal" in r) && !("last_activity_at" in r)) return null;
    return r;
}

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
    return {
        id: String(row.id ?? "").trim(),
        status_key: row.status_key != null ? String(row.status_key) : null,
        metadata: md && typeof md === "object" && !Array.isArray(md) ? (md as Record<string, unknown>) : null,
        primary_display_name: customer || title || null,
    };
}

/**
 * Recompute drawer BOS / operational attention fields from the current opportunity row snapshot.
 * Used after in-drawer tour booking mutations so the open drawer does not keep stale `_operational_*` payloads.
 */
export function recomputeOpportunityDrawerOperationalAttention(
    row: Record<string, unknown>,
    opts?: {
        orgId?: string | null;
        workUnitMetadata?: unknown | null;
        nowMs?: number;
    }
): Pick<
    Record<string, unknown>,
    | "_operational_attention"
    | "_operational_attention_error"
    | "_operational_recommendation"
    | "_attention_suggestion"
    | "_operational_summary"
> {
    const nowMs = opts?.nowMs ?? Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const activity = readEmbeddedActivitySignal(row);
    const workUnitMetadata = opts?.workUnitMetadata ?? row._work_unit_metadata ?? null;

    const attn = computeOperationalAttentionAttachment({
        opportunityRow: row,
        defs: [],
        attentionConfigMetadata: workUnitMetadata,
        activitySignal: activity,
        nowMs,
    });

    const orgId = String(opts?.orgId ?? row.org_id ?? "").trim();
    const workUnitId = row.work_unit_id != null ? String(row.work_unit_id).trim() : null;

    let _operational_recommendation = null;
    let _attention_suggestion = null;
    let _operational_summary = null;

    if (!attn._operational_attention_error && attn._operational_attention && orgId) {
        const baseRecommendation =
            attachOperationalRecommendationBundle({
                orgId,
                opportunityRow: row,
                attention: attn._operational_attention,
                activity,
                workUnitId,
                nowMs,
            })._operational_recommendation ?? null;
        _operational_recommendation = baseRecommendation
            ? enrichOperationalRecommendationWithActionPreflight(baseRecommendation, row)
            : null;

        const legacyInput = {
            opportunity: opportunityRowToSuggestionInput(row),
            attention: attn._operational_attention,
            activity: activity ?? {
                last_activity_at: null,
                last_activity_type: null,
                last_activity_summary: null,
                stale_signal: null,
            },
            nowIso,
        };

        _attention_suggestion = buildLegacyAttentionSuggestionCompat({
            recommendation: _operational_recommendation,
            legacyInput,
        });

        _operational_summary = buildOperationalSummaryDeterministic({
            attention: attn._operational_attention,
            suggestion: _attention_suggestion,
            nowIso,
        });
    }

    return {
        _operational_attention: attn._operational_attention,
        _operational_attention_error: attn._operational_attention_error,
        _operational_recommendation,
        _attention_suggestion,
        _operational_summary,
    };
}
