/**
 * Operator-facing waitlist ranking policy factors — maps preset bucket keys to labels and copy.
 * Config still writes `priority_rule_order` / `priority_rule_enabled_keys`; no new metadata shape.
 */

import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import {
    TIER_EMPLOYEE_FAMILY_BUCKET,
    TIER_GENERAL_WAITLIST_BUCKET,
    TIER_STAFF_COMMUNITY_LEGACY_BUCKET,
} from "@/lib/orchestration/placement/placementBucketLabels";
import { getPlacementProfileFromRegistry } from "@/lib/orchestration/placement/placementPresetRegistry";
import {
    defaultFullPriorityRuleOrderForProfileId,
    defaultPriorityRuleOrderForProfileId,
    effectivePriorityRuleEnabledSet,
    fullDefaultPriorityRuleOrderForProfile,
    normalizePriorityRuleEnabledKeysForProfile,
    normalizePriorityRuleOrderForProfile,
    resolveDefaultPriorityRuleEnabledKeysForOrder,
    operatorPriorityRuleOrderFromFullOrder,
} from "@/lib/orchestration/placement/placementPriorityRuleOrder";

export type WaitlistRankingPolicyFactor = {
    bucketKey: string;
    label: string;
    description: string;
    /** Operator-facing data source line (e.g. Person → Employee = Yes). */
    sourceLabel: string;
    /** Optional technical key shown in Advanced only. */
    sourceKey?: string;
    isFallback?: boolean;
};

/** Shared bucket factors for childcare enrollment waitlist v1 + v2 presets. */
export const WAITLIST_RANKING_POLICY_FACTORS: readonly WaitlistRankingPolicyFactor[] = [
    {
        bucketKey: TIER_EMPLOYEE_FAMILY_BUCKET,
        label: "Employee families",
        description: "Children whose parent or guardian is marked as an employee.",
        sourceLabel: "Uses Person → Employee = Yes",
        sourceKey: "persons.is_employee",
    },
    {
        bucketKey: "tier_sibling_enrolled",
        label: "Siblings currently enrolled at this location",
        description: "Children with a sibling already enrolled at the same school/site.",
        sourceLabel: "Uses Inquiry Children → Outcome = Enrolled and Site = same location",
    },
    {
        bucketKey: "tier_sister_center",
        label: "Siblings enrolled at another location",
        description: "Children with a sibling enrolled at another school/site in the organization.",
        sourceLabel: "Uses Inquiry Children → Outcome = Enrolled and Site = different location",
    },
    {
        bucketKey: TIER_GENERAL_WAITLIST_BUCKET,
        label: "General waitlist",
        description: "Children who do not match another priority factor.",
        sourceLabel: "Fallback rule",
        isFallback: true,
    },
] as const;

/** @deprecated Use WAITLIST_RANKING_POLICY_FACTORS */
export const WAITLIST_RANKING_POLICY_FACTORS_V1 = WAITLIST_RANKING_POLICY_FACTORS;

export const WAITLIST_RANKING_POLICY_FACTOR_LABELS: Record<string, string> = Object.fromEntries(
    WAITLIST_RANKING_POLICY_FACTORS.map((f) => [f.bucketKey, f.label])
);

export const WAITLIST_RANKING_POLICY_FACTOR_DESCRIPTIONS: Record<string, string> = Object.fromEntries(
    WAITLIST_RANKING_POLICY_FACTORS.map((f) => [f.bucketKey, f.description])
);

export const WAITLIST_RANKING_POLICY_FACTOR_SOURCES: Record<string, string> = Object.fromEntries(
    WAITLIST_RANKING_POLICY_FACTORS.map((f) => [f.bucketKey, f.sourceLabel])
);

export const WAITLIST_RANKING_TIE_BREAKERS_V1 = [
    { order: 1, label: "Waitlist date" },
    { order: 2, label: "Desired start date" },
] as const;

export function factorLabelForBucket(bucketKey: string, labels = WAITLIST_RANKING_POLICY_FACTOR_LABELS): string {
    const migrated =
        bucketKey.trim() === TIER_STAFF_COMMUNITY_LEGACY_BUCKET
            ? TIER_EMPLOYEE_FAMILY_BUCKET
            : bucketKey.trim();
    return labels[migrated]?.trim() || migrated;
}

export type EffectivePriorityRuleConfig = {
    /** Operator-visible factor order (settings UI). */
    ruleOrder: string[];
    /** Full profile bucket order used at runtime. */
    fullRuleOrder: string[];
    ruleEnabledKeys: Set<string>;
    fallbackBucketKey: string;
    hasFactors: boolean;
};

/**
 * Resolves effective tier order + enabled keys from saved metadata with preset defaults.
 * Mirrors runtime merge behavior when `priority_rule_order` / `priority_rule_enabled_keys` are omitted.
 */
export function resolveEffectivePriorityRuleConfig(params: {
    profileId: string;
    priority_rule_order?: readonly string[] | null;
    priority_rule_enabled_keys?: readonly string[] | null;
}): EffectivePriorityRuleConfig {
    const profileId = params.profileId.trim();
    const profile = getPlacementProfileFromRegistry(profileId);
    const operatorDefault = defaultPriorityRuleOrderForProfileId(profileId);
    const fallbackBucketKey =
        profile?.fallback_bucket_key ?? CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;

    if (!profile || !operatorDefault?.length) {
        return {
            ruleOrder: [],
            fullRuleOrder: [],
            ruleEnabledKeys: new Set<string>(),
            fallbackBucketKey,
            hasFactors: false,
        };
    }

    const fullDefault =
        defaultFullPriorityRuleOrderForProfileId(profileId) ?? fullDefaultPriorityRuleOrderForProfile(profile);
    const fromMeta = params.priority_rule_order;
    const fullRuleOrder =
        Array.isArray(fromMeta) && fromMeta.length > 0
            ? normalizePriorityRuleOrderForProfile(profile, fromMeta)
            : [...fullDefault];

    const enabledNormalized = normalizePriorityRuleEnabledKeysForProfile(
        profile,
        fullRuleOrder,
        params.priority_rule_enabled_keys ??
            resolveDefaultPriorityRuleEnabledKeysForOrder(fullRuleOrder)
    );

    const ruleEnabledKeys = effectivePriorityRuleEnabledSet(
        fullRuleOrder,
        enabledNormalized,
        fallbackBucketKey
    );

    const ruleOrder = operatorPriorityRuleOrderFromFullOrder(fullRuleOrder);

    return {
        ruleOrder,
        fullRuleOrder,
        ruleEnabledKeys,
        fallbackBucketKey,
        hasFactors: true,
    };
}

export function buildWaitlistRankingPolicySummary(params: {
    enabled: boolean;
    ruleOrder: readonly string[];
    enabledKeys: ReadonlySet<string>;
    shadowMode: boolean;
    fallbackBucketKey: string;
    labels?: Record<string, string>;
}): {
    priorityChain: string;
    rankingMode: string;
    disabledFactorLabels: string[];
} {
    const labels = params.labels ?? WAITLIST_RANKING_POLICY_FACTOR_LABELS;
    if (!params.enabled) {
        return {
            priorityChain: "Waitlist ranking policy is off for this work unit.",
            rankingMode: params.shadowMode ? "Preview ranking only" : "Ordered by ranking policy",
            disabledFactorLabels: [],
        };
    }

    const activeLabels = params.ruleOrder
        .filter((k) => params.enabledKeys.has(k))
        .map((k) => factorLabelForBucket(k, labels));

    const disabledFactorLabels = params.ruleOrder
        .filter((k) => k !== params.fallbackBucketKey && !params.enabledKeys.has(k))
        .map((k) => factorLabelForBucket(k, labels));

    return {
        priorityChain:
            activeLabels.length > 0
                ? `Current priority order: ${activeLabels.join(" → ")}`
                : "No priority factors enabled.",
        rankingMode: params.shadowMode ? "Preview ranking only" : "Ordered by ranking policy",
        disabledFactorLabels,
    };
}

export function buildWaitlistActivePolicyStatus(params: {
    workUnitName: string;
    enabled: boolean;
    shadowMode: boolean;
}): {
    appliesToLine: string;
    statusLine: string;
    rankingModeLine: string;
} {
    const name = params.workUnitName.trim() || "this work unit";
    return {
        appliesToLine: `This policy is active for: ${name}`,
        statusLine: params.enabled
            ? "Ranking policy is currently active for this work unit."
            : "Ranking policy is currently off for this work unit.",
        rankingModeLine: params.shadowMode ? "Preview ranking only" : "Ordered by ranking policy",
    };
}
