/**
 * Presentation labels for the code-owned charge taxonomy (Financial
 * Configuration Convergence). The categories themselves are invariants owned by
 * `billableSource.ts` (CHARGE_CATEGORIES) — this module only attaches human
 * labels + the conventional GL mapping key each category posts through, so
 * Accounting can render a "Charge Category → GL Mapping → GL Account" chain.
 *
 * Pure / display-only. No new taxonomy, no writes.
 */

import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/financials/billableSource";

export const CHARGE_CATEGORY_LABEL: Record<ChargeCategory, string> = {
    tuition: "Tuition",
    deposit: "Deposit",
    consumable_fee: "Consumable fee",
    late_pickup: "Late pickup",
    one_time: "One-time charge",
    discount: "Discount",
    credit: "Credit",
    adjustment: "Adjustment",
    fee: "Fee",
    subsidy_offset: "Subsidy offset",
};

/**
 * Conventional GL mapping key per charge category. Posting will map a category's
 * charges to the GL account behind this mapping key. Declared here (presentation
 * convention) so Accounting can show the resolved chain before Posting ships.
 */
export const CHARGE_CATEGORY_GL_MAPPING_KEY: Record<ChargeCategory, string> = {
    tuition: "tuition_revenue",
    deposit: "deposit_liability",
    consumable_fee: "consumable_revenue",
    late_pickup: "late_fee_revenue",
    one_time: "other_revenue",
    discount: "discount_contra_revenue",
    credit: "credit_liability",
    adjustment: "adjustment_revenue",
    fee: "fee_revenue",
    subsidy_offset: "subsidy_offset_revenue",
};

/**
 * Description + example per charge category (presentation). Charge categories are
 * code-owned invariants (the DB CHECK + billableSource.ts define them); they are
 * NOT tenant-editable. This metadata makes the vocabulary legible under Financials
 * as code-owned reference configuration. See the Charge Category review in
 * docs/sprints/archive/06_2026/operational_configuration_v1.md.
 */
export const CHARGE_CATEGORY_REFERENCE: Record<ChargeCategory, { description: string; example: string }> = {
    tuition: { description: "Recurring care/service tuition.", example: "Monthly Full-Time Care" },
    deposit: { description: "Refundable or non-refundable deposit held at enrollment.", example: "Enrollment deposit" },
    consumable_fee: { description: "Usage-based consumables.", example: "Diapers / supplies" },
    late_pickup: { description: "Fee for picking up after closing.", example: "Late pickup fee" },
    one_time: { description: "One-off charge tied to an event.", example: "Field trip" },
    discount: { description: "Reduction applied to a charge (contra-revenue).", example: "Sibling discount" },
    credit: { description: "Account credit owed to the family.", example: "Goodwill credit" },
    adjustment: { description: "Manual correction to a charge.", example: "Billing correction" },
    fee: { description: "General non-tuition fee.", example: "Registration / annual supply fee" },
    subsidy_offset: { description: "Reduction covered by a third-party payer.", example: "Agency-funded portion" },
};

/**
 * A CATEGORY, IN LANGUAGE. Never a stored key on an operator's screen.
 *
 * The declared vocabulary answers first. It is not enough on its own: tenants carry categories the
 * catalog does not enumerate — `late_pickup_fee` and `registration_fee` are both real and neither
 * is in `CHARGE_CATEGORIES` — and this used to hand those straight back, so a receipt read
 * "late_pickup_fee" beside the money it settled.
 *
 * Humanising lives HERE rather than in one caller, which is where it used to live: the payment
 * chooser had this rule privately, so the chooser said "Late pickup fee" while the receipt for the
 * very same charge said `late_pickup_fee`. One rule, every surface.
 *
 * `isDeclaredChargeCategory` is the separate question — whether the vocabulary KNOWS this key — for
 * the callers that genuinely need to tell a declared category from a tenant's own.
 */
export function chargeCategoryLabel(category: string): string {
    const known = (CHARGE_CATEGORY_LABEL as Record<string, string>)[category];
    if (known) return known;
    const words = category.replace(/[_-]+/g, " ").trim();
    return words ? words.charAt(0).toUpperCase() + words.slice(1) : category;
}

/**
 * ── THE OPERATOR'S NAME FOR A CHARGE ────────────────────────────────────────────────────────────
 *
 * A description is what a PERSON typed about this charge, and it wins — rewriting somebody's own
 * words to look tidier would be the surface editing the record.
 *
 * But template-created charges are not written by a person. `charge.add` stores the template's own
 * key as the description, so the deployed certification tenant carries rows reading
 *
 *     categoryKey "late_pickup"   categoryLabel "Late pickup"   description "late_pickup_fee"
 *
 * and a payment row said "Move $25.00 from late_pickup_fee". That description is the key wearing a
 * description's clothes; treating it as a person's words puts a stored identifier in front of an
 * operator explaining money to a parent.
 *
 * So a description that IS a machine key — the category's own key, or that key with a trailing
 * `_fee`, or any underscore token the catalog can read aloud — yields to the catalog. Anything a
 * person could have typed still wins, including a description that merely happens to be one word.
 *
 * Internal identity is untouched: nothing here rewrites a stored key or description.
 */
export function chargeDisplayLabel(
    description: string | null | undefined,
    category: string | null | undefined,
    fallback = "Charge",
): string {
    const desc = (description ?? "").trim();
    const cat = (category ?? "").trim();
    const catLabel = cat ? chargeCategoryLabel(cat) : "";

    if (desc && !isMachineKeyDescription(desc, cat)) return desc;
    return catLabel || desc || fallback;
}

/** A description no person typed: the category key itself, or a bare underscore token. */
export function isMachineKeyDescription(
    description: string | null | undefined,
    category?: string | null | undefined,
): boolean {
    const desc = (description ?? "").trim();
    if (!desc) return false;
    const cat = (category ?? "").trim();
    if (cat && (desc === cat || desc === `${cat}_fee`)) return true;
    /*
     * An underscore-joined lowercase token is a key. A sentence, a name, a number and anything with
     * a space are not — a person writing "field trip" writes it with the space.
     */
    return /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(desc);
}

/** Whether the declared vocabulary knows this key, as distinct from whether it can be read aloud. */
export function isDeclaredChargeCategory(category: string): boolean {
    return Boolean((CHARGE_CATEGORY_LABEL as Record<string, string>)[category]);
}

export function listChargeCategories(): {
    key: ChargeCategory;
    label: string;
    mappingKey: string;
    description: string;
    example: string;
}[] {
    return CHARGE_CATEGORIES.map((key) => ({
        key,
        label: CHARGE_CATEGORY_LABEL[key],
        mappingKey: CHARGE_CATEGORY_GL_MAPPING_KEY[key],
        description: CHARGE_CATEGORY_REFERENCE[key].description,
        example: CHARGE_CATEGORY_REFERENCE[key].example,
    }));
}
