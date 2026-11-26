/**
 * Commercial Execution — Commercial policy selection (pure, lifted).
 *
 * Most-specific-wins over the Commercial scope hierarchy
 *   org < location < program < offering < variant
 * then latest effective_start — the same algorithm as the legacy financial policy
 * resolver, re-sourced to Commercial scope keys. Selection only: it picks the
 * winning policy; it does NOT modify amounts (that is applyPolicies).
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7.
 */

import type { CommercialExport, CommercialPolicyDef, CommercialPolicyScopeType } from "@/lib/commercial/execution/commercialExport";
import { isEffective } from "@/lib/commercial/execution/evaluate/evalUtils";
import type { CommercialPolicyType } from "@/lib/commercial/execution/policy/policyTypes";

/** The coordinates a policy is resolved against (a line's / context's scope). */
export type PolicyScopeContext = {
    locationId: string | null;
    programKey: string | null;
    offeringId: string | null;
    variantId: string | null;
};

const SPECIFICITY: Record<CommercialPolicyScopeType, number> = {
    variant: 5,
    offering: 4,
    program: 3,
    location: 2,
    org: 1,
};

function matchesScope(policy: CommercialPolicyDef, ctx: PolicyScopeContext): boolean {
    switch (policy.scopeType) {
        case "org":
            return true;
        case "location":
            return !!policy.scope.locationId && policy.scope.locationId === ctx.locationId;
        case "program":
            return !!policy.scope.programKey && policy.scope.programKey === ctx.programKey;
        case "offering":
            return !!policy.scope.offeringId && policy.scope.offeringId === ctx.offeringId;
        case "variant":
            return !!policy.scope.variantId && policy.scope.variantId === ctx.variantId;
        default:
            return false;
    }
}

/** Resolve the single winning policy of a type for a scope on a date (most-specific-wins). */
export function resolvePolicy(
    exp: CommercialExport,
    policyType: CommercialPolicyType,
    ctx: PolicyScopeContext,
    asOf: string,
): CommercialPolicyDef | null {
    const matches = exp.policies
        .filter((p) => p.kind === policyType && p.isActive && matchesScope(p, ctx) && isEffective(p.effective, asOf))
        .sort((a, b) => {
            const d = SPECIFICITY[b.scopeType] - SPECIFICITY[a.scopeType];
            if (d !== 0) return d;
            return (b.effective.start ?? "").localeCompare(a.effective.start ?? "");
        });
    return matches[0] ?? null;
}
