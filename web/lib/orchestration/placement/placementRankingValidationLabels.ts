/**
 * Product-facing labels for ranking validation QA (Card 3).
 * Maps registry bucket keys to stable QA output tokens.
 */

import type { MergedPlacementPriorityConfig } from "@/lib/orchestration/placement/placementConfigSchema";
import {
    CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
    defaultPriorityRuleOrderForProfileId,
    effectivePriorityRuleEnabledSet,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import type { PlacementProfile } from "@/lib/orchestration/placement/placementPriorityTypes";

export const PLACEMENT_RANKING_MANUAL_PIN_LABEL = "manual_pin" as const;

const BUCKET_TO_RANKING_LABEL: Record<string, string> = {
    tier_staff_community: "employee_parent",
    tier_sibling_enrolled: "same_site_sibling",
    tier_sister_center: "sister_site_sibling",
    tier_general_waitlist: "general",
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
    const order =
        merged.priority_rule_order?.length
            ? merged.priority_rule_order
            : defaultPriorityRuleOrderForProfileId(profile.profile_id) ??
              [...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1];
    const enabled = effectivePriorityRuleEnabledSet(
        order,
        merged.priority_rule_enabled_keys,
        profile.fallback_bucket_key
    );
    const tierLabels = order.filter((k) => enabled.has(k)).map(mapPlacementBucketToRankingLabel);
    return [PLACEMENT_RANKING_MANUAL_PIN_LABEL, ...tierLabels];
}

/** Effective tier order after profile mutation — should mirror configured order when valid. */
export function buildActualPriorityOrderFromProfile(profile: PlacementProfile): string[] {
    const sorted = [...profile.buckets].sort((a, b) => a.priority_order - b.priority_order);
    return [PLACEMENT_RANKING_MANUAL_PIN_LABEL, ...sorted.map((b) => mapPlacementBucketToRankingLabel(b.bucket_key))];
}
