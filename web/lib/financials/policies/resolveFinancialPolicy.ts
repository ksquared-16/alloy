/**
 * Financial Policy resolution (Commercial Model, Slice C) — pure, recomputable.
 *
 * Most-specific-wins over the scope hierarchy Org -> Location -> Service ->
 * Rate Plan (Agreement is a future dimension), then latest effective_start.
 * Returns the resolved policy + its source scope + a clear missing/fallback
 * state. Pure functions only — no DB, no IO, no posting.
 *
 * Doctrine: docs/platform/modules/financial-platform-domain.md — resolution is
 * recomputable and never authoritative; only Posting writes money truth.
 */

import { compareIsoDates } from "@/lib/childcareOperational/effectiveDating";
import {
    POLICY_SCOPE_LABEL,
    type FinancialPolicyRow,
    type FinancialPolicyScopeType,
    type FinancialPolicyType,
} from "@/lib/financials/policies/financialPolicyTypes";

export type PolicyResolutionContext = {
    locationId?: string | null;
    serviceId?: string | null;
    ratePlanId?: string | null;
};

const SCOPE_SPECIFICITY: Record<FinancialPolicyScopeType, number> = {
    rate_plan: 4,
    service: 3,
    location: 2,
    org: 1,
};

function matchesContext(policy: FinancialPolicyRow, context: PolicyResolutionContext): boolean {
    switch (policy.scope_type) {
        case "org":
            return true;
        case "location":
            return !!policy.location_id && policy.location_id === context.locationId;
        case "service":
            return !!policy.service_id && policy.service_id === context.serviceId;
        case "rate_plan":
            return !!policy.rate_plan_id && policy.rate_plan_id === context.ratePlanId;
        default:
            return false;
    }
}

function isEffectiveOn(policy: FinancialPolicyRow, dateYmd: string): boolean {
    if (policy.is_active === false) return false;
    if (compareIsoDates(policy.effective_start, dateYmd) > 0) return false;
    if (policy.effective_end != null && compareIsoDates(dateYmd, policy.effective_end) > 0) return false;
    return true;
}

export type ResolvedPolicy =
    | {
          resolved: true;
          policy: FinancialPolicyRow;
          sourceScope: FinancialPolicyScopeType;
          sourceScopeLabel: string;
      }
    | { resolved: false; reason: "no_policy" };

/** Resolve the winning policy for a type + context on a date (most-specific-wins). */
export function resolveFinancialPolicy(
    policies: readonly FinancialPolicyRow[],
    policyType: FinancialPolicyType,
    context: PolicyResolutionContext,
    dateYmd: string,
): ResolvedPolicy {
    const matches = policies
        .filter((p) => p.policy_type === policyType && matchesContext(p, context) && isEffectiveOn(p, dateYmd))
        .slice()
        .sort((a, b) => {
            const scopeDiff = SCOPE_SPECIFICITY[b.scope_type] - SCOPE_SPECIFICITY[a.scope_type];
            if (scopeDiff !== 0) return scopeDiff;
            return compareIsoDates(b.effective_start, a.effective_start);
        });
    const winner = matches[0];
    if (!winner) return { resolved: false, reason: "no_policy" };
    return {
        resolved: true,
        policy: winner,
        sourceScope: winner.scope_type,
        sourceScopeLabel: POLICY_SCOPE_LABEL[winner.scope_type],
    };
}
