/** Canonical client routing for Add Person (capture-first; no lifecycle preflight). */

export const ADMINV2_OPEN_ADD_PERSON_MODAL = "adminv2:open-add-person-modal" as const;

export type OpenAddPersonModalDetail = {
    opportunity_id?: string | null;
    customer_id?: string | null;
    /** Registry action key when opened from placements. */
    action_key?: string;
    entity_type?: "opportunity" | "customer";
};

export const ADD_PERSON_ACTION_KEYS = ["add_family_member", "add_related_person"] as const;

export type AddPersonActionKey = (typeof ADD_PERSON_ACTION_KEYS)[number];

export function isAddPersonActionKey(actionKey: string): boolean {
    const k = actionKey.trim();
    return (ADD_PERSON_ACTION_KEYS as readonly string[]).includes(k);
}

export function isAddPersonFormKey(formKey: string): boolean {
    const fk = formKey.trim();
    return fk === "add_person" || fk === "add_family_member" || fk === "add_related_person";
}

export function resolveAddPersonActionKey(input: {
    actionKey?: string | null;
    formKey?: string | null;
}): AddPersonActionKey {
    const fromKey = input.actionKey?.trim();
    if (fromKey === "add_related_person") return "add_related_person";
    if (fromKey === "add_family_member") return "add_family_member";
    const fk = input.formKey?.trim();
    if (fk === "add_related_person") return "add_related_person";
    return "add_family_member";
}

export function dispatchOpenAddPersonModal(detail: OpenAddPersonModalDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id?.trim() || "";
    const customerId = detail.customer_id?.trim() || "";
    if (!opportunityId && !customerId) return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_ADD_PERSON_MODAL, {
            detail: {
                opportunity_id: opportunityId || null,
                customer_id: customerId || null,
                action_key: detail.action_key,
                entity_type: detail.entity_type,
            },
        })
    );
}

export function parseOpenAddPersonModalDetail(ev: Event): OpenAddPersonModalDetail | null {
    const ce = ev as CustomEvent<OpenAddPersonModalDetail>;
    const d = ce.detail;
    if (!d || typeof d !== "object") return null;
    const opportunityId = typeof d.opportunity_id === "string" ? d.opportunity_id.trim() : "";
    const customerId = typeof d.customer_id === "string" ? d.customer_id.trim() : "";
    if (!opportunityId && !customerId) return null;
    return {
        opportunity_id: opportunityId || null,
        customer_id: customerId || null,
        action_key: typeof d.action_key === "string" ? d.action_key.trim() : undefined,
        entity_type:
            d.entity_type === "customer" ? "customer" : opportunityId ? "opportunity" : undefined,
    };
}

/** Narrow optional add-person event opportunity id for drawer matching. */
export function narrowedAddPersonOpportunityId(detail: OpenAddPersonModalDetail): string {
    return detail.opportunity_id?.trim() ?? "";
}
