import { describe, expect, it } from "vitest";
import { mapCommercialResolutionToBillingProjection } from "@/lib/scheduling/billing/billingScheduleProjection";
import type {
    CommercialResolution,
    ResolvedCommercialLine,
} from "@/lib/commercial/execution/executionTypes";

const COMPUTED_AT = "2026-07-21T12:00:00.000Z";

function tuitionLine(over: Partial<ResolvedCommercialLine> = {}): ResolvedCommercialLine {
    return {
        lineKey: "tuition-1",
        status: "resolved",
        kind: "tuition",
        source: { entity: "commercial_tuition_rates", id: "rate-toddler-fw" },
        cadence: { cadenceKey: "monthly", label: "Monthly" },
        gross: { amountCents: 110000, currency: "USD" },
        adjustments: [],
        net: { amountCents: 110000, currency: "USD" },
        funding: null,
        accounting: {} as ResolvedCommercialLine["accounting"],
        behavior: {},
        explanation: {} as ResolvedCommercialLine["explanation"],
        ...over,
    };
}

function resolution(lines: ResolvedCommercialLine[], over: Partial<CommercialResolution> = {}): CommercialResolution {
    return {
        resolutionKey: "rk",
        configVersion: { version: "v1", effectiveOn: "2026-07-01" },
        context: {} as CommercialResolution["context"],
        status: "resolved",
        lines,
        warnings: [],
        precision: { currency: "USD", roundingRule: "half_up" },
        effective: { asOf: "2026-07-28" },
        explanation: {} as CommercialResolution["explanation"],
        ...over,
    };
}

describe("mapCommercialResolutionToBillingProjection", () => {
    it("maps a plain tuition line to a resolved projection with family responsibility = base", () => {
        const p = mapCommercialResolutionToBillingProjection(resolution([tuitionLine()]), {
            computedAt: COMPUTED_AT,
        });
        expect(p.status).toBe("resolved");
        expect(p.recommendedRate?.baseAmount.amountCents).toBe(110000);
        expect(p.recommendedRate?.recurringFrequency).toBe("monthly");
        expect(p.totals.familyResponsibility.amountCents).toBe(110000);
        expect(p.selectedRate?.selectionSource).toBe("recommended");
        expect(p.freshness.computedAt).toBe(COMPUTED_AT);
    });

    it("surfaces numeric discounts and reduces the total", () => {
        const line = tuitionLine({
            adjustments: [
                { kind: "sibling_discount", amountCents: -12000, source: { entity: "commercial_policies", id: "p1" }, label: "Sibling discount" },
            ],
            net: { amountCents: 98000, currency: "USD" },
        });
        const p = mapCommercialResolutionToBillingProjection(resolution([line]), { computedAt: COMPUTED_AT });
        expect(p.discounts).toHaveLength(1);
        expect(p.discounts[0].name).toBe("Sibling discount");
        expect(p.discounts[0].amount.amountCents).toBe(12000);
        expect(p.totals.totalDiscounts.amountCents).toBe(12000);
    });

    it("maps funding allocations and residual to family responsibility", () => {
        const line = tuitionLine({
            funding: {
                allocations: [
                    {
                        payer: { partyType: "agency", partyId: "a1", source: "government_subsidy", label: "State subsidy" },
                        amountCents: 65000,
                        basis: "fixed" as never,
                    },
                ],
                residual: { payer: { partyType: "household", partyId: "h1", source: "private_pay" }, amountCents: 45000 },
            },
        });
        const p = mapCommercialResolutionToBillingProjection(resolution([line]), { computedAt: COMPUTED_AT });
        expect(p.funding).toHaveLength(1);
        expect(p.funding[0].name).toBe("State subsidy");
        expect(p.funding[0].projectedAmount?.amountCents).toBe(65000);
        expect(p.totals.totalFunding.amountCents).toBe(65000);
        expect(p.totals.familyResponsibility.amountCents).toBe(45000);
    });

    it("reports unconfigured when tuition is unpriced", () => {
        const p = mapCommercialResolutionToBillingProjection(
            resolution([], { warnings: [{ code: "tuition_unpriced", message: "No rate for scope" }] }),
            { computedAt: COMPUTED_AT }
        );
        expect(p.status).toBe("unconfigured");
        expect(p.recommendedRate).toBeNull();
        expect(p.warnings).toContain("No rate for scope");
    });
});
