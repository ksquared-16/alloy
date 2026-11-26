/**
 * Shared most-specific-wins, effective-dated resolver for childcare config rules.
 *
 * Precedence (doctrine):  room > program > site > org   (scope is primary)
 * Secondary:              age-group-specific rule beats age-group-null rule
 * Tertiary:               latest effective_start wins (config versioning)
 * Final tiebreak:         latest created_at, then smallest id (deterministic)
 *
 * The final tiebreak makes resolution deterministic when two rules are otherwise
 * indistinguishable (identical scope, age dimension, and effective_start) —
 * previously the winner depended on unspecified DB fetch / sort-stability order
 * (RFC §12; consumer inventory A7). It only engages when both rules carry the
 * optional `id` / `created_at` metadata, so callers with bare test rules are
 * unaffected.
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
        /** Optional stable metadata used only for the deterministic final tiebreak. */
        id?: string;
        created_at?: string;
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
 * effective_start desc, then a deterministic final tiebreak (latest created_at,
 * then smallest id). The final tiebreak only engages when both rules carry the
 * optional metadata; otherwise ordering is left stable for equal keys.
 */
function compareRulePrecedence(a: ResolvableConfigRule, b: ResolvableConfigRule): number {
    const scopeDiff = scopeSpecificity(b.scope_type) - scopeSpecificity(a.scope_type);
    if (scopeDiff !== 0) return scopeDiff;

    const ageDiff = ageGroupSpecificity(b) - ageGroupSpecificity(a);
    if (ageDiff !== 0) return ageDiff;

    // latest effective_start wins
    const startDiff = compareIsoDates(b.effective_start, a.effective_start);
    if (startDiff !== 0) return startDiff;

    // deterministic final tiebreak: latest created_at wins, then smallest id.
    if (a.created_at != null && b.created_at != null && a.created_at !== b.created_at) {
        return a.created_at > b.created_at ? -1 : 1;
    }
    if (a.id != null && b.id != null && a.id !== b.id) {
        return a.id < b.id ? -1 : 1;
    }
    return 0;
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
