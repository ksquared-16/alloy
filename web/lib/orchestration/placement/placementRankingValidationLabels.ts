/**
 * Product-facing labels for ranking validation QA (Card 3).
 * Maps registry bucket keys to stable QA output tokens.
 */

import type { MergedPlacementPriorityConfig } from "@/lib/orchestration/placement/placementConfigSchema";
import {
    TIER_EMPLOYEE_FAMILY_BUCKET,
    TIER_GENERAL_WAITLIST_BUCKET,
} from "@/lib/orchestration/placement/placementBucketLabels";
import {
    CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
    defaultFullPriorityRuleOrderForProfileId,
    defaultPriorityRuleOrderForProfileId,
    effectivePriorityRuleEnabledSet,
    fullDefaultPriorityRuleOrderForProfile,
    normalizePriorityRuleEnabledKeysForProfile,
    normalizePriorityRuleOrderForProfile,
    operatorPriorityRuleOrderFromFullOrder,
    resolveDefaultPriorityRuleEnabledKeysForOrder,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";

export const PLACEMENT_RANKING_MANUAL_PIN_LABEL = "manual_pin" as const;

const BUCKET_TO_RANKING_LABEL: Record<string, string> = {
    [TIER_EMPLOYEE_FAMILY_BUCKET]: "employee_parent",
    tier_staff_community: "employee_parent",
    tier_sibling_enrolled: "same_site_sibling",
    tier_sister_center: "sister_site_sibling",
    [TIER_GENERAL_WAITLIST_BUCKET]: "general",
};

export function mapPlacementBucketToRankingLabel(bucketKey: string): string {
    const k = bucketKey.trim();
    return BUCKET_TO_RANKING_LABEL[k] ?? k;
}

/** Expected tier precedence from merged admin config (manual pin is a separate override layer). */
export function buildExpectedPriorityOrderFromConfig(params: {
    profile: PlacementProfile;
    merged: MergedPlacementPriorityConfig;
}): string[] {
    const { profile, merged } = params;
    const fullOrder = merged.priority_rule_order?.length
        ? normalizePriorityRuleOrderForProfile(profile, merged.priority_rule_order)
        : defaultFullPriorityRuleOrderForProfileId(profile.profile_id) ??
          fullDefaultPriorityRuleOrderForProfile(profile);
    const enabledNormalized = normalizePriorityRuleEnabledKeysForProfile(
        profile,
        fullOrder,
        merged.priority_rule_enabled_keys ?? resolveDefaultPriorityRuleEnabledKeysForOrder(fullOrder)
    );
    const enabled = effectivePriorityRuleEnabledSet(
        fullOrder,
        enabledNormalized,
        profile.fallback_bucket_key
    );
    const operatorOrder = operatorPriorityRuleOrderFromFullOrder(fullOrder);
    const tierLabels = operatorOrder.filter((k) => enabled.has(k)).map(mapPlacementBucketToRankingLabel);
    return [PLACEMENT_RANKING_MANUAL_PIN_LABEL, ...tierLabels];
}

/** Effective tier order after profile mutation — mirrors enabled rules + fallback. */
export function buildActualPriorityOrderFromProfile(profile: PlacementProfile): string[] {
    const fallback = profile.fallback_bucket_key;
    const seen = new Set<string>();
    const ordered: string[] = [];
    for (const rule of [...profile.rules].sort((a, b) => a.rule_order - b.rule_order)) {
        const key = rule.assign_bucket_key;
        if (seen.has(key)) continue;
        seen.add(key);
        ordered.push(key);
    }
    if (!seen.has(fallback)) ordered.push(fallback);
    return [PLACEMENT_RANKING_MANUAL_PIN_LABEL, ...ordered.map((b) => mapPlacementBucketToRankingLabel(b))];
}
