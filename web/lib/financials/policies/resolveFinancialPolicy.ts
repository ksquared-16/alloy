/**
 * Financial Policy resolution (Commercial Model, Slice C) — pure, recomputable.
 *
 * Most-specific-wins over the scope hierarchy Org -> Location -> Service -> Rate Plan -> Customer,
 * then latest effective_start. Customer is the ACCOUNT dimension and sits last deliberately: an
 * explicit account answer beats any inherited default.
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
    /*
     * The ACCOUNT, which is a different dimension from the three above: they narrow by what is
     * sold, this narrows by whose account it is. Most specific, because an explicit account answer
     * must beat an inherited default — a household attending two locations has no one default.
     */
    customerId?: string | null;
};

const SCOPE_SPECIFICITY: Record<FinancialPolicyScopeType, number> = {
    customer: 5,
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
        case "customer":
            return !!policy.customer_id && policy.customer_id === context.customerId;
        default:
            return false;
    }
}

/**
 * A WITHDRAWN rule never applied, on any date. `is_active` alone is not a lifecycle: a version that
 * stopped being current — superseded, or retired with no successor — still decided every date
 * inside its window, and a charge dated then must keep resolving it. Its recorded `effective_end`
 * is what retires it, so `is_active === false` withdraws a rule only when it carries no window end.
 *
 *   scheduled    effective_start after the date
 *   current      the date inside [effective_start, effective_end]
 *   superseded   effective_end before the date — and still resolvable for the dates it covered
 *
 * Rows retired before this rule were written `is_active = false` WITH an end, so they read as
 * superseded again: history is restored without rewriting a row.
 */
export function isWithdrawnPolicy(policy: Pick<FinancialPolicyRow, "is_active" | "effective_end">): boolean {
    return policy.is_active === false && policy.effective_end == null;
}

function isEffectiveOn(policy: FinancialPolicyRow, dateYmd: string): boolean {
    if (isWithdrawnPolicy(policy)) return false;
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
