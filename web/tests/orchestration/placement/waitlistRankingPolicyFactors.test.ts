import { describe, expect, it } from "vitest";
import {
    buildWaitlistActivePolicyStatus,
    buildWaitlistRankingPolicySummary,
    factorLabelForBucket,
    resolveEffectivePriorityRuleConfig,
    WAITLIST_RANKING_POLICY_FACTOR_SOURCES,
    WAITLIST_RANKING_POLICY_FACTORS,
    WAITLIST_RANKING_POLICY_FACTOR_LABELS,
} from "@/lib/orchestration/placement/waitlistRankingPolicyFactors";
import { CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1 } from "@/lib/orchestration/placement/placementPriorityRuleOrder";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfile";
import { CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2 } from "@/lib/orchestration/placement/presets/childcareEnrollmentPlacementProfileV2";

const fb = CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.fallback_bucket_key;

describe("waitlistRankingPolicyFactors", () => {
    it("factorLabelForBucket returns operator labels", () => {
        expect(factorLabelForBucket("tier_employee_family")).toBe("Employee families");
        expect(factorLabelForBucket("tier_staff_community")).toBe("Employee families");
        expect(factorLabelForBucket("tier_sibling_enrolled")).toBe(
            "Siblings currently enrolled at this location"
        );
    });

    it("factor source labels explain underlying fields", () => {
        expect(WAITLIST_RANKING_POLICY_FACTOR_SOURCES.tier_employee_family).toContain("Person → Employee = Yes");
        expect(WAITLIST_RANKING_POLICY_FACTOR_SOURCES.tier_sibling_enrolled).toContain("Outcome = Enrolled");
        expect(WAITLIST_RANKING_POLICY_FACTOR_SOURCES.tier_sibling_enrolled).toContain("same location");
        expect(WAITLIST_RANKING_POLICY_FACTOR_SOURCES.tier_sister_center).toContain("different location");
        expect(WAITLIST_RANKING_POLICY_FACTORS.find((f) => f.bucketKey === "tier_employee_family")?.sourceKey).toBe(
            "persons.is_employee"
        );
    });

    it("resolveEffectivePriorityRuleConfig derives v1 defaults when metadata omits order/enabled keys", () => {
        const effective = resolveEffectivePriorityRuleConfig({
            profileId: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V1.profile_id,
        });
        expect(effective.hasFactors).toBe(true);
        expect(effective.ruleOrder).toEqual([...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]);
        expect(effective.ruleEnabledKeys.size).toBe(4);
        expect(effective.ruleEnabledKeys.has("tier_general_waitlist")).toBe(true);
    });

    it("resolveEffectivePriorityRuleConfig derives v2 defaults when metadata omits order/enabled keys", () => {
        const effective = resolveEffectivePriorityRuleConfig({
            profileId: CHILDCARE_ENROLLMENT_WAITLIST_PROFILE_V2.profile_id,
        });
        expect(effective.hasFactors).toBe(true);
        expect(effective.ruleOrder).toEqual([...CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1]);
        expect(effective.ruleEnabledKeys.size).toBe(4);
    });

    it("buildWaitlistRankingPolicySummary lists active factors in order", () => {
        const summary = buildWaitlistRankingPolicySummary({
            enabled: true,
            ruleOrder: CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
            enabledKeys: new Set(CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1),
            shadowMode: true,
            fallbackBucketKey: fb,
        });
        expect(summary.priorityChain).toContain("Employee families");
        expect(summary.priorityChain).toContain("→");
        expect(summary.priorityChain).not.toContain("No priority factors enabled");
        expect(summary.rankingMode).toBe("Preview ranking only");
        expect(summary.disabledFactorLabels).toEqual([]);
    });

    it("buildWaitlistActivePolicyStatus includes work unit and mode", () => {
        const status = buildWaitlistActivePolicyStatus({
            workUnitName: "Enrollment Pipeline",
            enabled: true,
            shadowMode: true,
        });
        expect(status.appliesToLine).toBe("This policy is active for: Enrollment Pipeline");
        expect(status.statusLine).toContain("active");
        expect(status.rankingModeLine).toBe("Preview ranking only");
    });

    it("buildWaitlistRankingPolicySummary marks disabled non-fallback factors", () => {
        const enabled = new Set(CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1);
        enabled.delete("tier_sister_center");
        const summary = buildWaitlistRankingPolicySummary({
            enabled: true,
            ruleOrder: CHILDCARE_ENROLLMENT_WAITLIST_PRIORITY_RULE_ORDER_V1,
            enabledKeys: enabled,
            shadowMode: false,
            fallbackBucketKey: fb,
            labels: WAITLIST_RANKING_POLICY_FACTOR_LABELS,
        });
        expect(summary.priorityChain).not.toContain("Siblings enrolled at another location");
        expect(summary.disabledFactorLabels).toEqual(["Siblings enrolled at another location"]);
        expect(summary.rankingMode).toBe("Ordered by ranking policy");
    });
});
