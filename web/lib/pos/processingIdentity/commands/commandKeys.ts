/**
 * Canonical semantic identity command keys (D0).
 *
 * These are the ONLY keys a Commit Plan operation may reference. Physical /
 * table-oriented keys are explicitly forbidden and rejected by the registry so a
 * plan can never smuggle a raw mutation past the semantic boundary (RFC §7 invariant 1).
 */

export const IDENTITY_COMMAND_KEYS = {
    createPerson: "create_person",
    updatePerson: "update_person",
    createHousehold: "create_household",
    linkPersonToHousehold: "link_person_to_household",
    createChild: "create_child",
    updateChild: "update_child",
    linkChildToHousehold: "link_child_to_household",
    createLead: "create_lead",
    updateLead: "update_lead",
    linkPersonToLead: "link_person_to_lead",
    createProcessParticipation: "create_process_participation",
    updateProcessParticipation: "update_process_participation",
    attachDocument: "attach_document",
    updateCommunicationPreferences: "update_communication_preferences",
    proposeMerge: "propose_merge",
    proposeSafeguardingRestriction: "propose_safeguarding_restriction",
} as const;

export type IdentityCommandKey =
    (typeof IDENTITY_COMMAND_KEYS)[keyof typeof IDENTITY_COMMAND_KEYS];

export const ALL_IDENTITY_COMMAND_KEYS: IdentityCommandKey[] = Object.values(
    IDENTITY_COMMAND_KEYS,
);

/**
 * Command version namespace. A command's version is part of its identity; a
 * version change is a material plan change (D1) that invalidates prior approval.
 */
export const IDENTITY_COMMAND_VERSION = "1" as const;

/**
 * Explicitly forbidden keys. Any of these appearing in a plan operation or command
 * lookup is a hard rejection: Processing must never target physical storage,
 * transitional tables, or arbitrary mutation.
 */
export const FORBIDDEN_COMMAND_KEY_PATTERNS: RegExp[] = [
    /^insert_/i,
    /^update_.*_table$/i,
    /^delete_/i,
    /_row$/i,
    /^execute_sql$/i,
    /^raw_/i,
    /^generic_mutation/i,
    /^update_arbitrary/i,
    /opportunity_customer_members/i,
    /process_instances/i,
    /\bocm\b/i,
    /^create_ocm$/i,
    /^insert_persons$/i,
    /^update_customers$/i,
    /field_values/i,
    /^contacts?$/i,
];

export function isForbiddenCommandKey(key: string): boolean {
    const trimmed = key.trim();
    if (!trimmed) return true;
    return FORBIDDEN_COMMAND_KEY_PATTERNS.some((re) => re.test(trimmed));
}
