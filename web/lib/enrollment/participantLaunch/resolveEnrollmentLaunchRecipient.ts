/**
 * WHO AN ENROLLMENT PACKET IS ADDRESSED TO — and therefore who may pay from it.
 *
 * The participant link carries `metadata.recipient_person_id`, and the participant payment route
 * treats that value as the payer: no recipient, no payer, no payment. Start Enrollment minted its
 * links without one, so every canonical Enrollment link was payerless, and the launch preview read
 * the obsolete `customers.primary_contact_id` (written by nothing live) to name a recipient it never
 * recorded.
 *
 * The recipient is the household's canonical primary contact — the `customer_persons` row with
 * `role_type = primary_contact`, read by the one existing reader for it. That person is, by
 * construction, in the allowed set the opportunity launch validates recipients against (opportunity
 * primary person, selected child's person, household primary contact), so this grants nobody a reach
 * the operator path does not already grant.
 *
 * Nothing here chooses SOMEBODY ELSE when there is no primary contact. A household with no primary
 * contact gets a refusal the operator can act on, never a guessed guardian: a guessed recipient would
 * become a payer, and a payer is who a receipt is posted under.
 *
 * Preview and launch call this same function, so what the operator is shown is what the link records.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
    HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE,
    resolveCustomerHouseholdPrimaryContactPersonId,
} from "@/lib/admin/person/householdPrimaryContact";

export type EnrollmentLaunchRecipient = {
    readonly personId: string;
    readonly name: string | null;
};

export type EnrollmentLaunchRecipientRefusal =
    | { readonly code: "no_household"; readonly detail: string }
    | { readonly code: "no_primary_contact"; readonly detail: string }
    | { readonly code: "recipient_not_in_household"; readonly detail: string };

export type EnrollmentLaunchRecipientResult =
    | { readonly ok: true; readonly value: EnrollmentLaunchRecipient }
    | { readonly ok: false; readonly refusal: EnrollmentLaunchRecipientRefusal };

export const NO_PRIMARY_CONTACT_DETAIL =
    "This household has no primary contact, so the enrollment packet has no one to be sent to and " +
    "no one who could pay its fees. Add a primary contact to the household, then send the packet.";

export async function resolveEnrollmentLaunchRecipient(
    supabase: SupabaseClient,
    input: { readonly orgId: string; readonly customerId: string | null | undefined },
): Promise<EnrollmentLaunchRecipientResult> {
    const customerId = (input.customerId ?? "").trim();
    if (!customerId) {
        return {
            ok: false,
            refusal: { code: "no_household", detail: "This child belongs to no household, so the packet has no recipient." },
        };
    }

    const personId = await resolveCustomerHouseholdPrimaryContactPersonId(supabase, input.orgId, customerId);
    if (!personId) return { ok: false, refusal: { code: "no_primary_contact", detail: NO_PRIMARY_CONTACT_DETAIL } };

    /*
     * Membership, re-proven against THIS household and THIS org, and the person still existing. The
     * reader above is household-scoped already; this is the check a recipient is held to wherever it
     * is used, stated here rather than assumed from how the reader happens to be written today.
     */
    const [{ data: link }, { data: person }] = await Promise.all([
        supabase
            .from("customer_persons")
            .select("person_id")
            .eq("org_id", input.orgId)
            .eq("customer_id", customerId)
            .eq("person_id", personId)
            .eq("role_type", HOUSEHOLD_PRIMARY_CONTACT_ROLE_TYPE)
            .limit(1)
            .maybeSingle(),
        supabase
            .from("persons")
            .select("id, first_name, last_name")
            .eq("org_id", input.orgId)
            .eq("id", personId)
            .maybeSingle(),
    ]);
    if (!link || !person) {
        return {
            ok: false,
            refusal: {
                code: "recipient_not_in_household",
                detail: "The household's primary contact could not be confirmed as a member of this household.",
            },
        };
    }

    const p = person as { first_name?: string | null; last_name?: string | null };
    const name = [p.first_name, p.last_name].map((x) => (x ?? "").trim()).filter(Boolean).join(" ") || null;
    return { ok: true, value: { personId, name } };
}
