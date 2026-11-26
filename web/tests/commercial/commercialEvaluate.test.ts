import { describe, expect, it } from "vitest";
import { evaluate, evaluateSet } from "@/lib/commercial/execution";
import type {
    BillingCadenceDef,
    CommercialExport,
    CommercialProductDef,
    OfferingDef,
    ProgramDef,
    RevenueCategoryDef,
    TuitionRateDef,
    VariantDef,
} from "@/lib/commercial/execution/commercialExport";
import type { CommercialContext } from "@/lib/commercial/execution/executionTypes";

/**
 * Phase 4 — Commercial Evaluation. Pure tests over hand-built CommercialExports.
 * No DB, no policy, no funding, no expand, no Billing.
 */

const program: ProgramDef = { programKey: "toddler", label: "Toddler", isActive: true };
const offering: OfferingDef = {
    id: "off-1",
    programKey: "toddler",
    label: "Full Day",
    attendanceType: "full_day",
    effective: { start: "2026-01-01", end: null },
    isActive: true,
};
const variant: VariantDef = { id: "var-1", offeringId: "off-1", label: "5 days/week", quantityType: "days", quantityValue: 5, isActive: true };

function rate(over: Partial<TuitionRateDef> = {}): TuitionRateDef {
    return {
        id: "rate-1",
        variantId: "var-1",
        cadenceKey: "monthly",
        payerType: "private_pay",
        locationId: null,
        rateCents: 180000,
        notOffered: false,
        effective: { start: "2026-01-01", end: null },
        revenueCategoryId: "rev-1",
        ...over,
    };
}

function product(over: Partial<CommercialProductDef> & Pick<CommercialProductDef, "id" | "commercialType" | "name" | "amountCents">): CommercialProductDef {
    return {
        scope: { programKey: "toddler", locationId: null },
        cadenceKey: null,
        revenueCategoryId: "rev-1",
        behavior: {},
        effective: { start: null, end: null },
        isActive: true,
        ...over,
    };
}

const cadences: BillingCadenceDef[] = [{ cadenceKey: "monthly", label: "Monthly", isActive: true }];
const revenueCategories: RevenueCategoryDef[] = [{ id: "rev-1", label: "Tuition Revenue", glAccountId: "gl-1", isActive: true }];

function buildExport(over: Partial<CommercialExport> = {}): CommercialExport {
    return {
        orgId: "org-1",
        version: { version: "v1", effectiveOn: "2026-09-01" },
        programs: [program],
        offerings: [offering],
        variants: [variant],
        tuitionRates: [rate()],
        products: [product({ id: "prod-reg", commercialType: "fee", name: "Registration", amountCents: 15000, behavior: { required: true } })],
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
        mode: "actual",
        ...over,
    };
}

describe("evaluate() — happy path", () => {
    it("resolves tuition + product with mapped accounting", () => {
        const r = evaluate(ctx(), buildExport());
        expect(r.status).toBe("resolved");
        const tuition = r.lines.find((l) => l.kind === "tuition");
        expect(tuition?.status).toBe("resolved");
        expect(tuition?.net.amountCents).toBe(180000);
        expect(tuition?.net).toEqual(tuition?.gross); // no policy → net === gross
        expect(tuition?.adjustments).toEqual([]);
        expect(tuition?.funding).toBeNull(); // single-payer/null attribution
        expect(tuition?.accounting).toEqual({ revenueCategoryId: "rev-1", glAccountId: "gl-1", recognition: "deferred" });
        expect(tuition?.explanation.origin).toEqual({ entity: "commercial_tuition_rates", id: "rate-1" });
        const fee = r.lines.find((l) => l.kind === "fee");
        expect(fee?.net.amountCents).toBe(15000);
        expect(fee?.accounting.recognition).toBe("immediate");
        expect(r.warnings).toHaveLength(0);
        expect(r.configVersion.version).toBe("v1");
        expect(r.precision).toEqual({ currency: "USD", roundingRule: "half_up" });
    });

    it("is deterministic (same key for identical inputs)", () => {
        const a = evaluate(ctx(), buildExport());
        const b = evaluate(ctx(), buildExport());
        expect(a.resolutionKey).toBe(b.resolutionKey);
    });
});

describe("evaluate() — accounting warnings (non-blocking)", () => {
    it("prices a line but warns when revenue category is missing", () => {
        const exp = buildExport({
            products: [product({ id: "prod-dep", commercialType: "deposit", name: "Deposit", amountCents: 90000, revenueCategoryId: null, behavior: { refundable: true } })],
        });
        const r = evaluate(ctx(), exp);
        expect(r.status).toBe("resolved"); // still resolved — warning, not error
        const dep = r.lines.find((l) => l.kind === "deposit");
        expect(dep?.status).toBe("resolved");
        expect(dep?.net.amountCents).toBe(90000);
        expect(dep?.accounting).toEqual({ revenueCategoryId: null, glAccountId: null, recognition: "liability" });
        expect(r.warnings.some((w) => w.code === "accounting_unmapped_revenue_category" && w.lineKey === "product:prod-dep")).toBe(true);
    });

    it("warns when revenue category exists but is not mapped to a GL account", () => {
        const exp = buildExport({ revenueCategories: [{ id: "rev-1", label: "Tuition Revenue", glAccountId: null, isActive: true }] });
        const r = evaluate(ctx(), exp);
        const tuition = r.lines.find((l) => l.kind === "tuition");
        expect(tuition?.accounting.glAccountId).toBeNull();
        expect(r.warnings.some((w) => w.code === "accounting_unmapped_gl_account")).toBe(true);
    });
});

describe("evaluate() — status & reason codes", () => {
    it("marks tuition not_offered and rolls the resolution up to partial", () => {
        const r = evaluate(ctx(), buildExport({ tuitionRates: [rate({ notOffered: true })] }));
        const tuition = r.lines.find((l) => l.kind === "tuition");
        expect(tuition?.status).toBe("not_offered");
        expect(tuition?.reason).toBe("not_offered_at_scope");
        expect(r.status).toBe("partial"); // fee still resolved
    });

    it("leaves tuition unresolved when cadence is missing", () => {
        const r = evaluate(ctx({ commitment: { payerIntent: "private_pay" } }), buildExport());
        const tuition = r.lines.find((l) => l.kind === "tuition");
        expect(tuition?.status).toBe("unresolved");
        expect(tuition?.reason).toBe("missing_required_input");
        expect(r.warnings.some((w) => w.code === "tuition_unpriced")).toBe(true);
    });

    it("resolves products only when there is no tuition context", () => {
        const r = evaluate(ctx({ scope: { programKey: "toddler", locationId: null } }), buildExport());
        expect(r.lines.find((l) => l.kind === "tuition")).toBeUndefined();
        expect(r.lines.find((l) => l.kind === "fee")).toBeTruthy();
        expect(r.warnings.some((w) => w.code === "no_tuition_context")).toBe(true);
        expect(r.status).toBe("resolved");
    });

    it("returns unresolved with a note when the program is not found", () => {
        const r = evaluate(ctx({ scope: { programKey: "nope", variantId: "var-1", locationId: null } }), buildExport());
        expect(r.status).toBe("unresolved");
        expect(r.lines).toHaveLength(0);
        expect(r.explanation.notes?.[0]).toContain("nope");
    });

    it("leaves tuition unresolved when the rate is not effective at asOf", () => {
        const r = evaluate(ctx(), buildExport({ tuitionRates: [rate({ effective: { start: "2026-01-01", end: "2026-08-01" } })] }));
        const tuition = r.lines.find((l) => l.kind === "tuition");
        expect(tuition?.status).toBe("unresolved");
        expect(tuition?.reason).toBe("no_effective_config");
    });
});

describe("evaluate() — matrix scope & recognition", () => {
    it("prefers a location override over the org default", () => {
        const exp = buildExport({ tuitionRates: [rate(), rate({ id: "rate-loc", locationId: "loc-1", rateCents: 200000 })] });
        const atLoc = evaluate(ctx({ scope: { programKey: "toddler", variantId: "var-1", locationId: "loc-1" } }), exp);
        expect(atLoc.lines.find((l) => l.kind === "tuition")?.net.amountCents).toBe(200000);
        const atOrg = evaluate(ctx(), exp);
        expect(atOrg.lines.find((l) => l.kind === "tuition")?.net.amountCents).toBe(180000);
    });

    it("derives recognition from kind + behavior", () => {
        const exp = buildExport({
            products: [
                product({ id: "p-fee", commercialType: "fee", name: "Fee", amountCents: 100 }),
                product({ id: "p-add", commercialType: "addon", name: "Lunch", amountCents: 300, cadenceKey: "monthly" }),
                product({ id: "p-pack", commercialType: "addon", name: "5-pass", amountCents: 500, behavior: { package: { unit_count: 5, unit_type: "sessions", expires_days: null } } }),
                product({ id: "p-dep", commercialType: "deposit", name: "Deposit", amountCents: 900, behavior: { refundable: true } }),
            ],
        });
        const r = evaluate(ctx(), exp);
        const rec = (key: string) => r.lines.find((l) => l.lineKey === key)?.accounting.recognition;
        expect(rec("product:p-fee")).toBe("immediate");
        expect(rec("product:p-add")).toBe("immediate");
        expect(rec("product:p-pack")).toBe("deferred"); // package add-on
        expect(rec("product:p-dep")).toBe("liability");
    });
});

describe("evaluateSet() — scaffold", () => {
    it("evaluates each context independently (no relational policy yet)", () => {
        const results = evaluateSet([ctx({ subject: { type: "child", id: "a" } }), ctx({ subject: { type: "child", id: "b" } })], { kind: "household", id: "hh-1" }, buildExport());
        expect(results).toHaveLength(2);
        expect(results.every((r) => r.status === "resolved")).toBe(true);
    });
});
