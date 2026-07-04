import { describe, expect, it } from "vitest";
import { evaluate, evaluateSet } from "@/lib/commercial/execution";
import type {
    BillingCadenceDef,
    CommercialExport,
    CommercialPolicyDef,
    OfferingDef,
    ProgramDef,
    RevenueCategoryDef,
    TuitionRateDef,
    VariantDef,
} from "@/lib/commercial/execution/commercialExport";
import type { CommercialContext } from "@/lib/commercial/execution/executionTypes";

/**
 * Phase 5 — Policy stage. Policies MODIFY the resolution (adjustments → net) and
 * never create charges. Pure tests over hand-built exports incl. commercial_policies.
 */

const program: ProgramDef = { programKey: "toddler", label: "Toddler", isActive: true };
const offering: OfferingDef = { id: "off-1", programKey: "toddler", label: "Full Day", attendanceType: "full_day", effective: { start: "2026-01-01", end: null }, isActive: true };
const variant: VariantDef = { id: "var-1", offeringId: "off-1", label: "5 days/week", quantityType: "days", quantityValue: 5, isActive: true };
const tuition: TuitionRateDef = { id: "rate-1", variantId: "var-1", cadenceKey: "monthly", payerType: "private_pay", locationId: null, rateCents: 180000, notOffered: false, effective: { start: "2026-01-01", end: null }, revenueCategoryId: "rev-1" };
const cadences: BillingCadenceDef[] = [{ cadenceKey: "monthly", label: "Monthly", isActive: true }];
const revenueCategories: RevenueCategoryDef[] = [{ id: "rev-1", label: "Tuition Revenue", glAccountId: "gl-1", isActive: true }];

function policy(over: Partial<CommercialPolicyDef> & Pick<CommercialPolicyDef, "id" | "kind">): CommercialPolicyDef {
    return {
        scopeType: "org",
        scope: { locationId: null, programKey: null, offeringId: null, variantId: null },
        effective: { start: null, end: null },
        params: {},
        isActive: true,
        ...over,
    };
}

function buildExport(policies: CommercialPolicyDef[], over: Partial<CommercialExport> = {}): CommercialExport {
    return {
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
        policies,
        ...over,
    };
}

function ctx(over: Partial<CommercialContext> = {}): CommercialContext {
    return {
        subject: { type: "child", id: "child-1" },
        scope: { programKey: "toddler", variantId: "var-1", locationId: null },
        commitment: { cadenceKey: "monthly", payerIntent: "private_pay" },
        asOf: "2026-09-01",
        mode: "actual",
        ...over,
    };
}

describe("policy stage — discounts & waivers modify net", () => {
    it("applies a 10% tuition discount (gross unchanged, net reduced)", () => {
        const exp = buildExport([policy({ id: "pol-disc", kind: "discount", params: { basis: "percentage", value: 10, applies_to: "tuition" } })]);
        const r = evaluate(ctx(), exp);
        const t = r.lines.find((l) => l.kind === "tuition")!;
        expect(t.gross.amountCents).toBe(180000);
        expect(t.net.amountCents).toBe(162000); // -10%
        expect(t.adjustments).toHaveLength(1);
        expect(t.adjustments[0]).toMatchObject({ kind: "discount", amountCents: -18000, source: { entity: "commercial_policies", id: "pol-disc" } });
        expect(r.explanation.policiesConsidered.some((p) => p.ref.id === "pol-disc" && p.applied)).toBe(true);
    });

    it("applies a fixed-amount discount only to fees (applies_to filtering)", () => {
        const exp = buildExport([policy({ id: "pol-fee", kind: "discount", params: { basis: "amount", value: 5000, applies_to: "fees" } })]);
        const r = evaluate(ctx(), exp);
        expect(r.lines.find((l) => l.kind === "tuition")!.net.amountCents).toBe(180000); // untouched
        expect(r.lines.find((l) => l.kind === "fee")!.net.amountCents).toBe(10000); // 15000 - 5000
    });

    it("waives to zero and wins over a discount", () => {
        const exp = buildExport([
            policy({ id: "pol-disc", kind: "discount", params: { basis: "percentage", value: 10, applies_to: "tuition" } }),
            policy({ id: "pol-waive", kind: "waiver", params: { applies_to: "tuition" } }),
        ]);
        const r = evaluate(ctx(), exp);
        const t = r.lines.find((l) => l.kind === "tuition")!;
        expect(t.net.amountCents).toBe(0);
        expect(t.adjustments).toHaveLength(1);
        expect(t.adjustments[0].kind).toBe("waiver");
    });

    it("never drives net below zero", () => {
        const exp = buildExport([policy({ id: "pol-big", kind: "discount", params: { basis: "amount", value: 999999, applies_to: "tuition" } })]);
        const t = evaluate(ctx(), exp).lines.find((l) => l.kind === "tuition")!;
        expect(t.net.amountCents).toBe(0);
    });
});

describe("policy stage — most-specific-wins & effective dating", () => {
    it("a variant-scoped discount beats an org-scoped one", () => {
        const exp = buildExport([
            policy({ id: "org", kind: "discount", params: { basis: "percentage", value: 10, applies_to: "tuition" } }),
            policy({ id: "var", kind: "discount", scopeType: "variant", scope: { locationId: null, programKey: null, offeringId: null, variantId: "var-1" }, params: { basis: "percentage", value: 25, applies_to: "tuition" } }),
        ]);
        const t = evaluate(ctx(), exp).lines.find((l) => l.kind === "tuition")!;
        expect(t.net.amountCents).toBe(135000); // -25%, the variant policy wins
    });

    it("does not apply a policy that is not effective at asOf", () => {
        const exp = buildExport([policy({ id: "old", kind: "discount", effective: { start: "2026-01-01", end: "2026-06-30" }, params: { basis: "percentage", value: 50, applies_to: "tuition" } })]);
        const t = evaluate(ctx(), exp).lines.find((l) => l.kind === "tuition")!;
        expect(t.net.amountCents).toBe(180000);
    });
});

describe("policy stage — relational sibling discount (evaluateSet)", () => {
    it("discounts subsequent children's tuition, first child pays full", () => {
        const exp = buildExport([policy({ id: "sib", kind: "sibling_discount", params: { basis: "percentage", value: 10, applies_to: "tuition", min_siblings: 2, applies_to_rank: "subsequent" } })]);
        const [a, b] = evaluateSet([ctx({ subject: { type: "child", id: "a" } }), ctx({ subject: { type: "child", id: "b" } })], { kind: "household", id: "hh-1" }, exp);
        expect(a.lines.find((l) => l.kind === "tuition")!.net.amountCents).toBe(180000); // first child full
        expect(b.lines.find((l) => l.kind === "tuition")!.net.amountCents).toBe(162000); // sibling -10%
        expect(b.lines.find((l) => l.kind === "tuition")!.adjustments[0].kind).toBe("sibling_discount");
    });

    it("does not apply below the sibling minimum", () => {
        const exp = buildExport([policy({ id: "sib", kind: "sibling_discount", params: { basis: "percentage", value: 10, applies_to: "tuition", min_siblings: 3, applies_to_rank: "subsequent" } })]);
        const results = evaluateSet([ctx({ subject: { type: "child", id: "a" } }), ctx({ subject: { type: "child", id: "b" } })], { kind: "household", id: "hh-1" }, exp);
        expect(results.every((r) => r.lines.find((l) => l.kind === "tuition")!.net.amountCents === 180000)).toBe(true);
    });
});

describe("policy stage — recorded-but-not-applied signals", () => {
    it("records proration/eligibility/approval as considered without mutating net", () => {
        const exp = buildExport([
            policy({ id: "pro", kind: "proration", params: { method: "daily" } }),
            policy({ id: "elig", kind: "eligibility", params: {} }),
            policy({ id: "appr", kind: "approval", params: { required: true } }),
        ]);
        const r = evaluate(ctx(), exp);
        expect(r.lines.find((l) => l.kind === "tuition")!.net.amountCents).toBe(180000); // unchanged
        const considered = r.explanation.policiesConsidered;
        expect(considered.find((c) => c.ref.id === "pro")?.applied).toBe(false);
        expect(considered.find((c) => c.ref.id === "elig")?.applied).toBe(false);
        expect(considered.find((c) => c.ref.id === "appr")?.applied).toBe(true); // review signal
    });
});
