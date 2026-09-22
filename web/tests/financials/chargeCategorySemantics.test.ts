/**
 * WHAT A CATEGORY PERMITS — subject grain, and whether it may be discounted.
 *
 * Two gaps closed in one place, because both are the same question asked of the same code-owned
 * taxonomy:
 *
 *   GRAIN      nothing declared which subject grain a charge type permits, so nothing could stop a
 *              household-grained tuition charge or a child-grained account fee.
 *
 *   DISCOUNT   eligibility was half an intersection. The policy could name categories; the category
 *              could not refuse. A policy authored as `applies_to: "fees"` therefore reached every
 *              non-tuition category, including `discount` and `credit`, where a reduction of a
 *              reduction is not something any reconciliation can explain.
 */
import { describe, expect, it } from "vitest";

import {
    CHARGE_CATEGORY_SEMANTICS,
    categoryPermitsChildGrain,
    categoryPermitsHouseholdGrain,
    chargeCategorySemantics,
    declaredCategoriesWithoutSemantics,
    narrowSubjectGrain,
    subjectGrainIsLegal,
} from "@/lib/financials/chargeCategorySemantics";
import { CHARGE_CATEGORIES } from "@/lib/financials/billableSource";

describe("the semantics cover the taxonomy", () => {
    /* A category added to the invariant without semantics would silently get a permissive default. */
    it("declares semantics for every declared charge category", () => {
        expect(declaredCategoriesWithoutSemantics()).toEqual([]);
        expect(Object.keys(CHARGE_CATEGORY_SEMANTICS).sort()).toEqual([...CHARGE_CATEGORIES].sort());
    });

    /*
     * A tenant's own key — `late_pickup_fee`, `registration_fee` — is real and outside the declared
     * vocabulary. The permissive reading is the correct one: refusing would silently exempt charges
     * the organisation never exempted.
     */
    it("reads an undeclared tenant category permissively rather than exempting it", () => {
        const s = chargeCategorySemantics("registration_fee");
        expect(s.discountable).toBe(true);
        expect(s.allowedSubjectGrain).toBe("CHILD_OR_HOUSEHOLD");
    });
});

describe("subject grain", () => {
    it("keeps tuition child-grained", () => {
        expect(categoryPermitsChildGrain("tuition")).toBe(true);
        expect(categoryPermitsHouseholdGrain("tuition")).toBe(false);
    });

    it("lets a one-off charge be either", () => {
        expect(categoryPermitsChildGrain("one_time")).toBe(true);
        expect(categoryPermitsHouseholdGrain("one_time")).toBe(true);
    });

    /* `subjectMemberId: null` is HOUSEHOLD GRAIN, not missing data — the doctrine the model rests on. */
    it("reads a null subject as household grain when judging legality", () => {
        expect(subjectGrainIsLegal("one_time", null)).toBe(true);
        expect(subjectGrainIsLegal("tuition", null), "tuition is not the household's").toBe(false);
        expect(subjectGrainIsLegal("tuition", "member-1")).toBe(true);
    });
});

describe("THE GATE — a template narrows, it never contradicts", () => {
    it("lets a template be specific where the category permits both", () => {
        expect(narrowSubjectGrain("one_time", "CHILD")).toEqual({ ok: true, grain: "CHILD" });
        expect(narrowSubjectGrain("one_time", "HOUSEHOLD")).toEqual({ ok: true, grain: "HOUSEHOLD" });
    });

    it("defaults to the category's own permission when a template declares nothing", () => {
        expect(narrowSubjectGrain("tuition", null)).toEqual({ ok: true, grain: "CHILD" });
        expect(narrowSubjectGrain("one_time", undefined)).toEqual({ ok: true, grain: "CHILD_OR_HOUSEHOLD" });
    });

    /*
     * THE ASSERTION THE WHOLE TWO-LAYER DESIGN TURNS ON. A template may not redefine what its charge
     * type MEANS. Refused rather than resolved either way, because either answer would be a guess
     * about whose money a charge is, and the disagreement is a configuration error somebody must see.
     */
    it("refuses a template that contradicts its category, rather than picking a winner", () => {
        expect(narrowSubjectGrain("tuition", "HOUSEHOLD")).toEqual({
            ok: false,
            reason: "contradicts_category",
            allowed: "CHILD",
            requested: "HOUSEHOLD",
        });
    });

    /* There is deliberately no stored "multiple children" grain to narrow to. */
    it("offers no multi-child grain, because that is an operation and not a grain", () => {
        const grains = new Set(Object.values(CHARGE_CATEGORY_SEMANTICS).map((s) => s.allowedSubjectGrain));
        expect([...grains].every((g) => g === "CHILD" || g === "HOUSEHOLD" || g === "CHILD_OR_HOUSEHOLD")).toBe(true);
        expect([...grains]).not.toContain("CHILD_OR_MULTIPLE_CHILDREN");
    });
});

describe("THE GATE — the category's half of the discount intersection", () => {
    /*
     * INCOHERENCE IS REFUSED. A reduction of a reduction has no reading a reconciliation can
     * explain, and a subsidy offset is a third party's money rather than a price this organisation
     * sets.
     */
    it("refuses to discount a reduction, a credit, an adjustment or a subsidy offset", () => {
        for (const c of ["discount", "credit", "adjustment", "subsidy_offset"]) {
            expect(chargeCategorySemantics(c).discountable, `${c} is not discountable`).toBe(false);
            expect(chargeCategorySemantics(c).note.length, `${c} explains itself`).toBeGreaterThan(0);
        }
    });

    /*
     * BUSINESS OPINION IS NOT ENCODED. "Late pickup is never discountable" is a belief many
     * organisations hold and some do not. Hard-coding it would take the decision away from every
     * tenant that disagrees — so the category permits it and the tenant's policy decides.
     */
    it("leaves late pickup discountable, so the organisation's policy decides", () => {
        expect(chargeCategorySemantics("late_pickup").discountable).toBe(true);
    });

    it("keeps the ordinary priced categories discountable", () => {
        for (const c of ["tuition", "one_time", "fee", "consumable_fee", "deposit"]) {
            expect(chargeCategorySemantics(c).discountable, `${c} may be discounted`).toBe(true);
        }
    });
});
