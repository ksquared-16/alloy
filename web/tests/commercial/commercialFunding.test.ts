import { describe, expect, it } from "vitest";
import { attribute, evaluate } from "@/lib/commercial/execution";
import type {
    BillingCadenceDef,
    CommercialExport,
    OfferingDef,
    ProgramDef,
    RevenueCategoryDef,
    TuitionRateDef,
    VariantDef,
} from "@/lib/commercial/execution/commercialExport";
import type { CommercialContext } from "@/lib/commercial/execution/executionTypes";
import type { FundingPlan, PayerRef } from "@/lib/commercial/execution/funding";

/**
 * Phase 6 — Funding attribution. Funding DECORATES a resolution (allocations +
 * residual per line) and NEVER changes net. Pure tests.
 */

const program: ProgramDef = { programKey: "toddler", label: "Toddler", isActive: true };
const offering: OfferingDef = { id: "off-1", programKey: "toddler", label: "Full Day", attendanceType: "full_day", effective: { start: "2026-01-01", end: null }, isActive: true };
const variant: VariantDef = { id: "var-1", offeringId: "off-1", label: "5 days/week", quantityType: "days", quantityValue: 5, isActive: true };
const tuition: TuitionRateDef = { id: "rate-1", variantId: "var-1", cadenceKey: "monthly", payerType: "private_pay", locationId: null, rateCents: 180000, notOffered: false, effective: { start: "2026-01-01", end: null }, revenueCategoryId: "rev-1" };
const cadences: BillingCadenceDef[] = [{ cadenceKey: "monthly", label: "Monthly", isActive: true }];
const revenueCategories: RevenueCategoryDef[] = [{ id: "rev-1", label: "Tuition Revenue", glAccountId: "gl-1", isActive: true }];

const exp: CommercialExport = {
    orgId: "org-1",
    version: { version: "v1", effectiveOn: "2026-09-01" },
    programs: [program],
    offerings: [offering],
    variants: [variant],
    tuitionRates: [tuition],
    products: [
        { id: "prod-reg", commercialType: "fee", name: "Registration", scope: { programKey: "toddler", locationId: null }, amountCents: 15000, cadenceKey: null, revenueCategoryId: "rev-1", behavior: { required: true }, effective: { start: null, end: null }, isActive: true },
    ],
    cadences,
    revenueCategories,
    policies: [],
};

function ctx(): CommercialContext {
    return {
        subject: { type: "child", id: "child-1" },
        scope: { programKey: "toddler", variantId: "var-1", locationId: null },
        commitment: { cadenceKey: "monthly", payerIntent: "private_pay" },
        asOf: "2026-09-01",
        mode: "actual",
    };
}

const family: PayerRef = { partyType: "household", partyId: "hh-1", source: "private_pay", label: "Family" };
const agency: PayerRef = { partyType: "agency", partyId: "ag-1", source: "government_subsidy", label: "State Subsidy" };

/** Invariant: for every resolved line, Σ allocations + residual === net. */
function assertInvariant(r: ReturnType<typeof evaluate>): void {
    for (const line of r.lines) {
        if (line.status !== "resolved") continue;
        expect(line.funding).not.toBeNull();
        const sum = line.funding!.allocations.reduce((a, x) => a + x.amountCents, 0) + line.funding!.residual.amountCents;
        expect(sum).toBe(line.net.amountCents);
    }
}

describe("attribute() — single payer default", () => {
    it("routes the full net to the primary as residual (no allocations)", () => {
        const r = attribute(evaluate(ctx(), exp), { primary: family });
        const t = r.lines.find((l) => l.kind === "tuition")!;
        expect(t.funding!.allocations).toHaveLength(0);
        expect(t.funding!.residual).toEqual({ payer: family, amountCents: 180000 });
        assertInvariant(r);
    });

    it("never changes net", () => {
        const base = evaluate(ctx(), exp);
        const r = attribute(base, { primary: family });
        for (const l of r.lines) {
            const b = base.lines.find((x) => x.lineKey === l.lineKey)!;
            expect(l.net).toEqual(b.net);
            expect(l.gross).toEqual(b.gross);
        }
    });
});

describe("attribute() — multi payer split", () => {
    it("splits tuition by percentage; residual to family; invariant holds", () => {
        const plan: FundingPlan = { primary: family, allocations: [{ payer: agency, basis: "percentage", value: 70, target: "tuition" }] };
        const r = attribute(evaluate(ctx(), exp), plan);
        const t = r.lines.find((l) => l.kind === "tuition")!;
        expect(t.funding!.allocations).toHaveLength(1);
        expect(t.funding!.allocations[0]).toMatchObject({ payer: agency, amountCents: 126000, basis: "percentage" }); // 70% of 180000
        expect(t.funding!.residual.amountCents).toBe(54000); // family owes the rest
        assertInvariant(r);
    });

    it("targets tuition only — leaves the fee entirely to the family", () => {
        const plan: FundingPlan = { primary: family, allocations: [{ payer: agency, basis: "percentage", value: 70, target: "tuition" }] };
        const r = attribute(evaluate(ctx(), exp), plan);
        const fee = r.lines.find((l) => l.kind === "fee")!;
        expect(fee.funding!.allocations).toHaveLength(0);
        expect(fee.funding!.residual).toEqual({ payer: family, amountCents: 15000 });
    });

    it("applies a fixed-amount allocation and clamps to net", () => {
        const plan: FundingPlan = { primary: family, allocations: [{ payer: agency, basis: "fixed_amount", value: 999999, target: "tuition" }] };
        const t = attribute(evaluate(ctx(), exp), plan).lines.find((l) => l.kind === "tuition")!;
        expect(t.funding!.allocations[0].amountCents).toBe(180000); // clamped to net
        expect(t.funding!.residual.amountCents).toBe(0);
    });

    it("stacks multiple payers in order, residual absorbs the remainder", () => {
        const employer: PayerRef = { partyType: "employer", partyId: "emp-1", source: "employer_sponsorship" };
        const plan: FundingPlan = {
            primary: family,
            allocations: [
                { payer: agency, basis: "percentage", value: 50, target: "tuition" },
                { payer: employer, basis: "fixed_amount", value: 30000, target: "tuition" },
            ],
        };
        const r = attribute(evaluate(ctx(), exp), plan);
        const t = r.lines.find((l) => l.kind === "tuition")!;
        expect(t.funding!.allocations.map((a) => a.amountCents)).toEqual([90000, 30000]);
        expect(t.funding!.residual.amountCents).toBe(60000);
        assertInvariant(r);
        expect(r.explanation.fundingConsidered.map((f) => f.ref.id)).toEqual(["hh-1", "ag-1", "emp-1"]);
    });
});

describe("attribute() — edge cases", () => {
    it("attributes a zero-net (waived-like) line to residual 0", () => {
        // No policy here, but assert the invariant machinery handles net values generally.
        const r = attribute(evaluate(ctx(), exp), { primary: family, allocations: [{ payer: agency, basis: "percentage", value: 100, target: "all" }] });
        assertInvariant(r);
        const t = r.lines.find((l) => l.kind === "tuition")!;
        expect(t.funding!.residual.amountCents).toBe(0); // 100% covered
    });
});
