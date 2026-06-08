/** Canonical client routing for Add Child / Add Sibling (capture-first; no execute preflight). */

export const ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL = "adminv2:open-add-inquiry-child-modal" as const;

export type AddInquiryChildModalMode = "child" | "sibling";

export type OpenAddInquiryChildModalDetail = {
    opportunity_id: string;
    mode: AddInquiryChildModalMode;
    /** Registry action key when opened from placements. */
    action_key?: string;
};

export function isAddInquiryChildActionKey(actionKey: string): boolean {
    const k = actionKey.trim();
    return k === "add_child" || k === "add_sibling";
}

export function isAddInquiryChildFormKey(formKey: string): boolean {
    return formKey.trim() === "add_inquiry_child";
}

export function resolveAddInquiryChildMode(input: {
    actionKey?: string | null;
    formMode?: string | null;
    payloadMode?: string | null;
}): AddInquiryChildModalMode {
    const fromKey = input.actionKey?.trim();
    if (fromKey === "add_sibling") return "sibling";
    if (fromKey === "add_child") return "child";
    const mode = (input.formMode ?? input.payloadMode ?? "").trim();
    if (mode === "sibling") return "sibling";
    return "child";
}

export function dispatchOpenAddInquiryChildModal(detail: OpenAddInquiryChildModalDetail): void {
    if (typeof window === "undefined") return;
    const opportunityId = detail.opportunity_id.trim();
    if (!opportunityId) return;
    window.dispatchEvent(
        new CustomEvent(ADMINV2_OPEN_ADD_INQUIRY_CHILD_MODAL, {
            detail: {
                opportunity_id: opportunityId,
                mode: detail.mode,
                action_key: detail.action_key,
            },
        })
    );
}

export function parseOpenAddInquiryChildModalDetail(ev: Event): OpenAddInquiryChildModalDetail | null {
    const ce = ev as CustomEvent<OpenAddInquiryChildModalDetail>;
    const d = ce.detail;
    if (!d || typeof d !== "object") return null;
    const opportunityId = typeof d.opportunity_id === "string" ? d.opportunity_id.trim() : "";
    if (!opportunityId) return null;
    const mode = d.mode === "sibling" ? "sibling" : "child";
    return {
        opportunity_id: opportunityId,
        mode,
        action_key: typeof d.action_key === "string" ? d.action_key.trim() : undefined,
    };
}
