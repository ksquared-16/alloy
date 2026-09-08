/**
 * WHICH AUTHORED OPTIONS APPLY TO AN ASSIGNMENT — and the two answers a resolver is not allowed to
 * dodge.
 *
 * Every tuition resolver this replaces ended in `sorted[0]`, `matches[0]` or `mostSpecific(...)[0]`.
 * Each of those is an arbitrary choice wearing the costume of a recommendation: when the
 * configuration has not said which of two equal options applies, taking the first one in the array
 * does not resolve the ambiguity, it hides it. So the cases that matter most here are the ones with
 * no recommendation to make — a tie, and nothing offered at all.
 */
import { describe, expect, it } from "vitest";

import type {
    CommercialExport,
    OfferingDef,
    TuitionRateDef,
    VariantDef,
} from "@/lib/commercial/execution/commercialExport";
import {
    assignmentResolutionKey,
    resolveAssignmentPricingOptions,
    type AssignmentPricingFacts,
} from "@/lib/commercial/execution/evaluate/resolveOptions";

const TODAY = "2026-09-06";

function offering(over: Partial<OfferingDef> = {}): OfferingDef {
    return {
        id: "off-toddler-full",
        programKey: "toddler",
        label: "Toddler",
        attendanceType: "full_day",
        effective: { start: null, end: null },
        isActive: true,
        ...over,
    };
}

function variant(over: Partial<VariantDef> = {}): VariantDef {
    return {
        id: "var-5day",
        offeringId: "off-toddler-full",
        label: "5 days/week",
        quantityType: "days",
        quantityValue: 5,
        isActive: true,
        ...over,
    };
}

function rate(over: Partial<TuitionRateDef> = {}): TuitionRateDef {
    return {
        id: "rate-monthly-org",
        variantId: "var-5day",
        cadenceKey: "monthly",
        payerType: "private_pay",
        locationId: null,
        rateCents: 120_000,
        notOffered: false,
        effective: { start: null, end: null },
        revenueCategoryId: null,
        ...over,
    };
}

function config(parts: {
    offerings?: OfferingDef[];
    variants?: VariantDef[];
    tuitionRates?: TuitionRateDef[];
}): CommercialExport {
    return {
        orgId: "org-1",
        version: { version: "cfg-1", effectiveOn: TODAY },
        programs: [{ programKey: "toddler", label: "Toddler", isActive: true }],
        offerings: parts.offerings ?? [offering()],
        variants: parts.variants ?? [variant()],
        tuitionRates: parts.tuitionRates ?? [rate()],
        products: [],
        cadences: [],
        revenueCategories: [],
        policies: [],
    } as unknown as CommercialExport;
}

function facts(over: Partial<AssignmentPricingFacts> = {}): AssignmentPricingFacts {
    return {
        programKey: "toddler",
        attendanceType: "full_day",
        daysPerWeek: 5,
        locationId: "loc-lakeside",
        payerType: "private_pay",
        cadenceKey: "monthly",
        asOf: TODAY,
        ...over,
    };
}

describe("resolveAssignmentPricingOptions — the option that applies to an assignment", () => {
    it("recommends exactly one option, and says why it matched", () => {
        const r = resolveAssignmentPricingOptions(config({}), facts());
        expect(r.kind).toBe("recommended");
        if (r.kind !== "recommended") return;
        expect(r.recommended.source).toEqual({ entity: "commercial_tuition_rates", id: "rate-monthly-org" });
        expect(r.recommended.amount).toEqual({ amountCents: 120_000, currency: "USD" });
        expect(r.recommended.cadenceKey).toBe("monthly");
        // The explanation names the canonical facts, not internal keys.
        expect(r.recommended.matched.join(" ")).toContain("5 days a week");
        expect(r.recommended.matched.join(" ")).toContain("Toddler");
    });

    /*
     * ALTERNATE FACTS, THROUGH THEIR OWNERS. The schedule owns days a week; changing it must change
     * the answer, because that is the whole claim being made about this resolver.
     */
    it("prices a different schedule differently", () => {
        const cfg = config({
            variants: [variant(), variant({ id: "var-3day", label: "3 days/week", quantityValue: 3 })],
            tuitionRates: [rate(), rate({ id: "rate-3day", variantId: "var-3day", rateCents: 78_000 })],
        });
        const five = resolveAssignmentPricingOptions(cfg, facts({ daysPerWeek: 5 }));
        const three = resolveAssignmentPricingOptions(cfg, facts({ daysPerWeek: 3 }));
        expect(five.kind === "recommended" && five.recommended.amount.amountCents).toBe(120_000);
        expect(three.kind === "recommended" && three.recommended.amount.amountCents).toBe(78_000);
    });

    it("prices a different program differently, and refuses one it does not offer", () => {
        const cfg = config({
            offerings: [offering(), offering({ id: "off-preschool", programKey: "preschool" })],
            variants: [variant(), variant({ id: "var-pre", offeringId: "off-preschool" })],
            tuitionRates: [rate(), rate({ id: "rate-pre", variantId: "var-pre", rateCents: 99_000 })],
        });
        const pre = resolveAssignmentPricingOptions(cfg, facts({ programKey: "preschool" }));
        expect(pre.kind === "recommended" && pre.recommended.amount.amountCents).toBe(99_000);

        const infant = resolveAssignmentPricingOptions(cfg, facts({ programKey: "infant" }));
        expect(infant.kind).toBe("no_match");
        expect(infant.kind === "no_match" && infant.reason).toBe("not_offered_at_scope");
    });

    it("lets a site rate supersede the organisation default", () => {
        const r = resolveAssignmentPricingOptions(
            config({
                tuitionRates: [rate(), rate({ id: "rate-site", locationId: "loc-lakeside", rateCents: 131_000 })],
            }),
            facts(),
        );
        expect(r.kind).toBe("recommended");
        if (r.kind !== "recommended") return;
        expect(r.recommended.source.id).toBe("rate-site");
        expect(r.recommended.scope).toBe("location");
        expect(r.rejected.some((x) => x.detail === "superseded by a site rate")).toBe(true);
    });

    it("lets a later effective start supersede an earlier one within a cadence", () => {
        const r = resolveAssignmentPricingOptions(
            config({
                tuitionRates: [
                    rate({ id: "rate-2025", effective: { start: "2025-01-01", end: null }, rateCents: 110_000 }),
                    rate({ id: "rate-2026", effective: { start: "2026-01-01", end: null }, rateCents: 120_000 }),
                ],
            }),
            facts(),
        );
        expect(r.kind === "recommended" && r.recommended.source.id).toBe("rate-2026");
    });

    // ── THE TWO ANSWERS A RESOLVER MUST NOT DODGE ────────────────────────────────────────────

    it("reports AMBIGUITY rather than choosing between two equal candidates", () => {
        const r = resolveAssignmentPricingOptions(
            config({
                variants: [variant(), variant({ id: "var-5day-alt", label: "Five days" })],
                tuitionRates: [rate(), rate({ id: "rate-alt", variantId: "var-5day-alt", rateCents: 125_000 })],
            }),
            facts(),
        );
        expect(r.kind).toBe("ambiguous");
        if (r.kind !== "ambiguous") return;
        expect(r.tied).toHaveLength(2);
        expect(r.tied.map((t) => t.source.id).sort()).toEqual(["rate-alt", "rate-monthly-org"]);
        expect(r).not.toHaveProperty("recommended");
    });

    /*
     * A BILLING FREQUENCY NOBODY CHOSE IS NOT A WILDCARD. Two cadences with no chosen one is the
     * operator's decision to make; answering it here would pick a price by array order.
     */
    it("treats an unchosen billing frequency with two offers as ambiguous", () => {
        const r = resolveAssignmentPricingOptions(
            config({
                tuitionRates: [rate(), rate({ id: "rate-weekly", cadenceKey: "weekly", rateCents: 30_000 })],
            }),
            facts({ cadenceKey: null }),
        );
        expect(r.kind).toBe("ambiguous");
        if (r.kind !== "ambiguous") return;
        expect(r.tied.map((t) => t.cadenceKey).sort()).toEqual(["monthly", "weekly"]);
    });

    it("resolves once the operator names the billing frequency", () => {
        const r = resolveAssignmentPricingOptions(
            config({
                tuitionRates: [rate(), rate({ id: "rate-weekly", cadenceKey: "weekly", rateCents: 30_000 })],
            }),
            facts({ cadenceKey: "weekly" }),
        );
        expect(r.kind === "recommended" && r.recommended.source.id).toBe("rate-weekly");
    });

    it("reports NO MATCH when nothing is priced for the assignment", () => {
        const r = resolveAssignmentPricingOptions(config({ tuitionRates: [] }), facts());
        expect(r.kind).toBe("no_match");
        expect(r.kind === "no_match" && r.reason).toBe("no_rate_for_scope");
    });

    it("says the facts are missing rather than blaming the catalog", () => {
        const r = resolveAssignmentPricingOptions(config({}), facts({ programKey: null }));
        expect(r.kind === "no_match" && r.reason).toBe("missing_required_input");
    });

    it("refuses a schedule no variant is authored for", () => {
        const r = resolveAssignmentPricingOptions(config({}), facts({ daysPerWeek: 2 }));
        expect(r.kind === "no_match" && r.reason).toBe("unsupported_schedule_basis");
    });

    // ── EXCLUSIONS, EACH TOLD APART FROM THE OTHERS ──────────────────────────────────────────

    it("excludes an inactive variant's rate", () => {
        const r = resolveAssignmentPricingOptions(
            config({ variants: [variant({ isActive: false })] }),
            facts(),
        );
        expect(r.kind === "no_match" && r.reason).toBe("unsupported_schedule_basis");
    });

    it("excludes a future rate, and says when it starts", () => {
        const r = resolveAssignmentPricingOptions(
            config({ tuitionRates: [rate({ effective: { start: "2027-01-01", end: null } })] }),
            facts(),
        );
        expect(r.kind).toBe("no_match");
        expect(r.rejected[0]).toMatchObject({
            reason: "no_effective_config",
            detail: "not effective until 2027-01-01",
        });
    });

    it("excludes an expired rate, and says it expired", () => {
        const r = resolveAssignmentPricingOptions(
            config({ tuitionRates: [rate({ effective: { start: "2024-01-01", end: "2025-12-31" } })] }),
            facts(),
        );
        expect(r.kind).toBe("no_match");
        expect(r.rejected[0]).toMatchObject({
            reason: "no_effective_config",
            detail: "expired after 2025-12-31",
        });
    });

    it("excludes an explicitly not-offered rate, distinctly from an absent one", () => {
        const r = resolveAssignmentPricingOptions(
            config({ tuitionRates: [rate({ notOffered: true })] }),
            facts(),
        );
        expect(r.kind).toBe("no_match");
        expect(r.rejected[0]?.reason).toBe("not_offered_at_scope");
    });

    it("excludes a rate priced for another payer", () => {
        const r = resolveAssignmentPricingOptions(
            config({ tuitionRates: [rate({ payerType: "subsidy" })] }),
            facts(),
        );
        expect(r.rejected[0]?.reason).toBe("no_rate_for_scope");
    });

    // ── REPRODUCIBILITY, AND THE STALENESS IT BUYS ───────────────────────────────────────────

    it("is reproducible: the same facts and config give the same key and answer", () => {
        const a = resolveAssignmentPricingOptions(config({}), facts());
        const b = resolveAssignmentPricingOptions(config({}), facts());
        expect(a.resolutionKey).toBe(b.resolutionKey);
        expect(a).toEqual(b);
    });

    /*
     * STALENESS IS NOT A FLAG. A decision recorded against one set of facts is stale exactly when
     * today's facts key differently — no background job, nothing to keep in sync.
     */
    it("keys differently when a relevant assignment fact changes", () => {
        const before = assignmentResolutionKey(facts(), "cfg-1");
        expect(assignmentResolutionKey(facts({ daysPerWeek: 3 }), "cfg-1")).not.toBe(before);
        expect(assignmentResolutionKey(facts({ programKey: "preschool" }), "cfg-1")).not.toBe(before);
        expect(assignmentResolutionKey(facts({ asOf: "2026-10-01" }), "cfg-1")).not.toBe(before);
        // And when the catalog is republished under the same facts.
        expect(assignmentResolutionKey(facts(), "cfg-2")).not.toBe(before);
    });
});
