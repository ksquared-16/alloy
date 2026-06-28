/**
 * Eligibility + policy evaluation over childcare_schedule_rules.
 *
 * schedule_patterns remain the child schedule intent/catalog (L2). These rules
 * are L1 operating policy: which schedule types / age bands are eligible and
 * min/max days. Pure functions only.
 */

import { resolveConfigRule } from "@/lib/childcareOperational/config/resolveConfigRule";
import type {
    ChildcareScheduleRuleRow,
    ConfigRuleScopeContext,
} from "@/lib/childcareOperational/config/configRuleTypes";

export function resolveScheduleRule(
    rules: readonly ChildcareScheduleRuleRow[],
    context: ConfigRuleScopeContext,
    dateYmd: string
): ChildcareScheduleRuleRow | null {
    return resolveConfigRule<ChildcareScheduleRuleRow>(rules, context, dateYmd);
}

/** Eligible when no rule applies, the rule sets no constraint, or the key is listed. */
export function isScheduleTypeEligible(
    rule: ChildcareScheduleRuleRow | null,
    scheduleTypeKey: string | null | undefined
): boolean {
    if (!rule || rule.eligible_schedule_type_keys == null) return true;
    if (!scheduleTypeKey) return false;
    return rule.eligible_schedule_type_keys.includes(scheduleTypeKey);
}

export function isAgeGroupEligible(
    rule: ChildcareScheduleRuleRow | null,
    ageGroupKey: string | null | undefined
): boolean {
    if (!rule || rule.eligible_age_group_keys == null) return true;
    if (!ageGroupKey) return false;
    return rule.eligible_age_group_keys.includes(ageGroupKey);
}

export type DaysPolicyResult = {
    withinPolicy: boolean;
    belowMin: boolean;
    aboveMax: boolean;
};

export function evaluateDaysPolicy(
    rule: ChildcareScheduleRuleRow | null,
    daysPerWeek: number
): DaysPolicyResult {
    if (!rule) return { withinPolicy: true, belowMin: false, aboveMax: false };
    const belowMin = rule.min_days_per_week != null && daysPerWeek < rule.min_days_per_week;
    const aboveMax = rule.max_days_per_week != null && daysPerWeek > rule.max_days_per_week;
    return { withinPolicy: !belowMin && !aboveMax, belowMin, aboveMax };
}
