/**
 * Change lead location — Manage command contract.
 *
 * Writes the family default (`opportunities.location_id`). Child site authority
 * remains on each OCM; optional follow-up updates only children that inherit
 * (no owned location_id).
 */

export const CHANGE_LEAD_LOCATION_ACTION_KEY = "change_lead_location" as const;
export const CHANGE_LEAD_LOCATION_FORM_KEY = "change_lead_location" as const;
export const CHANGE_LEAD_LOCATION_LABEL = "Change lead location" as const;

export function isChangeLeadLocationActionKey(key: string | null | undefined): boolean {
    return String(key ?? "").trim() === CHANGE_LEAD_LOCATION_ACTION_KEY;
}

export function isChangeLeadLocationFormKey(formKey: string | null | undefined): boolean {
    return String(formKey ?? "").trim() === CHANGE_LEAD_LOCATION_FORM_KEY;
}

export type InquiryChildLocationRow = {
    id?: string | null;
    ocm_id?: string | null;
    customer_member_id?: string | null;
    location_id?: string | null;
    location_label?: string | null;
    display_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
};

function trimOrNull(value: unknown): string | null {
    if (value == null) return null;
    const text = String(value).trim();
    return text.length > 0 ? text : null;
}

export function childDisplayNameFromInquiryRow(row: InquiryChildLocationRow): string {
    const display = trimOrNull(row.display_name);
    if (display) return display;
    const parts = [trimOrNull(row.first_name), trimOrNull(row.last_name)].filter(Boolean);
    return parts.length > 0 ? parts.join(" ") : "Child";
}

/** Children with no owned site — they display/inherit the lead default. */
export function listInheritingInquiryChildren(
    rows: readonly InquiryChildLocationRow[],
): InquiryChildLocationRow[] {
    return rows.filter((row) => !trimOrNull(row.location_id));
}

export function resolveInquiryChildOcmId(row: InquiryChildLocationRow): string | null {
    const ocm = trimOrNull(row.ocm_id);
    if (ocm) return ocm;
    const id = trimOrNull(row.id);
    // Household-only children use synthetic `unlinked:{customer_member_id}` ids — not OCM rows.
    if (!id || id.startsWith("unlinked:")) return null;
    return id;
}
