/**
 * ONE VOCABULARY FOR WHAT A DOCUMENT IS ATTACHED TO.
 *
 * `documents.entity_type` has been written in two spellings. The upload route canonicalises to the
 * singular (`opportunity`, `customer_member`, `person`); older readers — and the access decision —
 * spoke the plural (`opportunities`, `persons`). The access decision kept a list of the plurals it
 * could scope, so every row the upload route had ever written fell outside that list, and the
 * relationship-scope branch it guarded never ran for a real document (D0 C4; deployed census
 * 2026-10-20: 231 `customer_member`, 4 `person`, 44 unattached, no plural at all).
 *
 * Every reader that DECIDES something from the stored value canonicalises through here first, so the
 * spelling a row happens to carry can no longer change what the decision is.
 */
export const CANONICAL_DOCUMENT_ENTITY_TYPE: Readonly<Record<string, string>> = Object.freeze({
    customers: "customer",
    customer: "customer",
    contacts: "contact",
    contact: "contact",
    opportunities: "opportunity",
    opportunity: "opportunity",
    jobs: "job",
    job: "job",
    locations: "location",
    location: "location",
    customer_members: "customer_member",
    customer_member: "customer_member",
    vendors: "vendor",
    vendor: "vendor",
    persons: "person",
    person: "person",
    schedules: "schedule",
    schedule: "schedule",
});

/**
 * The singular canonical type for a stored or submitted value.
 *
 * Unknown values are returned trimmed and lower-cased rather than dropped: a decision must still see
 * that the row names SOMETHING, so it can refuse it, instead of mistaking it for an unattached
 * document.
 */
export function canonicalDocumentEntityType(raw: unknown): string | null {
    if (raw == null) return null;
    const key = String(raw).trim().toLowerCase();
    if (!key) return null;
    return CANONICAL_DOCUMENT_ENTITY_TYPE[key] ?? key;
}
