/**
 * Commercial Execution — Billing consumer surface (Phase 9).
 *
 * The seam by which the shipped consumption runtime prices tuition from Commercial
 * Execution instead of Substrate A. No flag, no fallback: resolves or surfaces a
 * typed unresolved reason.
 */

export {
    resolveCommercialScope,
    type CommercialScopeResolution,
    type CommercialScopeReason,
} from "@/lib/commercial/execution/billing/resolveCommercialScope";
export {
    getCommercialTuitionValuation,
    type CommercialValuation,
    type CommercialValuationReason,
} from "@/lib/commercial/execution/billing/commercialValuation";
