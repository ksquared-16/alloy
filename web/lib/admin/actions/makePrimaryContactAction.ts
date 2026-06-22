/** Framework action key — primary contact designation is a relationship action, not inline field edit. */
export const MAKE_PRIMARY_CONTACT_ACTION_KEY = "make_primary_contact" as const;

export const MAKE_PRIMARY_CONTACT_ACTION_LABEL = "Make Primary Contact";

/** workflow_events.event_type emitted after household primary contact reassignment. */
export const HOUSEHOLD_PRIMARY_CONTACT_CHANGED_EVENT_TYPE = "household.primary_contact_changed" as const;

export type MakePrimaryContactScopeKind = "household" | "opportunity";

export const MAKE_PRIMARY_CONTACT_SCOPE_LABELS: Record<MakePrimaryContactScopeKind, string> = {
    household: "Household account",
    opportunity: "Open opportunities on this account",
};

export function isMakePrimaryContactActionKey(value: string): boolean {
    return value.trim() === MAKE_PRIMARY_CONTACT_ACTION_KEY;
}
