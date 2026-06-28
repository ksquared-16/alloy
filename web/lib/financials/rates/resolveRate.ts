/**
 * Rate Resolution (P3.2) — pure read model.
 *
 * Answers: "Given org/site/program/room/age-group/schedule basis/date, what rate
 * plan + rate rule applies, and at what amount/currency/basis?"
 *
 * This is NOT Charge Resolution: it computes nothing billable, creates no charge,
 * and has no side effects. It only selects the applicable configuration.
 *
 * Precedence:
 *   Plan:  most-specific scope wins (room > program > site > org), then
 *          age-group-specific beats age-group-null, then latest effective_start.
 *          (Delegated to the shared config resolver so precedence is defined once.)
 *   Rule:  within the resolved plan, the rule matching schedule_basis wins; an
 *          age-group-specific rule beats an age-group-null rule; then latest
 *          effective_start.
 *
 * Pure functions only — no DB, no IO.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import {
    isRuleEffectiveOn,
    resolveConfigRule,
} from "@/lib/childcareOperational/config/resolveConfigRule";
import type { ConfigRuleScopeContext } from "@/lib/childcareOperational/config/configRuleTypes";
import type {
    CalculationStrategy,
    ChildcareRatePlanRow,
    ChildcareRateRuleRow,
    RateBasis,
    ScheduleBasis,
} from "@/lib/financials/rates/rateTypes";

export type RateResolutionContext = ConfigRuleScopeContext & {
    scheduleBasis: ScheduleBasis;
    /** Optional disambiguation when an org runs multiple named plans at a scope. */
    planKey?: string | null;
};

export type ResolvedRate = {
    resolved: true;
    plan: ChildcareRatePlanRow;
    rule: ChildcareRateRuleRow;
    amountCents: number;
    currencyCode: string;
    rateBasis: RateBasis;
    scheduleBasis: ScheduleBasis;
    calculationStrategy: CalculationStrategy;
};

export type UnresolvedRate = {
    resolved: false;
    reason: "no_plan" | "no_rule";
    plan: ChildcareRatePlanRow | null;
};

export type RateResolution = ResolvedRate | UnresolvedRate;

function ageSpecificity(ageGroupKey: string | null): number {
    return ageGroupKey != null ? 1 : 0;
}

/**
 * Resolve the applicable plan for a context/date. Optionally narrowed by planKey.
 * Inactive plans are excluded. Delegates precedence to the shared config resolver.
 */
export function resolveRatePlan(
    plans: readonly ChildcareRatePlanRow[],
    context: RateResolutionContext,
    dateYmd: string
): ChildcareRatePlanRow | null {
    const pool = plans.filter((p) => {
        if (p.is_active === false) return false;
        if (context.planKey != null && p.plan_key !== context.planKey) return false;
        return true;
    });
    return resolveConfigRule<ChildcareRatePlanRow>(pool, context, dateYmd);
}

/**
 * Resolve the winning rule within an already-selected plan for a schedule basis
 * + age group + date. Age-group-specific beats null; then latest effective_start.
 */
export function resolveRateRule(
    rules: readonly ChildcareRateRuleRow[],
    planId: string,
    context: { scheduleBasis: ScheduleBasis; ageGroupKey?: string | null },
    dateYmd: string
): ChildcareRateRuleRow | null {
    const contextAge = context.ageGroupKey ?? null;
    const matches = rules
        .filter((r) => r.rate_plan_id === planId)
        .filter((r) => r.schedule_basis === context.scheduleBasis)
        .filter((r) => {
            const ruleAge = r.age_group_key ?? null;
            return ruleAge === null || ruleAge === contextAge;
        })
        .filter((r) => isRuleEffectiveOn(r, dateYmd))
        .slice()
        .sort((a, b) => {
            const ageDiff = ageSpecificity(b.age_group_key ?? null) - ageSpecificity(a.age_group_key ?? null);
            if (ageDiff !== 0) return ageDiff;
            return compareIsoDates(b.effective_start, a.effective_start);
        });
    return matches.length > 0 ? matches[0] : null;
}

/**
 * Full Rate Resolution: pick the plan, then the rule, and return the applicable
 * amount + currency + basis. Returns a structured unresolved result (never throws
 * for "not configured") so callers can surface a clear "no rate" state.
 */
export function resolveRate(
    input: {
        plans: readonly ChildcareRatePlanRow[];
        rules: readonly ChildcareRateRuleRow[];
        context: RateResolutionContext;
        dateYmd: string;
    }
): RateResolution {
    const plan = resolveRatePlan(input.plans, input.context, input.dateYmd);
    if (!plan) {
        return { resolved: false, reason: "no_plan", plan: null };
    }

    const rule = resolveRateRule(
        input.rules,
        plan.id,
        { scheduleBasis: input.context.scheduleBasis, ageGroupKey: input.context.ageGroupKey },
        input.dateYmd
    );
    if (!rule) {
        return { resolved: false, reason: "no_rule", plan };
    }

    return {
        resolved: true,
        plan,
        rule,
        amountCents: rule.amount_cents,
        currencyCode: plan.currency_code,
        rateBasis: rule.rate_basis,
        scheduleBasis: rule.schedule_basis,
        calculationStrategy: plan.calculation_strategy,
    };
}
