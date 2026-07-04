import { describe, expect, it } from "vitest";
import { getCommercialTuitionValuation, resolveCommercialScope } from "@/lib/commercial/execution/billing";
import type { CommercialExport, CommercialPolicyDef, OfferingDef, TuitionRateDef, VariantDef } from "@/lib/commercial/execution/commercialExport";

/**
 * Phase 9 — Billing consumes Commercial Execution. Pure tests for the scope
 * resolver + tuition valuation seam. Deterministic; unresolved on ambiguity;
 * no fallback.
 */

function offering(over: Partial<OfferingDef> & Pick<OfferingDef, "id" | "attendanceType">): OfferingDef {
    return { programKey: "toddler", label: over.attendanceType, effective: { start: null, end: null }, isActive: true, ...over };
}
function variant(id: string, offeringId: string, days: number | null): VariantDef {
    return { id, offeringId, label: days ? `${days} days/week` : "Default", quantityType: days ? "days" : null, quantityValue: days, isActive: true };
}
function rate(variantId: string, cents: number): TuitionRateDef {
    return { id: `rate-${variantId}`, variantId, cadenceKey: "monthly", payerType: "private_pay", locationId: null, rateCents: cents, notOffered: false, effective: { start: null, end: null }, revenueCategoryId: "rev-1" };
}

function buildExport(over: Partial<CommercialExport>): CommercialExport {
    return {
        orgId: "org-1",
        version: { version: "v1", effectiveOn: "2026-09-01" },
        programs: [{ programKey: "toddler", label: "Toddler", isActive: true }],
        offerings: [],
        variants: [],
        tuitionRates: [],
        products: [],
        cadences: [{ cadenceKey: "monthly", label: "Monthly", isActive: true }],
        revenueCategories: [{ id: "rev-1", label: "Tuition", glAccountId: "gl-1", isActive: true }],
        policies: [],
        ...over,
    };
}

describe("resolveCommercialScope — deterministic matching", () => {
    it("maps a quantity basis to the variant when the program has one day-offering", () => {
        const exp = buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v3", "off-1", 3), variant("v5", "off-1", 5)] });
        const r = resolveCommercialScope(exp, { programKey: "toddler", scheduleBasis: "five_day" });
        expect(r).toMatchObject({ resolved: true, offeringId: "off-1", variantId: "v5", cadenceKey: "monthly", payerType: "private_pay" });
    });

    it("maps an attendance basis (full_day) to the single-variant offering", () => {
        const exp = buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v-def", "off-1", null)] });
        expect(resolveCommercialScope(exp, { programKey: "toddler", scheduleBasis: "full_day" })).toMatchObject({ resolved: true, variantId: "v-def" });
    });

    it("unresolves (ambiguous_variant) when a quantity basis matches variants under multiple offerings", () => {
        const exp = buildExport({ offerings: [offering({ id: "o1", attendanceType: "full_day" }), offering({ id: "o2", attendanceType: "part_day" })], variants: [variant("v5", "o1", 5), variant("v5b", "o2", 5)] });
        expect(resolveCommercialScope(exp, { programKey: "toddler", scheduleBasis: "five_day" })).toEqual({ resolved: false, reason: "ambiguous_variant" });
    });

    it("resolves a quantity basis to the right offering when only one offering has that variant", () => {
        const exp = buildExport({ offerings: [offering({ id: "o-fd", attendanceType: "full_day" }), offering({ id: "o-di", attendanceType: "drop_in" })], variants: [variant("v3", "o-fd", 3), variant("v-di", "o-di", null)] });
        expect(resolveCommercialScope(exp, { programKey: "toddler", scheduleBasis: "three_day" })).toMatchObject({ resolved: true, offeringId: "o-fd", variantId: "v3" });
    });

    it("unresolves (ambiguous_variant) when an attendance basis has multiple variants", () => {
        const exp = buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v3", "off-1", 3), variant("v5", "off-1", 5)] });
        expect(resolveCommercialScope(exp, { programKey: "toddler", scheduleBasis: "full_day" })).toEqual({ resolved: false, reason: "ambiguous_variant" });
    });

    it("unresolves (no_variant_match) when the quantity has no variant", () => {
        const exp = buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v5", "off-1", 5)] });
        expect(resolveCommercialScope(exp, { programKey: "toddler", scheduleBasis: "three_day" })).toEqual({ resolved: false, reason: "no_variant_match" });
    });

    it("unresolves (no_offering_for_program) when the program has no offerings", () => {
        expect(resolveCommercialScope(buildExport({}), { programKey: "toddler", scheduleBasis: "five_day" })).toEqual({ resolved: false, reason: "no_offering_for_program" });
    });
});

describe("getCommercialTuitionValuation — the pricing seam", () => {
    const base = () => buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v5", "off-1", 5)], tuitionRates: [rate("v5", 180000)] });

    it("returns the policy-adjusted net for a resolvable enrollment", () => {
        const v = getCommercialTuitionValuation(base(), { programKey: "toddler", scheduleBasis: "five_day", locationId: null, asOf: "2026-09-01" });
        expect(v).toMatchObject({ resolved: true, amountCents: 180000, currencyCode: "USD", variantId: "v5", policyAdjusted: false, revenueCategoryId: "rev-1" });
    });

    it("applies a Commercial discount policy (policy-adjusted valuation)", () => {
        const policy: CommercialPolicyDef = { id: "disc", kind: "discount", scopeType: "org", scope: { locationId: null, programKey: null, offeringId: null, variantId: null }, effective: { start: null, end: null }, params: { basis: "percentage", value: 10, applies_to: "tuition" }, isActive: true };
        const exp = { ...base(), policies: [policy] };
        const v = getCommercialTuitionValuation(exp, { programKey: "toddler", scheduleBasis: "five_day", locationId: null, asOf: "2026-09-01" });
        expect(v).toMatchObject({ resolved: true, amountCents: 162000, policyAdjusted: true });
    });

    it("surfaces unresolved (no fallback) when scope can't resolve", () => {
        const exp = buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v5", "off-1", 5)] });
        expect(getCommercialTuitionValuation(exp, { programKey: "toddler", scheduleBasis: "three_day", locationId: null, asOf: "2026-09-01" })).toEqual({ resolved: false, reason: "no_variant_match" });
    });

    it("surfaces tuition_not_offered when the rate is explicitly not offered", () => {
        const exp = buildExport({ offerings: [offering({ id: "off-1", attendanceType: "full_day" })], variants: [variant("v5", "off-1", 5)], tuitionRates: [{ ...rate("v5", 180000), notOffered: true }] });
        expect(getCommercialTuitionValuation(exp, { programKey: "toddler", scheduleBasis: "five_day", locationId: null, asOf: "2026-09-01" })).toEqual({ resolved: false, reason: "tuition_not_offered" });
    });
});
