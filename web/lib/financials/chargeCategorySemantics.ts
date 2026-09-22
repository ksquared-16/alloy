/**
 * WHAT A CHARGE CATEGORY PERMITS — subject grain, and whether it may be discounted.
 *
 * ── WHY THIS IS CODE AND NOT A TABLE ──────────────────────────────────────────────────────────
 *
 * `CHARGE_CATEGORIES` is a code-owned invariant: the database CHECK and `billableSource.ts` define
 * it together, and it is explicitly NOT tenant-editable. The SEMANTICS of a category are the same
 * kind of fact as the category itself — "tuition is for a child" is what tuition MEANS, not a
 * preference an organisation gets to invert. Putting it in a table would invite a tenant to declare
 * that tuition is household-grained, and every downstream reader that assumed otherwise would be
 * quietly wrong about whose money it was.
 *
 * So the category layer is declared here, beside the taxonomy it belongs to, and the TENANT layer
 * narrows within it through configuration that already exists. Neither can contradict the other,
 * which is the property the whole design turns on.
 *
 * ── THE TWO-LAYER RULE ───────────────────────────────────────────────────────────────────────
 *
 *   CATEGORY   declares what is semantically PERMITTED           (this file, code-owned)
 *   TEMPLATE   may select, default or NARROW within that set      (per-organisation configuration)
 *
 * A template may say "this field trip is always child-grained" where the category permits child or
 * household. It may not say "this tuition is household-grained", because that contradicts what
 * tuition is. `narrowSubjectGrain` enforces exactly that and reports a contradiction rather than
 * silently resolving it.
 *
 * ── MULTIPLE CHILDREN IS NOT A GRAIN ─────────────────────────────────────────────────────────
 *
 * It is an OPERATION. Selecting two children for a $40 field trip is a selection mode that produces
 * TWO independent child-grained obligations of $40 — never one $80 household charge, and never one
 * row carrying two subject ids. There is deliberately no `CHILD_OR_MULTIPLE_CHILDREN` value here,
 * because a stored grain saying "several children" would be a row whose money belongs to nobody in
 * particular, and every per-child question asked of it afterwards would have no answer.
 */

import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/financials/billableSource";

/**
 * The subject grains a charge may legitimately carry.
 *
 * `CHILD_OR_HOUSEHOLD` exists only where a category genuinely serves both — a one-off charge may be
 * a child's field trip or the household's late-cancellation fee — and is not a way to avoid
 * deciding.
 */
export type SubjectGrain = "CHILD" | "HOUSEHOLD" | "CHILD_OR_HOUSEHOLD";

export type ChargeCategorySemantics = {
    /** What subject grain this category permits. */
    allowedSubjectGrain: SubjectGrain;
    /**
     * Whether a reduction may be applied to a charge in this category.
     *
     * This is ONE HALF of an intersection. A discount applies only when the discount policy permits
     * the category AND the category permits discounting, so neither side can unilaterally override
     * the other. Before this existed only the policy side had a say, so a policy scoped to "fees"
     * reached every non-tuition category — sweeping in late-pickup fees that most organisations
     * would never discount.
     */
    discountable: boolean;
    /** Why, in the operator's terms — shown where an exemption needs explaining. */
    note: string;
};

/**
 * ── THESE ARE SEMANTICS, NOT BUSINESS POLICY ─────────────────────────────────────────────────
 *
 * The line each entry walks: a category is marked non-discountable only when discounting it would
 * be INCOHERENT, never because a typical organisation would not want to. "Late pickup is never
 * discountable" is a business opinion and is deliberately NOT encoded — `late_pickup` is
 * discountable here, and an organisation that exempts it does so through its discount policy's own
 * `applies_to`, which is the tenant's half of the intersection.
 *
 * What IS encoded is incoherence: a discount cannot be discounted, a credit cannot be discounted,
 * and a subsidy offset is a third party's money rather than a price to reduce. Applying a reduction
 * to any of those produces a reduction of a reduction, which no reconciliation can explain.
 */
export const CHARGE_CATEGORY_SEMANTICS: Record<ChargeCategory, ChargeCategorySemantics> = {
    tuition: {
        allowedSubjectGrain: "CHILD",
        discountable: true,
        note: "Tuition is billed for a child's enrolment, so it is always child-grained.",
    },
    deposit: {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: true,
        note: "A deposit may be held for one child's place or for the account.",
    },
    consumable_fee: {
        allowedSubjectGrain: "CHILD",
        discountable: true,
        note: "Consumables are used by a child.",
    },
    late_pickup: {
        allowedSubjectGrain: "CHILD",
        discountable: true,
        note: "A late pickup happens to a child. Whether it may be discounted is the organisation's discount policy to decide.",
    },
    one_time: {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: true,
        note: "A one-off charge may be a child's field trip or the household's own.",
    },
    fee: {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: true,
        note: "Registration and annual fees are charged to a child or to the account, by organisation.",
    },
    discount: {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: false,
        note: "A discount is itself a reduction. Reducing one would be a reduction of a reduction, which no reconciliation can explain.",
    },
    credit: {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: false,
        note: "A credit is money already owed back to the family, not a price to reduce.",
    },
    adjustment: {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: false,
        note: "An adjustment corrects an established position. It inherits its source's grain and is not itself discounted.",
    },
    subsidy_offset: {
        allowedSubjectGrain: "CHILD",
        discountable: false,
        note: "A subsidy offset is a third party's money against one child's obligation, not a price this organisation sets.",
    },
};

/** Semantics for a category key, including a tenant key the declared vocabulary does not know. */
export function chargeCategorySemantics(category: string): ChargeCategorySemantics {
    const known = (CHARGE_CATEGORY_SEMANTICS as Record<string, ChargeCategorySemantics>)[category];
    if (known) return known;
    /*
     * A TENANT'S OWN CATEGORY — `late_pickup_fee` and `registration_fee` are both real and neither
     * is in `CHARGE_CATEGORIES`. The permissive reading is correct here: refusing to discount a
     * category this build does not recognise would silently exempt charges the organisation never
     * exempted, and refusing a grain would block an Add the platform has always allowed.
     */
    return {
        allowedSubjectGrain: "CHILD_OR_HOUSEHOLD",
        discountable: true,
        note: "A category outside the declared vocabulary. Its organisation's discount policy decides.",
    };
}

/** Does this category permit a charge with no child subject — a household-grained row? */
export function categoryPermitsHouseholdGrain(category: string): boolean {
    const g = chargeCategorySemantics(category).allowedSubjectGrain;
    return g === "HOUSEHOLD" || g === "CHILD_OR_HOUSEHOLD";
}

/** Does this category permit a charge attributed to one child? */
export function categoryPermitsChildGrain(category: string): boolean {
    const g = chargeCategorySemantics(category).allowedSubjectGrain;
    return g === "CHILD" || g === "CHILD_OR_HOUSEHOLD";
}

export type GrainNarrowing =
    | { ok: true; grain: SubjectGrain }
    | { ok: false; reason: "contradicts_category"; allowed: SubjectGrain; requested: SubjectGrain };

/**
 * A template's declared grain, checked against what its category permits.
 *
 * NARROWING IS ALLOWED; CONTRADICTING IS NOT. `CHILD_OR_HOUSEHOLD` narrowed to `CHILD` is a
 * template being specific. `CHILD` "narrowed" to `HOUSEHOLD` is a template redefining what its
 * charge type means, and it is REFUSED rather than resolved — because either answer would be a
 * guess about whose money a charge is, and the disagreement is a configuration error somebody needs
 * to see.
 */
export function narrowSubjectGrain(category: string, requested: SubjectGrain | null | undefined): GrainNarrowing {
    const allowed = chargeCategorySemantics(category).allowedSubjectGrain;
    if (!requested) return { ok: true, grain: allowed };
    if (requested === allowed) return { ok: true, grain: allowed };
    if (allowed === "CHILD_OR_HOUSEHOLD") return { ok: true, grain: requested };
    return { ok: false, reason: "contradicts_category", allowed, requested };
}

/**
 * Is a concrete charge's subject legal for its category?
 *
 * `subjectMemberId: null` is HOUSEHOLD GRAIN — not missing data — which is the doctrine the whole
 * subject model rests on.
 */
export function subjectGrainIsLegal(category: string, subjectMemberId: string | null): boolean {
    return subjectMemberId == null
        ? categoryPermitsHouseholdGrain(category)
        : categoryPermitsChildGrain(category);
}

/** Every declared category has semantics — a compile-time-adjacent guarantee, asserted in tests. */
export function declaredCategoriesWithoutSemantics(): string[] {
    return CHARGE_CATEGORIES.filter((c) => !(c in CHARGE_CATEGORY_SEMANTICS));
}
