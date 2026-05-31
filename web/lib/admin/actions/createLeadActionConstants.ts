/** Sentinel entity_id for create_lead execute API (no target record yet). */
export const CREATE_LEAD_ACTION_ENTITY_ID = "__create_lead__";

export function isCreateLeadExecuteRequest(actionKey: string, entityId: string | null | undefined): boolean {
    const k = actionKey.trim();
    const id = (entityId ?? "").trim();
    return k === "create_lead" && (id === "" || id === CREATE_LEAD_ACTION_ENTITY_ID);
}

/** Alloy enrollment pipeline: Qualification proxy until dedicated status exists. */
export const QUALIFICATION_STATUS_KEY = "contact_attempted";

/** New Lead stage status key (enrollment pipeline). */
export const NEW_LEAD_STATUS_KEY = "new_inquiry";

export const MARK_LOST_VISIBLE_STATUS_KEYS = [
    "new_inquiry",
    "contact_attempted",
    "tour_scheduled",
    "tour_completed",
    "tour_no_show",
    "follow_up_attempted",
    "enrolling",
    "waitlisted",
] as const;
