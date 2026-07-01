/** Framework action key — add emergency contact scoped to child customer_member(s). */
export const ADD_EMERGENCY_CONTACT_ACTION_KEY = "add_emergency_contact" as const;

export const ADD_EMERGENCY_CONTACT_ACTION_LABEL = "Add Emergency Contact";

/** workflow_events.event_type emitted after child-scoped emergency contact link write. */
export const EMERGENCY_CONTACT_ADDED_EVENT_TYPE = "relationship.emergency_contact_added" as const;

export function isAddEmergencyContactActionKey(value: string): boolean {
    return value.trim() === ADD_EMERGENCY_CONTACT_ACTION_KEY;
}
