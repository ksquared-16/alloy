/**
 * Deterministic attention reason → catalog key mapper (Phase 1 / Card 1.4).
 */

import type { ActivitySignalResult } from "@/lib/admin/activitySignals";
import {
    WAITING_ON_INTERNAL_CATALOG_KEY,
    getOperationalRecommendationCatalogEntry,
} from "@/lib/adminV2/bos/recommendations/catalog/operationalRecommendationCatalog";
import type { OperationalRecommendationCatalogKey } from "@/lib/adminV2/bos/recommendations/catalog/recommendationCatalogTypes";
import type { OpportunityAttentionReasonCode } from "@/lib/opportunities/attentionPlatformCatalog";
import type { OpportunityAttentionResult } from "@/lib/opportunities/opportunityAttentionResolver";

/** Phase 1 reason codes with a direct catalog entry (not supplemental overlays). */
const PHASE1_ATTENTION_REASON_CATALOG_KEYS: Partial<
    Record<OpportunityAttentionReasonCode, OperationalRecommendationCatalogKey>
> = {
    stale_new_inquiry: "stale_new_inquiry",
    follow_up_date_passed: "follow_up_date_passed",
    tour_date_passed: "tour_date_passed",
    waiting_on_family: "waiting_on_family",
    waiting_on_staff: "waiting_on_staff",
    high_value_stale: "high_value_stale",
};

const UNANSWERED_INBOUND_ACTIVITY_KEYS = new Set(["unanswered_inbound"]);

function normalizeReasonCodeForCatalog(code: string): OpportunityAttentionReasonCode | string {
    const trimmed = code.trim();
    if (trimmed === "waiting_on_internal") {
        return WAITING_ON_INTERNAL_CATALOG_KEY;
    }
    return trimmed;
}

function resolveActivityStaleKey(
    activity: ActivitySignalResult | null | undefined,
    attention: OpportunityAttentionResult
): string | null {
    const fromActivity = activity?.stale_signal?.key?.trim();
    if (fromActivity) return fromActivity;
    return attention.auxiliary?.activity_stale?.key?.trim() ?? null;
}

function hasGroundedUnansweredInbound(
    activity: ActivitySignalResult | null | undefined,
    attention: OpportunityAttentionResult
): boolean {
    const key = resolveActivityStaleKey(activity, attention);
    if (!key) return false;
    if (UNANSWERED_INBOUND_ACTIVITY_KEYS.has(key)) return true;
    return key.includes("unanswered_inbound");
}

function hasGroundedSlaBreach(attention: OpportunityAttentionResult): boolean {
    const primary = attention.primary_reason;
    if (!primary) return false;
    return primary.sla_tier === "breached";
}

/**
 * Resolve catalog key from resolver output and already-loaded activity signals.
 * Supplemental keys (`unanswered_inbound`, `sla_breach`) require grounded attach context.
 */
export function mapAttentionReasonToCatalogKey(input: {
    attention: OpportunityAttentionResult;
    activity?: ActivitySignalResult | null;
}): OperationalRecommendationCatalogKey | null {
    const { attention } = input;
    if (!attention.needs_attention || !attention.primary_reason) return null;

    const normalizedCode = normalizeReasonCodeForCatalog(attention.primary_reason.code);
    const directKey =
        PHASE1_ATTENTION_REASON_CATALOG_KEYS[normalizedCode as OpportunityAttentionReasonCode];
    if (directKey && getOperationalRecommendationCatalogEntry(directKey)) {
        return directKey;
    }

    if (hasGroundedUnansweredInbound(input.activity, attention)) {
        return "unanswered_inbound";
    }

    if (hasGroundedSlaBreach(attention)) {
        return "sla_breach";
    }

    return null;
}
