/**
 * Shared most-specific-wins, effective-dated resolver for childcare config rules.
 *
 * Precedence (doctrine):  room > program > site > org   (scope is primary)
 * Secondary:              age-group-specific rule beats age-group-null rule
 * Tertiary:               latest effective_start wins (config versioning)
 *
 * Pure functions only — no DB, no IO. The same resolver is the single source of
 * "which rule applies" for every surface; nothing re-implements precedence.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import type {
    ConfigRuleEffectiveColumns,
    ConfigRuleScopeColumns,
    ConfigRuleScopeContext,
    ConfigRuleScopeType,
} from "@/lib/childcareOperational/config/configRuleTypes";

export type ResolvableConfigRule = ConfigRuleScopeColumns &
    ConfigRuleEffectiveColumns & {
        age_group_key?: string | null;
    };

const SCOPE_SPECIFICITY: Record<ConfigRuleScopeType, number> = {
    room: 4,
    program: 3,
    site: 2,
    org: 1,
};

export function scopeSpecificity(scopeType: ConfigRuleScopeType): number {
    return SCOPE_SPECIFICITY[scopeType] ?? 0;
}

/** Whether a rule's scope + age-group dimension applies to the given context. */
export function ruleMatchesContext(
    rule: ResolvableConfigRule,
    context: ConfigRuleScopeContext
): boolean {
    switch (rule.scope_type) {
        case "org":
            break;
        case "site":
            if (!rule.site_location_id || rule.site_location_id !== context.siteLocationId) return false;
            break;
        case "program":
            if (!rule.program_category_id || rule.program_category_id !== context.programCategoryId) {
                return false;
            }
            break;
        case "room":
            if (!rule.room_location_id || rule.room_location_id !== context.roomLocationId) return false;
            break;
        default:
            return false;
    }

    // age-group dimension narrows further; null matches any age group.
    const ruleAge = rule.age_group_key ?? null;
    if (ruleAge !== null && ruleAge !== (context.ageGroupKey ?? null)) {
        return false;
    }

    return true;
}

/** Whether a rule is effective on a given calendar date (YYYY-MM-DD). */
export function isRuleEffectiveOn(rule: ConfigRuleEffectiveColumns, dateYmd: string): boolean {
    if (compareIsoDates(rule.effective_start, dateYmd) > 0) return false;
    if (rule.effective_end != null && compareIsoDates(dateYmd, rule.effective_end) > 0) return false;
    return true;
}

function ageGroupSpecificity(rule: ResolvableConfigRule): number {
    return rule.age_group_key != null ? 1 : 0;
}

/**
 * Rank: scope specificity desc, then age-group specificity desc, then latest
 * effective_start desc. Deterministic for equal keys via stable input order.
 */
function compareRulePrecedence(a: ResolvableConfigRule, b: ResolvableConfigRule): number {
    const scopeDiff = scopeSpecificity(b.scope_type) - scopeSpecificity(a.scope_type);
    if (scopeDiff !== 0) return scopeDiff;

    const ageDiff = ageGroupSpecificity(b) - ageGroupSpecificity(a);
    if (ageDiff !== 0) return ageDiff;

    // latest effective_start wins
    return compareIsoDates(b.effective_start, a.effective_start);
}

/** All rules applicable to the context on the date, most-specific first. */
export function resolveMatchingConfigRules<T extends ResolvableConfigRule>(
    rules: readonly T[],
    context: ConfigRuleScopeContext,
    dateYmd: string
): T[] {
    return rules
        .filter((r) => ruleMatchesContext(r, context) && isRuleEffectiveOn(r, dateYmd))
        .slice()
        .sort(compareRulePrecedence);
}

/** The single winning rule for the context on the date, or null. */
export function resolveConfigRule<T extends ResolvableConfigRule>(
    rules: readonly T[],
    context: ConfigRuleScopeContext,
    dateYmd: string
): T | null {
    const matches = resolveMatchingConfigRules(rules, context, dateYmd);
    return matches.length > 0 ? matches[0] : null;
}
