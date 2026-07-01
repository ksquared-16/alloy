/**
 * Minimum financial-responsibility shape for P3.3 draft charges.
 *
 * P3.3 introduces NO new responsibility table. The committed enrollment
 * agreement already carries the canonical household/account relationship
 * (`customer_id`) and the child membership (`customer_member_id` / `person_id`).
 * The default responsible party for childcare tuition is the family/account that
 * owns the enrollment. We resolve that here and stamp it on the draft charge's
 * `metadata.responsibility` (a lightweight reference shape).
 *
 * Deferred (documented, NOT built in P3.3):
 *   - split responsibility (multiple payers / percentages)
 *   - subsidy responsibility (agency as payer)
 *   - guardian-specific payer (a particular person rather than the account)
 *   - a first-class `service_agreement` / `responsibility_party` table
 *
 * Pure — no DB, no IO.
 */

export const RESPONSIBILITY_PARTY_TYPES = ["customer", "customer_member"] as const;
export type ResponsibilityPartyType = (typeof RESPONSIBILITY_PARTY_TYPES)[number];

export type ChargeResponsibility = {
    partyType: ResponsibilityPartyType;
    partyId: string;
    /** Why this party was chosen (audit/explainability). */
    basis: "household_account_default" | "customer_member_fallback";
};

export type ResponsibilityAgreementInput = {
    customer_id?: string | null;
    customer_member_id: string;
};

/**
 * Resolve the default responsible party for a draft charge.
 *
 * Prefers the canonical household/account (`customer_id`). Falls back to the
 * child membership (`customer_member_id`) only when no account is denormalized
 * on the agreement, so a draft is always attributable to *something* concrete.
 */
export function resolveChargeResponsibility(
    agreement: ResponsibilityAgreementInput
): ChargeResponsibility {
    const customerId = agreement.customer_id?.trim();
    if (customerId) {
        return { partyType: "customer", partyId: customerId, basis: "household_account_default" };
    }
    return {
        partyType: "customer_member",
        partyId: agreement.customer_member_id,
        basis: "customer_member_fallback",
    };
}
