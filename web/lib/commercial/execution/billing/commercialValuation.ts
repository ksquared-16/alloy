/**
 * Commercial Execution — Billing consumer: tuition valuation (pure).
 *
 * The Phase-9 seam. Given the enrollment's program_key + scheduleBasis + location,
 * resolve the Commercial scope, run evaluate() (policy-adjusted), and return the
 * tuition `net` for Billing to feed into the charge template's amount. Returns a
 * typed `unresolved` (with reason) when Commercial can't price — Billing surfaces
 * that; it NEVER falls back to Substrate A.
 *
 * Doctrine: docs/platform/core/commercial-execution-platform.md §8 (Phase 9).
 */

import type { CommercialExport } from "@/lib/commercial/execution/commercialExport";
import type { CommercialContext, PayerType } from "@/lib/commercial/execution/executionTypes";
import { evaluate } from "@/lib/commercial/execution/evaluate/evaluate";
import { resolveCommercialScope, type CommercialScopeReason } from "@/lib/commercial/execution/billing/resolveCommercialScope";

export type CommercialValuationReason = CommercialScopeReason | "no_tuition_line" | "tuition_not_offered" | "tuition_unresolved";

export type CommercialValuation =
    | {
          resolved: true;
          amountCents: number;
          currencyCode: string;
          offeringId: string;
          variantId: string;
          cadenceKey: string;
          revenueCategoryId: string | null;
          /** Whether the priced net differs from gross (a policy adjustment applied). */
          policyAdjusted: boolean;
      }
    | { resolved: false; reason: CommercialValuationReason };

export function getCommercialTuitionValuation(
    cfg: CommercialExport,
    args: { programKey: string; scheduleBasis: string; locationId: string | null; asOf: string; cadenceKey?: string; payerType?: PayerType },
): CommercialValuation {
    const scope = resolveCommercialScope(cfg, { programKey: args.programKey, scheduleBasis: args.scheduleBasis, cadenceKey: args.cadenceKey, payerType: args.payerType });
    if (!scope.resolved) return { resolved: false, reason: scope.reason };

    const context: CommercialContext = {
        subject: { type: "child", id: null },
        scope: { programKey: args.programKey, offeringId: scope.offeringId, variantId: scope.variantId, locationId: args.locationId },
        commitment: { cadenceKey: scope.cadenceKey, payerIntent: scope.payerType },
        asOf: args.asOf,
        mode: "actual",
    };

    const resolution = evaluate(context, cfg);
    const tuition = resolution.lines.find((l) => l.kind === "tuition");
    if (!tuition) return { resolved: false, reason: "no_tuition_line" };
    if (tuition.status === "not_offered") return { resolved: false, reason: "tuition_not_offered" };
    if (tuition.status !== "resolved") return { resolved: false, reason: "tuition_unresolved" };

    return {
        resolved: true,
        amountCents: tuition.net.amountCents,
        currencyCode: tuition.net.currency,
        offeringId: scope.offeringId,
        variantId: scope.variantId,
        cadenceKey: scope.cadenceKey,
        revenueCategoryId: tuition.accounting.revenueCategoryId,
        policyAdjusted: tuition.net.amountCents !== tuition.gross.amountCents,
    };
}
