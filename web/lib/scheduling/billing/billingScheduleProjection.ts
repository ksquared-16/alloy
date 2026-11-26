/**
 * BillingScheduleProjection — the read-only financial projection Scheduling
 * DISPLAYS (Billing owns every amount + the ledger).
 *
 * Per `billing-rate-resolution-contract.md` §2, this is a **read-shaping over the
 * existing write-free commercial pipeline** (`evaluate → attribute → expand`),
 * NOT new pricing. The interim binding (approved) calls that pipeline on the
 * Scheduling side and maps its `CommercialResolution` here; the shape is stable
 * so a later Billing-owned endpoint is a drop-in.
 *
 * Money stays in platform cents — consumers MUST NOT re-round (one engine, one
 * answer). Scheduling computes no amount and persists only the selected-rate
 * reference elsewhere.
 */

import type {
    CommercialResolution,
    ResolvedCommercialLine,
    Money,
} from "@/lib/commercial/execution/executionTypes";

export type BillingProjectionStatus = "resolved" | "pending" | "unconfigured" | "stale";

export type BillingScheduleRate = {
    rateId: string;
    name: string;
    basis: string; // cadence key (e.g. "monthly")
    recurringFrequency: string;
    baseAmount: Money;
    reason: string;
};

export type BillingScheduleDiscount = { name: string; amount: Money };

export type BillingScheduleFunding = {
    name: string;
    projectedAmount: Money | null;
    status: "projected" | "pending";
};

export type BillingScheduleTotals = {
    baseRecurringTuition: Money;
    totalDiscounts: Money;
    totalFunding: Money;
    familyResponsibility: Money;
    recurringFrequency: string;
};

export type BillingScheduleProjection = {
    status: BillingProjectionStatus;
    effectiveFrom: string;
    effectiveTo: string | null;
    recommendedRate: BillingScheduleRate | null;
    selectedRate: { rateId: string; selectionSource: "recommended" | "operator"; overridden: boolean } | null;
    eligibleRates: BillingScheduleRate[];
    discounts: BillingScheduleDiscount[];
    funding: BillingScheduleFunding[];
    totals: BillingScheduleTotals;
    warnings: string[];
    freshness: { computedAt: string; state: "fresh" | "stale" };
};

function money(amountCents: number, currency: string): Money {
    return { amountCents, currency };
}

function isTuition(line: ResolvedCommercialLine): boolean {
    return line.kind === "tuition";
}

/**
 * Pure: shape a `CommercialResolution` (from the write-free commercial preview)
 * into the Scheduling-facing `BillingScheduleProjection`. `computedAt` is injected.
 */
export function mapCommercialResolutionToBillingProjection(
    resolution: CommercialResolution,
    opts: { computedAt: string }
): BillingScheduleProjection {
    const currency = resolution.precision.currency;
    const tuitionLines = resolution.lines.filter(isTuition);

    const baseRecurring = tuitionLines.reduce((sum, l) => sum + l.gross.amountCents, 0);

    const discounts: BillingScheduleDiscount[] = [];
    let totalDiscounts = 0;
    for (const line of tuitionLines) {
        for (const adj of line.adjustments) {
            if (adj.amountCents < 0) {
                const magnitude = -adj.amountCents;
                totalDiscounts += magnitude;
                discounts.push({
                    name: adj.label ?? adj.kind,
                    amount: money(magnitude, currency),
                });
            }
        }
    }

    const funding: BillingScheduleFunding[] = [];
    let totalFunding = 0;
    let familyResponsibility = 0;
    for (const line of tuitionLines) {
        if (line.funding) {
            for (const alloc of line.funding.allocations) {
                totalFunding += alloc.amountCents;
                funding.push({
                    name: alloc.payer.label ?? alloc.payer.source,
                    projectedAmount: money(alloc.amountCents, currency),
                    status: "projected",
                });
            }
            familyResponsibility += line.funding.residual.amountCents;
        } else {
            // Funding did not run → the full net is the family's responsibility.
            familyResponsibility += line.net.amountCents;
        }
    }

    const primary = tuitionLines[0] ?? null;
    const recurringFrequency = primary?.cadence?.cadenceKey ?? "month";

    const recommendedRate: BillingScheduleRate | null = primary
        ? {
              rateId: primary.source.id,
              name: primary.cadence?.label ?? primary.cadence?.cadenceKey ?? "Tuition",
              basis: primary.cadence?.cadenceKey ?? recurringFrequency,
              recurringFrequency,
              baseAmount: money(primary.gross.amountCents, currency),
              reason: "Resolved by Billing for this schedule",
          }
        : null;

    const warnings = resolution.warnings.map((w) => w.message);

    let status: BillingProjectionStatus;
    if (!primary || resolution.warnings.some((w) => w.code === "tuition_unpriced" || w.code === "no_tuition_context")) {
        status = "unconfigured";
    } else if (resolution.status === "resolved") {
        status = "resolved";
    } else {
        status = "pending";
    }

    return {
        status,
        effectiveFrom: resolution.effective.window?.start ?? resolution.effective.asOf,
        effectiveTo: resolution.effective.window?.end ?? null,
        recommendedRate,
        selectedRate: recommendedRate
            ? { rateId: recommendedRate.rateId, selectionSource: "recommended", overridden: false }
            : null,
        // Enumerating alternative eligible rates is a deferred small extension; V1
        // presents the recommended rate as the sole eligible option.
        eligibleRates: recommendedRate ? [recommendedRate] : [],
        discounts,
        funding,
        totals: {
            baseRecurringTuition: money(baseRecurring, currency),
            totalDiscounts: money(totalDiscounts, currency),
            totalFunding: money(totalFunding, currency),
            familyResponsibility: money(familyResponsibility, currency),
            recurringFrequency,
        },
        warnings,
        freshness: { computedAt: opts.computedAt, state: "fresh" },
    };
}
