/**
 * Commercial Execution — Policy stage public surface.
 *
 * Commercial-owned policy definitions, evaluated inside Execution: they MODIFY a
 * Commercial Resolution and never create charges. Selection (most-specific-wins)
 * + application (adjustments on net). Resolution-time types only.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §7.
 */

export {
    COMMERCIAL_POLICY_TYPES,
    type CommercialPolicyType,
    isCommercialPolicyType,
    type PolicyAppliesTo,
    appliesToKind,
    readDiscount,
    readSiblingDiscount,
    readAppliesTo,
} from "@/lib/commercial/execution/policy/policyTypes";
export { resolvePolicy, type PolicyScopeContext } from "@/lib/commercial/execution/policy/resolvePolicy";
export {
    applyLinePolicies,
    applySiblingDiscountToSet,
    computeDiscountCents,
    recomputeNet,
    type PolicyConsidered,
} from "@/lib/commercial/execution/policy/applyPolicies";
