/**
 * Shared helpers for the people module (contacts, customer_members, persons).
 * Use for display names, person links, and compatibility badges without duplicating logic.
 */

/** Record that may have person-related fields (from entity GET or list row). */
export type RecordWithPerson = Record<string, unknown> & {
    _person_id?: string | null;
    _person_name?: string | null;
    first_name?: string | null;
    last_name?: string | null;
    display_name?: string | null;
};

/**
 * Resolve display name from a contact, member, or person record.
 * Prefers _person_name, then display_name, then first_name + last_name, then id prefix.
 */
export function getPeopleDisplayName(row: RecordWithPerson | null | undefined): string {
    if (!row) return "—";
    const personName = row._person_name;
    if (personName && typeof personName === "string" && personName.trim()) return personName.trim();
    const display = row.display_name;
    if (display && typeof display === "string" && display.trim()) return display.trim();
    const first = row.first_name ?? "";
    const last = row.last_name ?? "";
    const name = [first, last].filter(Boolean).join(" ").trim();
    if (name) return name;
    const id = row.id;
    if (id && typeof id === "string") return id.slice(0, 8) + "…";
    return "—";
}

/**
 * Return the canonical person id if the record is linked to a person.
 */
export function getPersonId(row: RecordWithPerson | null | undefined): string | null {
    if (!row) return null;
    const id = row._person_id;
    return id && typeof id === "string" && id.trim() ? id.trim() : null;
}

/**
 * Return the canonical person display name if the record is linked to a person.
 */
export function getPersonName(row: RecordWithPerson | null | undefined): string | null {
    if (!row) return null;
    const name = row._person_name;
    return name && typeof name === "string" && name.trim() ? name.trim() : null;
}

/**
 * Whether this record has a linked canonical person (so we can show "View person").
 */
export function hasPersonLink(row: RecordWithPerson | null | undefined): boolean {
    return !!getPersonId(row);
}
