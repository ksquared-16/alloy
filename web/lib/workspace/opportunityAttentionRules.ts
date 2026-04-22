import type { StatusDefinitionRow } from "@/lib/admin/statusDefinitionsResolve";
import { opportunityQuoteTotalForLifecycle, resolveEffectiveOpportunityLifecycleStage } from "@/lib/admin/opportunityLifecyclePresentation";

export type OpportunityAttentionReason =
    | "stale_new_inquiry"
    | "stale_qualified"
    | "stale_quote_followup"
    | "missing_quote_after_execution";

export type OpportunityAttentionRuleConfigV1 = {
    version: 1;
    /** Thresholds are in hours to keep tuning simple. */
    thresholdsHours: Record<OpportunityAttentionReason, number>;
};

export const DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1: OpportunityAttentionRuleConfigV1 = {
    version: 1,
    thresholdsHours: {
        stale_new_inquiry: 48,
        stale_qualified: 72,
        stale_quote_followup: 72,
        missing_quote_after_execution: 72,
    },
};

export function attentionReasonLabel(r: OpportunityAttentionReason): string {
    switch (r) {
        case "stale_new_inquiry":
            return "New inquiry is stale";
        case "stale_qualified":
            return "Qualified but not progressing";
        case "stale_quote_followup":
            return "Priced follow-up is stale";
        case "missing_quote_after_execution":
            return "Quoting started but no offer yet";
        default:
            return "Needs attention";
    }
}

export function parseOpportunityAttentionRuleConfigV1FromMetadata(
    metadata: unknown
): OpportunityAttentionRuleConfigV1 | null {
    if (metadata == null || typeof metadata !== "object" || Array.isArray(metadata)) return null;
    const m = metadata as Record<string, unknown>;
    const raw = m.opportunity_attention_rules;
    if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
    const r = raw as Record<string, unknown>;
    if (r.version !== 1) return null;
    const th = r.thresholdsHours;
    if (th == null || typeof th !== "object" || Array.isArray(th)) return null;
    const t = th as Record<string, unknown>;

    const out: OpportunityAttentionRuleConfigV1 = {
        version: 1,
        thresholdsHours: { ...DEFAULT_OPPORTUNITY_ATTENTION_RULES_V1.thresholdsHours },
    };
    for (const k of Object.keys(out.thresholdsHours) as OpportunityAttentionReason[]) {
        const v = t[k];
        if (typeof v === "number" && Number.isFinite(v) && v > 0) {
            out.thresholdsHours[k] = Math.floor(v);
        }
    }
    return out;
}

export type OpportunityAttentionInputRow = {
    id: string;
    status_key: string | null;
    quote_total: number | string | null;
    created_at: string | null;
    updated_at: string | null;
};

function msSince(ts: string | null | undefined, nowMs: number): number | null {
    if (!ts) return null;
    const ms = Date.parse(ts);
    if (!Number.isFinite(ms)) return null;
    return Math.max(0, nowMs - ms);
}

export function computeOpportunityAttentionReason(input: {
    row: OpportunityAttentionInputRow;
    defs: StatusDefinitionRow[];
    rules: OpportunityAttentionRuleConfigV1;
    nowMs: number;
}): OpportunityAttentionReason | null {
    const quoteNum = opportunityQuoteTotalForLifecycle({ quote_total: input.row.quote_total });
    const stage = resolveEffectiveOpportunityLifecycleStage({
        statusKey: input.row.status_key,
        quoteTotalDollars: quoteNum,
        defs: input.defs,
    });

    // Use updated_at as “last touched” proxy, else created_at.
    const sinceMs = msSince(input.row.updated_at, input.nowMs) ?? msSince(input.row.created_at, input.nowMs);
    if (sinceMs == null) return null;
    const sinceHours = sinceMs / (1000 * 60 * 60);

    if (stage === "intake") {
        if (sinceHours >= input.rules.thresholdsHours.stale_new_inquiry) return "stale_new_inquiry";
    }
    if (stage === "qualification") {
        if (sinceHours >= input.rules.thresholdsHours.stale_qualified) return "stale_qualified";
    }
    if (stage === "execution") {
        // Effective stage already accounts for positive quote → decision, so here quote_total is <= 0.
        if (sinceHours >= input.rules.thresholdsHours.missing_quote_after_execution) return "missing_quote_after_execution";
    }
    if (stage === "decision") {
        if (sinceHours >= input.rules.thresholdsHours.stale_quote_followup) return "stale_quote_followup";
    }

    return null;
}

