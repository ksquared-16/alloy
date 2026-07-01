/** Sentinel entity_id for create_lead execute API (no target record yet). */
export const CREATE_LEAD_ACTION_ENTITY_ID = "__create_lead__";

export function isCreateLeadExecuteRequest(actionKey: string, entityId: string | null | undefined): boolean {
    const k = actionKey.trim();
    const id = (entityId ?? "").trim();
    return k === "create_lead" && (id === "" || id === CREATE_LEAD_ACTION_ENTITY_ID);
}

/** Default Lead/Opportunity case container status (not enrollment pipeline). */
export const DEFAULT_LEAD_CASE_STATUS_KEY = "open";

/** New Lead stage status key (enrollment pipeline / OCM). */
export const NEW_LEAD_STATUS_KEY = "new_inquiry";

export {
    QUALIFICATION_STATUS_KEY,
    LEGACY_CONTACT_ATTEMPTED_STATUS_KEY,
    MARK_LOST_VISIBLE_STATUS_KEYS,
} from "@/lib/admin/actions/universalActionConstants";
