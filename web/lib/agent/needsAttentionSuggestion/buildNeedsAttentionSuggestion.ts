import { createHash } from "node:crypto";

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";
import { suggestionActionForReasonCode } from "@/lib/agent/needsAttentionSuggestion/suggestionActionMap";
import { suggestedContentForReason } from "@/lib/agent/needsAttentionSuggestion/suggestedContentTemplates";
import {
    NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
    type AttentionSuggestionV1,
} from "@/lib/agent/needsAttentionSuggestion/types";

export function deterministicSuggestionId(parts: {
    entity_id: string;
    primary_reason_code: string;
    resolver_version: number;
    /** UTC calendar day bucket, e.g. from `new Date(nowMs).toISOString().slice(0, 10)`. */
    day_bucket_utc: string;
}): string {
    const raw = [parts.entity_id, parts.primary_reason_code, String(parts.resolver_version), parts.day_bucket_utc].join("|");
    return createHash("sha256").update(raw, "utf8").digest("hex").slice(0, 48);
}

export type BuildNeedsAttentionSuggestionInput = {
    opportunity: {
        id: string;
        status_key?: string | null;
        metadata?: Record<string, unknown> | null;
        /** From entity GET (`name`, `_customer_name`, etc.) — never queue preview. */
        primary_display_name?: string | null;
    };
    attention: OpportunityAttentionResult | null;
    activity?: ActivitySignalResult | null;
    /** ISO timestamp for `generated_at_iso`; defaults to `new Date().toISOString()`. */
    nowIso?: string;
};

export function buildNeedsAttentionSuggestion(input: BuildNeedsAttentionSuggestionInput): AttentionSuggestionV1 | null {
    const attention = input.attention;
    if (!attention?.needs_attention || !attention.primary_reason) {
        return null;
    }

    const entityId = String(input.opportunity.id ?? "").trim();
    if (!entityId) return null;

    const primary = attention.primary_reason;
    const generated_at_iso = input.nowIso ?? new Date().toISOString();
    const parsedAnchor = Date.parse(generated_at_iso);
    const dayAnchorMs = Number.isFinite(parsedAnchor) ? parsedAnchor : Date.now();
    const dayBucketUtc = new Date(dayAnchorMs).toISOString().slice(0, 10);

    const action = suggestionActionForReasonCode(primary.code);
    const activityKey = input.activity?.stale_signal?.key?.trim() || null;

    const factors = attention.reasons.map((r) => ({
        code: r.code,
        label: r.label,
        severity: r.severity,
        sla_tier: r.sla_tier,
    }));

    let summary = `Operational attention: ${primary.label}.`;
    if (input.activity?.stale_signal?.label) {
        summary = `${summary} Activity signal: ${input.activity.stale_signal.label}.`;
    } else if (input.activity?.last_activity_summary && input.activity.last_activity_at) {
        summary = `${summary} Last activity: ${input.activity.last_activity_summary}.`;
    }

    const display =
        typeof input.opportunity.primary_display_name === "string" && input.opportunity.primary_display_name.trim()
            ? input.opportunity.primary_display_name.trim()
            : "";
    const contact_name = display || "there";

    const suggested = suggestedContentForReason(primary.code, {
        entity_id: entityId,
        record_ref: entityId.length >= 8 ? entityId.slice(-8) : entityId || "record",
        contact_name,
    });

    const out: AttentionSuggestionV1 = {
        version: 1,
        agent_key: NEEDS_ATTENTION_SUGGESTION_AGENT_KEY,
        suggestion_id: deterministicSuggestionId({
            entity_id: entityId,
            primary_reason_code: primary.code,
            resolver_version: attention.resolver_version,
            day_bucket_utc: dayBucketUtc,
        }),
        target: {
            entity_type: "opportunities",
            entity_id: entityId,
        },
        source: {
            resolver: "opportunity_attention",
            resolver_version: attention.resolver_version,
            primary_reason_code: primary.code,
            reason_codes: attention.reasons.map((r) => r.code),
            activity_signal_key: activityKey,
        },
        next_action: {
            key: action.key,
            label: action.label,
            action_family: action.action_family,
            confidence: "deterministic",
        },
        reasoning: {
            summary,
            factors,
        },
        suggested_content: suggested,
        generated_at_iso,
    };

    return out;
}
