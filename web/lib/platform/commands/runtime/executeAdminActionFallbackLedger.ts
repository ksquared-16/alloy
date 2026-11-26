/**
 * P9 — executeAdminAction fallback disposition ledger.
 *
 * Classifies keys that may still reach the compatibility path on
 * POST /api/admin/actions/execute when Command Runtime facade is not enabled.
 * Does not invent executors. Does not delete live branches without traffic evidence.
 */

export type ExecuteAdminActionFallbackDisposition =
    | "migrated"
    | "direct_domain_compatibility"
    | "configuration_maintenance"
    | "navigation_workflow"
    | "placeholder"
    | "unsupported"
    | "retire";

export type ExecuteAdminActionFallbackLedgerEntry = {
    key: string;
    disposition: ExecuteAdminActionFallbackDisposition;
    /** Short operator/engineering note — not shown in product UI. */
    note: string;
};

/**
 * Known identities that still matter for fallback drain measurement.
 * `migrated` keys should not hit route fallback when facade gate is correct;
 * they remain listed so tests catch regressions.
 */
export const EXECUTE_ADMIN_ACTION_FALLBACK_LEDGER: readonly ExecuteAdminActionFallbackLedgerEntry[] = [
    // Migrated via Command Runtime (route should not fallback)
    { key: "create_lead", disposition: "migrated", note: "RegisteredAction facade; wrapper may still call executeAdminAction internally" },
    { key: "update_status", disposition: "migrated", note: "RegisteredAction facade" },
    { key: "confirm_tour", disposition: "migrated", note: "RegisteredAction facade; wrapper may still call executeAdminAction internally" },
    { key: "update_lead_status", disposition: "migrated", note: "Mutation adapter" },
    { key: "close_lead", disposition: "migrated", note: "Mutation adapter" },
    { key: "waitlist_child", disposition: "migrated", note: "Mutation adapter" },
    { key: "enroll_child", disposition: "migrated", note: "Mutation adapter" },
    { key: "update_child_enrollment_status", disposition: "migrated", note: "Mutation adapter" },
    { key: "add_parent_guardian", disposition: "migrated", note: "Relationship adapter" },
    { key: "link_existing_person", disposition: "migrated", note: "Relationship adapter" },
    { key: "add_emergency_contact", disposition: "migrated", note: "Relationship adapter" },
    { key: "add_authorized_pickup", disposition: "migrated", note: "Relationship adapter" },
    { key: "add_billing_contact", disposition: "migrated", note: "Relationship adapter" },
    { key: "add_child", disposition: "migrated", note: "Relationship adapter" },
    { key: "link_existing_child", disposition: "migrated", note: "Relationship adapter" },
    { key: "make_primary_contact", disposition: "migrated", note: "Destructive facade" },
    { key: "delete_lead", disposition: "migrated", note: "Destructive facade" },
    { key: "cancel_tour", disposition: "migrated", note: "Destructive facade" },
    { key: "reschedule_tour", disposition: "migrated", note: "Tour facade" },
    { key: "complete_tour", disposition: "migrated", note: "Tour facade" },
    { key: "no_show_tour", disposition: "migrated", note: "Tour facade" },
    { key: "mark_tour_no_show", disposition: "migrated", note: "Alias → no_show_tour facade" },

    // Intentional compatibility — do not delete without traffic zero
    { key: "mark_lost", disposition: "direct_domain_compatibility", note: "Force-lost distinct from close_lead" },
    { key: "move_to_waitlist", disposition: "migrated", note: "Alias of waitlist_child; family-context facade → child Enrollment outcome progression" },
    { key: "approve_enrollment", disposition: "direct_domain_compatibility", note: "Alias debt vs enroll_child; handoff logic" },
    { key: "move_to_qualification", disposition: "direct_domain_compatibility", note: "Lifecycle status branch without mutation twin" },
    { key: "record_tour_outcome", disposition: "direct_domain_compatibility", note: "Tour residual beside terminal facade keys" },
    { key: "schedule_tour", disposition: "direct_domain_compatibility", note: "Modals/APIs primary; execute path legacy metadata" },
    { key: "add_family_member", disposition: "direct_domain_compatibility", note: "Capture-first relationship hub" },
    { key: "add_related_person", disposition: "direct_domain_compatibility", note: "Capture-first relationship hub" },
    { key: "add_person", disposition: "direct_domain_compatibility", note: "Capture-first person add" },
    { key: "add_sibling", disposition: "direct_domain_compatibility", note: "Partial; overlaps add_child" },
    { key: "update_enrollment_status", disposition: "direct_domain_compatibility", note: "Legacy status form path" },
    { key: "change_lead_location", disposition: "direct_domain_compatibility", note: "Manage modal; family default location PATCH" },
    { key: "update_status_add_note", disposition: "direct_domain_compatibility", note: "Legacy combined status+note" },
    { key: "mark_won", disposition: "direct_domain_compatibility", note: "Legacy enrollment overlap" },
    { key: "quick_message", disposition: "direct_domain_compatibility", note: "Partial admin_action composer" },
    { key: "send_form", disposition: "direct_domain_compatibility", note: "Partial form host" },
    { key: "send_enrollment_packet", disposition: "direct_domain_compatibility", note: "Partial packet send" },
    { key: "add_note", disposition: "direct_domain_compatibility", note: "open_form note append" },
    { key: "append_note", disposition: "direct_domain_compatibility", note: "Note submit path" },

    // Navigation / workflow / config
    { key: "open_record", disposition: "navigation_workflow", note: "Navigation only" },
    { key: "ask_bos", disposition: "navigation_workflow", note: "UI capability" },
    { key: "configuration.maintenance", disposition: "configuration_maintenance", note: "Outside org Command catalog" },

    // Placeholder / unsupported / retire
    { key: "reopen_lead", disposition: "placeholder", note: "Contract only until executor exists" },
    { key: "reopen_tour", disposition: "placeholder", note: "Contract only; recovery via new Schedule Tour" },
    { key: "archive_lead", disposition: "unsupported", note: "Commit disabled / unavailable" },
    { key: "withdraw_child", disposition: "unsupported", note: "Unavailable until domain adapter" },
    { key: "send_message", disposition: "unsupported", note: "No dedicated executor" },
    { key: "qualify_opportunity", disposition: "unsupported", note: "Unavailable" },
    { key: "start_quote", disposition: "unsupported", note: "Unavailable" },
    { key: "create_inquiry", disposition: "unsupported", note: "Unavailable" },
    { key: "contact_attempted", disposition: "retire", note: "Action placements disabled; status stamp residual" },
] as const;

const BY_KEY = new Map(
    EXECUTE_ADMIN_ACTION_FALLBACK_LEDGER.map((e) => [e.key, e] as const)
);

export function getExecuteAdminActionFallbackDisposition(
    actionKey: string
): ExecuteAdminActionFallbackLedgerEntry {
    const key = actionKey.trim();
    const known = BY_KEY.get(key);
    if (known) return known;
    return {
        key,
        disposition: "direct_domain_compatibility",
        note: "Unlisted DB definition — treat as intentional compatibility until classified",
    };
}

export function listFallbackLedgerByDisposition(
    disposition: ExecuteAdminActionFallbackDisposition
): ExecuteAdminActionFallbackLedgerEntry[] {
    return EXECUTE_ADMIN_ACTION_FALLBACK_LEDGER.filter((e) => e.disposition === disposition);
}

/** Keys that must not be deleted from executeAdminAction without explicit zero-traffic evidence. */
export function listIntentionalCompatibilityFallbackKeys(): string[] {
    return EXECUTE_ADMIN_ACTION_FALLBACK_LEDGER.filter(
        (e) =>
            e.disposition === "direct_domain_compatibility" ||
            e.disposition === "navigation_workflow" ||
            e.disposition === "configuration_maintenance"
    ).map((e) => e.key);
}
