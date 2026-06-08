/**
 * Default `prefill_field_map` for packet links launched from an opportunity.
 * Paths use `lib/forms/prefill/prefillFieldMap` roots only (trusted server lookups).
 * Child / member-specific fields are omitted here unless `customer_member_id` is known on launch —
 * forms may still define explicit maps on the definition or link body.
 */
export function defaultOpportunityLaunchPrefillFieldMap(): Record<string, string> {
    return {
        guardian_first_name: "person.first_name",
        guardian_last_name: "person.last_name",
        guardian_email: "person.email",
        guardian_phone: "person.phone",
        customer_account_name: "customer.name",
    };
}
