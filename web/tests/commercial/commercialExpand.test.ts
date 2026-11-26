import { describe, expect, it } from "vitest";
import { attribute, evaluate, expand } from "@/lib/commercial/execution";
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
 * Phase 7 — expand(). Turns a CommercialResolution into dated ScheduledOccurrences.
 * Pure; no Billing records / draft charges / obligations / materialization.
 */

const program: ProgramDef = { programKey: "toddler", label: "Toddler", isActive: true };
const offering: OfferingDef = { id: "off-1", programKey: "toddler", label: "Full Day", attendanceType: "full_day", effective: { start: "2026-01-01", end: null }, isActive: true };
const variant: VariantDef = { id: "var-1", offeringId: "off-1", label: "5 days/week", quantityType: "days", quantityValue: 5, isActive: true };
const tuition: TuitionRateDef = { id: "rate-1", variantId: "var-1", cadenceKey: "monthly", payerType: "private_pay", locationId: null, rateCents: 180000, notOffered: false, effective: { start: "2026-01-01", end: null }, revenueCategoryId: "rev-1" };
const cadences: BillingCadenceDef[] = [{ cadenceKey: "monthly", label: "Monthly", isActive: true }];
const revenueCategories: RevenueCategoryDef[] = [{ id: "rev-1", label: "Tuition Revenue", glAccountId: "gl-1", isActive: true }];

function buildExport(over: Partial<CommercialExport> = {}): CommercialExport {
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
        policies: [],
        ...over,
    };
}

function ctx(over: Partial<CommercialContext> = {}): CommercialContext {
    return {
        subject: { type: "child", id: "child-1" },
        scope: { programKey: "toddler", variantId: "var-1", locationId: null },
        commitment: { cadenceKey: "monthly", payerIntent: "private_pay" },
        asOf: "2026-09-01",
        period: { start: "2026-09-01" },
        mode: "actual",
    };
}

const H = { start: "2026-09-01", end: "2026-12-31" };

describe("expand() — cadence & one-time", () => {
    it("steps a monthly line across the horizon", () => {
        const r = evaluate(ctx(), buildExport());
        const sched = expand(r, H);
        const tuitionOccs = sched.occurrences.filter((o) => o.kind === "tuition");
        expect(tuitionOccs.map((o) => o.dueOn)).toEqual(["2026-09-01", "2026-10-01", "2026-11-01", "2026-12-01"]);
        expect(tuitionOccs.map((o) => o.sequence)).toEqual([0, 1, 2, 3]);
        expect(tuitionOccs[0].amount.amountCents).toBe(180000); // per-period net
        expect(tuitionOccs[0].period).toEqual({ start: "2026-09-01", end: "2026-09-30" });
    });

    it("emits a single occurrence for a one-time line", () => {
        const sched = expand(evaluate(ctx(), buildExport()), H);
        const feeOccs = sched.occurrences.filter((o) => o.kind === "fee");
        expect(feeOccs).toHaveLength(1);
        expect(feeOccs[0].period).toEqual({ start: "2026-09-01", end: "2026-09-01" });
    });

    it("carries recognition treatment onto occurrences", () => {
        const sched = expand(evaluate(ctx(), buildExport()), H);
        expect(sched.occurrences.find((o) => o.kind === "tuition")!.recognition).toBe("deferred");
        expect(sched.occurrences.find((o) => o.kind === "fee")!.recognition).toBe("immediate");
    });

    it("uses deterministic occurrence keys", () => {
        const a = expand(evaluate(ctx(), buildExport()), H);
        const b = expand(evaluate(ctx(), buildExport()), H);
        expect(a.occurrences.map((o) => o.occurrenceKey)).toEqual(b.occurrences.map((o) => o.occurrenceKey));
        expect(a.occurrences[0].occurrenceKey).toContain(a.occurrences[0].dueOn);
    });
});

describe("expand() — preserves resolution metadata", () => {
    it("preserves provenance, accounting, and funding attribution", () => {
        const family: PayerRef = { partyType: "household", partyId: "hh-1", source: "private_pay" };
        const agency: PayerRef = { partyType: "agency", partyId: "ag-1", source: "government_subsidy" };
        const plan: FundingPlan = { primary: family, allocations: [{ payer: agency, basis: "percentage", value: 70, target: "tuition" }] };
        const r = attribute(evaluate(ctx(), buildExport()), plan);
        const sched = expand(r, H);
        const occ = sched.occurrences.find((o) => o.kind === "tuition")!;
        expect(occ.source).toEqual({ entity: "commercial_tuition_rates", id: "rate-1", scope: ctx().scope });
        expect(occ.accounting).toEqual({ revenueCategoryId: "rev-1", glAccountId: "gl-1", recognition: "deferred" });
        // funding carried per-period: 70% agency, residual family, sums to the occurrence amount
        expect(occ.funding!.allocations[0].amountCents).toBe(126000);
        expect(occ.funding!.residual.amountCents).toBe(54000);
        expect(occ.funding!.allocations[0].amountCents + occ.funding!.residual.amountCents).toBe(occ.amount.amountCents);
    });
});

describe("expand() — horizon & status", () => {
    it("clips occurrences to the horizon window", () => {
        const sched = expand(evaluate(ctx(), buildExport()), { start: "2026-10-15", end: "2026-11-30" });
        expect(sched.occurrences.filter((o) => o.kind === "tuition").map((o) => o.dueOn)).toEqual(["2026-11-01"]);
    });

    it("does not expand unresolved / not_offered lines", () => {
        const r = evaluate(ctx(), buildExport({ tuitionRates: [{ ...tuition, notOffered: true }] }));
        const sched = expand(r, H);
        expect(sched.occurrences.some((o) => o.kind === "tuition")).toBe(false); // not_offered → no occurrences
        expect(sched.occurrences.some((o) => o.kind === "fee")).toBe(true); // fee still expands
    });

    it("echoes the resolution key and horizon", () => {
        const r = evaluate(ctx(), buildExport());
        const sched = expand(r, H);
        expect(sched.resolutionKey).toBe(r.resolutionKey);
        expect(sched.horizon).toEqual(H);
    });
});
