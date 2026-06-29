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

export function chargeCategoryLabel(category: string): string {
    return (CHARGE_CATEGORY_LABEL as Record<string, string>)[category] ?? category;
}

export function listChargeCategories(): { key: ChargeCategory; label: string; mappingKey: string }[] {
    return CHARGE_CATEGORIES.map((key) => ({
        key,
        label: CHARGE_CATEGORY_LABEL[key],
        mappingKey: CHARGE_CATEGORY_GL_MAPPING_KEY[key],
    }));
}
